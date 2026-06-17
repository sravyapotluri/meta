package com.glassface.ui.overlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import com.glassface.camera.RecognitionResult

class FaceOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val knownPaint = Paint().apply {
        color = Color.parseColor("#4CAF50")
        style = Paint.Style.STROKE
        strokeWidth = 4f
        isAntiAlias = true
    }

    private val unknownPaint = Paint().apply {
        color = Color.parseColor("#F44336")
        style = Paint.Style.STROKE
        strokeWidth = 4f
        isAntiAlias = true
    }

    private val textPaint = Paint().apply {
        color = Color.WHITE
        textSize = 40f
        isAntiAlias = true
        setShadowLayer(2f, 0f, 0f, Color.BLACK)
    }

    private val backgroundPaint = Paint().apply {
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private var results: List<RecognitionResult> = emptyList()
    private var sourceWidth: Int = 1
    private var sourceHeight: Int = 1

    fun updateResults(results: List<RecognitionResult>, sourceWidth: Int, sourceHeight: Int) {
        this.results = results
        this.sourceWidth = if (sourceWidth > 0) sourceWidth else 1
        this.sourceHeight = if (sourceHeight > 0) sourceHeight else 1
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (results.isEmpty()) return

        val viewWidth = width.toFloat()
        val viewHeight = height.toFloat()

        val scaleX = viewWidth / sourceWidth.toFloat()
        val scaleY = viewHeight / sourceHeight.toFloat()

        for (result in results) {
            val scaledBox = RectF(
                result.boundingBox.left * scaleX,
                result.boundingBox.top * scaleY,
                result.boundingBox.right * scaleX,
                result.boundingBox.bottom * scaleY
            )

            val paint = if (result.name != "Unknown") knownPaint else unknownPaint
            canvas.drawRect(scaledBox, paint)

            val label = if (result.name != "Unknown") {
                "${result.name} (${(result.confidence * 100).toInt()}%)"
            } else {
                "Unknown"
            }

            val textX = scaledBox.left
            val textY = if (scaledBox.top > 50f) scaledBox.top - 10f else scaledBox.bottom + 40f

            val textWidth = textPaint.measureText(label)
            backgroundPaint.color = if (result.name != "Unknown") {
                Color.parseColor("#884CAF50")
            } else {
                Color.parseColor("#88F44336")
            }
            canvas.drawRect(
                textX - 4f,
                textY - textPaint.textSize,
                textX + textWidth + 4f,
                textY + 4f,
                backgroundPaint
            )

            canvas.drawText(label, textX, textY, textPaint)
        }
    }
}
