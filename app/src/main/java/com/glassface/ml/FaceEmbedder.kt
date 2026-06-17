package com.glassface.ml

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class FaceEmbedder(private val context: Context) {

    private var interpreter: Interpreter? = null
    private val inputSize = 112
    private val embeddingSize = 128

    init {
        loadModel()
    }

    private fun loadModel() {
        try {
            val model = loadModelFile()
            val options = Interpreter.Options().apply {
                setNumThreads(4)
            }
            interpreter = Interpreter(model, options)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun loadModelFile(): MappedByteBuffer {
        val assetFileDescriptor = context.assets.openFd("mobile_face_net.tflite")
        val inputStream = FileInputStream(assetFileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = assetFileDescriptor.startOffset
        val declaredLength = assetFileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }

    fun getEmbedding(bitmap: Bitmap): FloatArray {
        val interp = interpreter ?: return FloatArray(embeddingSize)

        val resized = Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
        val inputBuffer = bitmapToByteBuffer(resized)

        val output = Array(1) { FloatArray(embeddingSize) }
        interp.run(inputBuffer, output)

        return output[0]
    }

    private fun bitmapToByteBuffer(bitmap: Bitmap): ByteBuffer {
        val byteBuffer = ByteBuffer.allocateDirect(4 * inputSize * inputSize * 3)
        byteBuffer.order(ByteOrder.nativeOrder())

        val pixels = IntArray(inputSize * inputSize)
        bitmap.getPixels(pixels, 0, inputSize, 0, 0, inputSize, inputSize)

        for (pixel in pixels) {
            val r = ((pixel shr 16) and 0xFF).toFloat()
            val g = ((pixel shr 8) and 0xFF).toFloat()
            val b = (pixel and 0xFF).toFloat()
            // Normalize to [-1, 1]
            byteBuffer.putFloat((r - 128f) / 128f)
            byteBuffer.putFloat((g - 128f) / 128f)
            byteBuffer.putFloat((b - 128f) / 128f)
        }

        byteBuffer.rewind()
        return byteBuffer
    }

    fun close() {
        interpreter?.close()
        interpreter = null
    }
}
