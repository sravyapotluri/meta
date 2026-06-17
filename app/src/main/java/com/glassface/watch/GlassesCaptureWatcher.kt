package com.glassface.watch

import android.content.Context
import android.graphics.BitmapFactory
import android.os.FileObserver
import android.util.Log
import com.glassface.db.PersonDao
import com.glassface.ml.FaceEmbedder
import com.glassface.ml.FaceMatcher
import com.glassface.tts.GlassesTTSManager
import com.glassface.util.EmbeddingUtils
import com.glassface.util.ImageUtils
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File

/**
 * Watches a folder (where Ray-Ban Meta glasses sync photos via Meta View) for new image files.
 * When a new image appears, it runs face recognition and speaks the result through the glasses
 * speakers via TTS.
 *
 * Default watch path: /sdcard/DCIM/Camera  (Meta View syncs glasses photos here)
 * User can override with a custom path in settings.
 */
class GlassesCaptureWatcher(
    private val context: Context,
    private val personDao: PersonDao,
    private val ttsManager: GlassesTTSManager,
    watchPath: String = DEFAULT_WATCH_PATH
) {

    companion object {
        const val DEFAULT_WATCH_PATH = "/sdcard/DCIM/Camera"
        private const val TAG = "GlassesCaptureWatcher"
        private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp")
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var fileObserver: FileObserver? = null
    private val watchDir = File(watchPath)
    private var onResultCallback: ((String) -> Unit)? = null

    fun setOnResultListener(callback: (String) -> Unit) {
        onResultCallback = callback
    }

    fun start() {
        if (!watchDir.exists()) {
            Log.w(TAG, "Watch directory does not exist: ${watchDir.absolutePath}")
            return
        }

        fileObserver = object : FileObserver(watchDir.absolutePath, CREATE or MOVED_TO) {
            override fun onEvent(event: Int, path: String?) {
                if (path == null) return
                val ext = path.substringAfterLast('.', "").lowercase()
                if (ext in IMAGE_EXTENSIONS) {
                    val imageFile = File(watchDir, path)
                    // Short delay to ensure file is fully written before reading
                    Thread.sleep(500)
                    processNewImage(imageFile)
                }
            }
        }
        fileObserver?.startWatching()
        Log.d(TAG, "Watching for new glasses photos in: ${watchDir.absolutePath}")
        ttsManager.speak("Glasses capture mode active. Tap glasses camera button to identify someone.")
    }

    fun stop() {
        fileObserver?.stopWatching()
        fileObserver = null
        Log.d(TAG, "Stopped watching for glasses photos")
    }

    private fun processNewImage(file: File) {
        scope.launch {
            try {
                val bitmap = BitmapFactory.decodeFile(file.absolutePath) ?: return@launch

                val options = FaceDetectorOptions.Builder()
                    .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                    .build()
                val detector = FaceDetection.getClient(options)
                val inputImage = InputImage.fromBitmap(bitmap, 0)

                detector.process(inputImage)
                    .addOnSuccessListener { faces ->
                        detector.close()
                        if (faces.isEmpty()) {
                            ttsManager.speak("No face detected in photo.")
                            onResultCallback?.invoke("No face detected")
                            return@addOnSuccessListener
                        }

                        scope.launch {
                            val face = faces.first()
                            val cropped = ImageUtils.cropFace(bitmap, face.boundingBox, 0.2f)
                            if (cropped == null) {
                                ttsManager.speak("Could not process face.")
                                return@launch
                            }

                            val embedder = FaceEmbedder(context)
                            val embedding = embedder.getEmbedding(cropped)
                            embedder.close()

                            val matcher = FaceMatcher(personDao)
                            val match = matcher.findBestMatch(embedding)

                            if (match != null) {
                                val person = personDao.getPersonById(match.personId)
                                if (person != null) {
                                    ttsManager.announceRecognition(person)
                                    val resultText = buildResultText(person, match.similarity)
                                    onResultCallback?.invoke(resultText)
                                }
                            } else {
                                ttsManager.speak("Person not recognized.")
                                onResultCallback?.invoke("Unknown person")
                            }
                        }
                    }
                    .addOnFailureListener { e ->
                        detector.close()
                        Log.e(TAG, "Face detection failed", e)
                        ttsManager.speak("Error processing photo.")
                    }
            } catch (e: Exception) {
                Log.e(TAG, "Error processing image file: ${file.name}", e)
            }
        }
    }

    private fun buildResultText(person: com.glassface.db.Person, similarity: Float): String {
        val conf = (similarity * 100).toInt()
        return when {
            person.title.isNotBlank() && person.company.isNotBlank() ->
                "${person.name} — ${person.title} at ${person.company} ($conf%)"
            person.title.isNotBlank() -> "${person.name} — ${person.title} ($conf%)"
            person.company.isNotBlank() -> "${person.name} — ${person.company} ($conf%)"
            else -> "${person.name} ($conf%)"
        }
    }
}
