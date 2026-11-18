package com.drsai.assistant.domain.model

data class AppSettings(
    val temperature: Float = DEFAULT_TEMPERATURE,
    val contextSize: Int = DEFAULT_CONTEXT,
    /** Read assistant replies aloud as they stream (needs the downloaded voice). */
    val autoRead: Boolean = true,
    /** Speech rate for the voice, 0.8..1.3 (1.0 = normal). */
    val ttsSpeed: Float = VoiceCatalog.DEFAULT_SPEED,
) {
    companion object {
        const val DEFAULT_TEMPERATURE = 0.7f
        const val DEFAULT_CONTEXT = 2048
        val CONTEXT_OPTIONS = listOf(1024, 2048, 4096)
    }
}

/** Sampling parameters for one generation. */
data class GenerationParams(
    val temperature: Float = AppSettings.DEFAULT_TEMPERATURE,
    val topP: Float = 0.9f,
    val topK: Int = 40,
    val repeatPenalty: Float = 1.1f,
    val maxNewTokens: Int = 1024,
    val seed: Int = -1,
)
