package com.glassface.tts

import android.content.Context
import android.speech.tts.TextToSpeech
import com.glassface.db.Person
import java.util.Locale

class GlassesTTSManager : TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var isReady = false
    private var onReadyCallback: (() -> Unit)? = null

    fun initialize(context: Context, onReady: () -> Unit) {
        onReadyCallback = onReady
        tts = TextToSpeech(context, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val result = tts?.setLanguage(Locale.US)
            if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) {
                isReady = true
                onReadyCallback?.invoke()
            }
        }
    }

    fun speak(text: String) {
        if (isReady) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "glassface_utterance_${System.currentTimeMillis()}")
        }
    }

    fun announceRecognition(person: Person) {
        val announcement = buildAnnouncement(person)
        speak(announcement)
    }

    private fun buildAnnouncement(person: Person): String {
        return when {
            person.title.isNotBlank() && person.company.isNotBlank() ->
                "${person.name}, ${person.title} at ${person.company}"
            person.title.isNotBlank() ->
                "${person.name}, ${person.title}"
            person.company.isNotBlank() ->
                "${person.name} from ${person.company}"
            else ->
                person.name
        }
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        isReady = false
    }
}
