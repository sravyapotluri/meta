package com.glassface.camera

import android.content.Context
import android.graphics.RectF
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.glassface.db.AppDatabase
import com.glassface.db.Person
import com.glassface.db.PersonDao
import com.glassface.ml.FaceEmbedder
import com.glassface.ml.FaceMatcher
import com.glassface.tts.GlassesTTSManager
import com.glassface.util.ImageUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

data class RecognitionResult(
    val boundingBox: RectF,
    val name: String,
    val confidence: Float,
    val personId: Long
)

class FaceAnalyzer(
    private val context: Context,
    private val personDao: PersonDao,
    private val ttsManager: GlassesTTSManager,
    private val onResults: (List<RecognitionResult>, Int, Int) -> Unit
) : ImageAnalysis.Analyzer {

    private val detector: FaceDetector
    private val embedder: FaceEmbedder
    private val matcher: FaceMatcher
    private val isProcessing = AtomicBoolean(false)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Cooldown: track last announcement time per person
    private val lastAnnouncedTime = mutableMapOf<Long, Long>()
    private val announceCooldownMs = 5000L

    init {
        val options = FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setMinFaceSize(0.1f)
            .build()
        detector = FaceDetection.getClient(options)
        embedder = FaceEmbedder(context)
        matcher = FaceMatcher(personDao)
    }

    override fun analyze(imageProxy: ImageProxy) {
        if (!isProcessing.compareAndSet(false, true)) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            isProcessing.set(false)
            return
        }

        val rotationDegrees = imageProxy.imageInfo.rotationDegrees
        val inputImage = InputImage.fromMediaImage(mediaImage, rotationDegrees)
        val imageWidth = imageProxy.width
        val imageHeight = imageProxy.height

        detector.process(inputImage)
            .addOnSuccessListener { faces ->
                if (faces.isEmpty()) {
                    onResults(emptyList(), imageWidth, imageHeight)
                    imageProxy.close()
                    isProcessing.set(false)
                    return@addOnSuccessListener
                }

                scope.launch {
                    val bitmap = InputImage.fromMediaImage(mediaImage, rotationDegrees).let {
                        ImageUtils.imageProxyToBitmap(imageProxy, rotationDegrees)
                    }

                    val results = mutableListOf<RecognitionResult>()

                    for (face in faces) {
                        val boundingBox = face.boundingBox
                        val faceBitmap = if (bitmap != null) {
                            ImageUtils.cropFace(bitmap, boundingBox, 0.2f)
                        } else null

                        if (faceBitmap != null) {
                            val embedding = embedder.getEmbedding(faceBitmap)
                            val match = matcher.findBestMatch(embedding)

                            val rectF = RectF(
                                boundingBox.left.toFloat(),
                                boundingBox.top.toFloat(),
                                boundingBox.right.toFloat(),
                                boundingBox.bottom.toFloat()
                            )

                            if (match != null) {
                                results.add(
                                    RecognitionResult(
                                        boundingBox = rectF,
                                        name = match.name,
                                        confidence = match.similarity,
                                        personId = match.personId
                                    )
                                )
                                // TTS announcement with cooldown
                                val now = System.currentTimeMillis()
                                val lastTime = lastAnnouncedTime[match.personId] ?: 0L
                                if (now - lastTime > announceCooldownMs) {
                                    lastAnnouncedTime[match.personId] = now
                                    val person = personDao.getPersonById(match.personId)
                                    if (person != null) {
                                        ttsManager.announceRecognition(person)
                                    }
                                }
                            } else {
                                results.add(
                                    RecognitionResult(
                                        boundingBox = rectF,
                                        name = "Unknown",
                                        confidence = 0f,
                                        personId = -1L
                                    )
                                )
                            }
                        } else {
                            val rectF = RectF(
                                boundingBox.left.toFloat(),
                                boundingBox.top.toFloat(),
                                boundingBox.right.toFloat(),
                                boundingBox.bottom.toFloat()
                            )
                            results.add(
                                RecognitionResult(
                                    boundingBox = rectF,
                                    name = "Unknown",
                                    confidence = 0f,
                                    personId = -1L
                                )
                            )
                        }
                    }

                    val srcWidth = if (rotationDegrees == 90 || rotationDegrees == 270) imageHeight else imageWidth
                    val srcHeight = if (rotationDegrees == 90 || rotationDegrees == 270) imageWidth else imageHeight
                    onResults(results, srcWidth, srcHeight)
                    imageProxy.close()
                    isProcessing.set(false)
                }
            }
            .addOnFailureListener {
                onResults(emptyList(), imageWidth, imageHeight)
                imageProxy.close()
                isProcessing.set(false)
            }
    }

    fun close() {
        detector.close()
        embedder.close()
    }
}
