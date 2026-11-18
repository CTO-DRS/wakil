package com.drsai.assistant.voice

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow

/*
 * Voice interfaces. TextToSpeech is implemented by [NabraTextToSpeech] (offline Saudi Arabic,
 * Nabra-Saudi-7M on ONNX Runtime). SpeechToText is still a placeholder.
 */

sealed interface SttEvent {
    data class Partial(val text: String) : SttEvent
    data class Final(val text: String) : SttEvent
    data class Error(val message: String) : SttEvent
}

interface SpeechToText {
    val isAvailable: Boolean
    /** Starts listening; emits partial and final transcripts until [stop] or end of speech. */
    fun listen(languageTag: String = "ar-SA"): Flow<SttEvent>
    fun stop()
}

/** A viseme (mouth shape) with its start time, used by the avatar for lip-sync. */
data class Viseme(val id: Int, val startMs: Long)

/**
 * Speaks utterances, each identified by an id (the chat message id). Only one utterance is
 * active: [begin] or [speak] stops whatever was playing. Sentences are synthesized on a
 * background thread and played in order while the next one is being synthesized.
 */
interface TextToSpeech {
    /** The voice files are on the device. */
    val isAvailable: Boolean
    /** Id of the utterance being spoken (or queued), null when silent. */
    val speakingId: StateFlow<Long?>

    /** Loads the model in the background so the first sentence starts sooner. */
    fun prepare()
    /** Starts a streaming utterance; sentences follow with [add] and it closes with [end]. */
    fun begin(utteranceId: Long)
    fun add(utteranceId: Long, sentence: String)
    fun end(utteranceId: Long)
    /** Speaks a whole message (markdown and code are stripped). */
    fun speak(utteranceId: Long, text: String)
    fun stop()
    /** Frees the model (e.g. before the voice files are deleted). */
    fun release()
}

object NoOpSpeechToText : SpeechToText {
    override val isAvailable = false
    override fun listen(languageTag: String): Flow<SttEvent> = emptyFlow()
    override fun stop() = Unit
}

object NoOpTextToSpeech : TextToSpeech {
    private val idle = MutableStateFlow<Long?>(null)
    override val isAvailable = false
    override val speakingId: StateFlow<Long?> = idle.asStateFlow()
    override fun prepare() = Unit
    override fun begin(utteranceId: Long) = Unit
    override fun add(utteranceId: Long, sentence: String) = Unit
    override fun end(utteranceId: Long) = Unit
    override fun speak(utteranceId: Long, text: String) = Unit
    override fun stop() = Unit
    override fun release() = Unit
}
