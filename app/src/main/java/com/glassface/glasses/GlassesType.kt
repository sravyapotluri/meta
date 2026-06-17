package com.glassface.glasses

enum class GlassesType(val displayName: String) {
    META_RAY_BAN("Ray-Ban Meta"),
    GOOGLE_GLASS("Google Glass EE2"),
    VUZIX_BLADE("Vuzix Blade 2"),
    BRILLIANT_LABS_FRAME("Brilliant Labs Frame"),
    OTHER("Other / Custom");

    /** Modes this glasses type supports */
    fun supportedModes(): List<RecognitionMode> = when (this) {
        META_RAY_BAN -> listOf(RecognitionMode.GLASSES_CAPTURE, RecognitionMode.PHONE_CAMERA)
        GOOGLE_GLASS -> listOf(RecognitionMode.PHONE_CAMERA)
        VUZIX_BLADE -> listOf(RecognitionMode.PHONE_CAMERA)
        BRILLIANT_LABS_FRAME -> listOf(RecognitionMode.GLASSES_CAPTURE, RecognitionMode.PHONE_CAMERA)
        OTHER -> listOf(RecognitionMode.PHONE_CAMERA, RecognitionMode.GLASSES_CAPTURE)
    }

    /** How results are delivered to the user on this glasses type */
    fun outputCapabilities(): OutputCapabilities = when (this) {
        META_RAY_BAN -> OutputCapabilities(
            hasDisplay = false,
            hasAudioSpeakers = true,
            displayDescription = "Audio via Bluetooth speakers"
        )
        GOOGLE_GLASS -> OutputCapabilities(
            hasDisplay = true,
            hasAudioSpeakers = true,
            displayDescription = "Heads-up display + audio"
        )
        VUZIX_BLADE -> OutputCapabilities(
            hasDisplay = true,
            hasAudioSpeakers = true,
            displayDescription = "AR waveguide display + audio"
        )
        BRILLIANT_LABS_FRAME -> OutputCapabilities(
            hasDisplay = true,
            hasAudioSpeakers = false,
            displayDescription = "Micro OLED display (audio via phone)"
        )
        OTHER -> OutputCapabilities(
            hasDisplay = false,
            hasAudioSpeakers = true,
            displayDescription = "Audio via Bluetooth (assumed)"
        )
    }

    fun defaultMode(): RecognitionMode = supportedModes().first()

    companion object {
        fun fromOrdinal(ordinal: Int): GlassesType =
            values().getOrElse(ordinal) { META_RAY_BAN }
    }
}

enum class RecognitionMode(val displayName: String, val description: String) {
    PHONE_CAMERA(
        "Live Camera",
        "Phone camera scans faces continuously in real-time"
    ),
    GLASSES_CAPTURE(
        "Glasses Capture",
        "Press the glasses camera button to capture and identify a person"
    )
}

data class OutputCapabilities(
    val hasDisplay: Boolean,
    val hasAudioSpeakers: Boolean,
    val displayDescription: String
)
