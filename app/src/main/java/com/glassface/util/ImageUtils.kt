package com.glassface.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.Rect
import androidx.camera.core.ImageProxy
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.math.max
import kotlin.math.min

object ImageUtils {

    fun rotateBitmap(bitmap: Bitmap, degrees: Int): Bitmap {
        if (degrees == 0) return bitmap
        val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    fun cropFace(bitmap: Bitmap, boundingBox: Rect, padding: Float = 0.2f): Bitmap? {
        val paddingX = (boundingBox.width() * padding).toInt()
        val paddingY = (boundingBox.height() * padding).toInt()

        val left = max(0, boundingBox.left - paddingX)
        val top = max(0, boundingBox.top - paddingY)
        val right = min(bitmap.width, boundingBox.right + paddingX)
        val bottom = min(bitmap.height, boundingBox.bottom + paddingY)

        val width = right - left
        val height = bottom - top

        if (width <= 0 || height <= 0) return null

        return try {
            Bitmap.createBitmap(bitmap, left, top, width, height)
        } catch (e: Exception) {
            null
        }
    }

    fun saveBitmapToFile(context: Context, bitmap: Bitmap, filename: String): String {
        val dir = context.filesDir
        val file = File(dir, filename)
        return try {
            FileOutputStream(file).use { out ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
            }
            file.absolutePath
        } catch (e: IOException) {
            ""
        }
    }

    fun loadBitmapFromPath(path: String): Bitmap? {
        return try {
            BitmapFactory.decodeFile(path)
        } catch (e: Exception) {
            null
        }
    }

    fun imageProxyToBitmap(imageProxy: ImageProxy, rotationDegrees: Int): Bitmap? {
        return try {
            val yBuffer = imageProxy.planes[0].buffer
            val uBuffer = imageProxy.planes[1].buffer
            val vBuffer = imageProxy.planes[2].buffer

            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()

            val nv21 = ByteArray(ySize + uSize + vSize)
            yBuffer.get(nv21, 0, ySize)
            vBuffer.get(nv21, ySize, vSize)
            uBuffer.get(nv21, ySize + vSize, uSize)

            val yuvImage = android.graphics.YuvImage(
                nv21,
                android.graphics.ImageFormat.NV21,
                imageProxy.width,
                imageProxy.height,
                null
            )

            val out = java.io.ByteArrayOutputStream()
            yuvImage.compressToJpeg(
                android.graphics.Rect(0, 0, imageProxy.width, imageProxy.height),
                100,
                out
            )
            val imageBytes = out.toByteArray()
            val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length)
            if (rotationDegrees != 0 && bitmap != null) {
                rotateBitmap(bitmap, rotationDegrees)
            } else {
                bitmap
            }
        } catch (e: Exception) {
            null
        }
    }
}
