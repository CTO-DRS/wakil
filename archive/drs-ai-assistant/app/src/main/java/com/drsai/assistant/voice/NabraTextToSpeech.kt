package com.drsai.assistant.voice

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import com.drsai.assistant.data.voice.VoicePack
import com.drsai.assistant.domain.model.VoiceCatalog
import com.drsai.assistant.domain.repository.SettingsRepository
import com.drsai.assistant.voice.g2p.ArabicG2p
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.Closeable
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.concurrent.Executors
import kotlin.coroutines.cancellation.CancellationException

/** One ONNX Runtime session of Nabra-Saudi-7M plus the G2P front-end. Not thread-safe. */
class NabraSynth(modelFile: File, styleFile: File, private val g2p: ArabicG2p) : Closeable {
    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private val session: OrtSession = OrtSession.SessionOptions().use { opts ->
        opts.setIntraOpNumThreads(2)
        opts.setInterOpNumThreads(1)
        opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
        env.createSession(modelFile.absolutePath, opts)
    }
    private val styles: FloatArray = ByteBuffer.wrap(styleFile.readBytes())
        .order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
        .let { fb -> FloatArray(fb.remaining()).also { fb.get(it) } }

    init {
        require(styles.size == ArabicG2p.VOICE_ROWS * STYLE_DIM) { "bad style pack: ${styles.size} floats" }
    }

    /** Returns 24 kHz mono samples, or null when the text has nothing speakable. */
    fun synthesize(text: String, speed: Float): FloatArray? {
        val enc = g2p.encode(text)
        if (enc.ids.isEmpty()) return null
        val row = enc.styleIndex * STYLE_DIM
        val style = styles.copyOfRange(row, row + STYLE_DIM)
        OnnxTensor.createTensor(env, LongBuffer.wrap(enc.inputIds), longArrayOf(1, enc.inputIds.size.toLong())).use { ids ->
            OnnxTensor.createTensor(env, FloatBuffer.wrap(style), longArrayOf(1, STYLE_DIM.toLong())).use { st ->
                OnnxTensor.createTensor(env, FloatBuffer.wrap(floatArrayOf(speed)), longArrayOf(1)).use { sp ->
                    session.run(mapOf("input_ids" to ids, "style" to st, "speed" to sp)).use { result ->
                        @Suppress("UNCHECKED_CAST")
                        return when (val v = result.get(0).value) {
                            is FloatArray -> v
                            is Array<*> -> (v as Array<FloatArray>).firstOrNull()
                            else -> null
                        }
                    }
                }
            }
        }
    }

    override fun close() = session.close()

    companion object {
        const val STYLE_DIM = 256
    }
}

/**
 * Offline Saudi-Arabic text-to-speech. Synthesis runs on its own thread; playback on another,
 * through a 24 kHz float [AudioTrack] per utterance, so the next sentence is synthesized while
 * the current one plays.
 */
class NabraTextToSpeech(
    private val context: Context,
    private val pack: VoicePack,
    private val scope: CoroutineScope,
    settings: SettingsRepository,
) : TextToSpeech {
    private val synthDispatcher = Executors.newSingleThreadExecutor { r -> Thread(r, "drs-tts-synth") }
        .asCoroutineDispatcher()
    private val audioDispatcher = Executors.newSingleThreadExecutor { r -> Thread(r, "drs-tts-audio") }
        .asCoroutineDispatcher()

    @Volatile private var speed = VoiceCatalog.DEFAULT_SPEED

    // Only touched on synthDispatcher.
    private var g2p: ArabicG2p? = null
    private var synth: NabraSynth? = null

    private val _speakingId = MutableStateFlow<Long?>(null)
    override val speakingId: StateFlow<Long?> = _speakingId.asStateFlow()

    private class Utterance(val id: Long, val text: Channel<String>, val job: Job)

    private val lock = Any()
    private var current: Utterance? = null

    init {
        scope.launch { settings.settings.collect { speed = VoiceCatalog.clampSpeed(it.ttsSpeed) } }
    }

    override val isAvailable: Boolean get() = pack.isReady()

    override fun prepare() {
        if (!isAvailable) return
        scope.launch(synthDispatcher) {
            try { ensureSynth() } catch (e: Exception) { Log.w(TAG, "prepare failed", e) }
        }
    }

    override fun begin(utteranceId: Long) {
        synchronized(lock) {
            stopLocked()
            if (!isAvailable) return
            current = startLocked(utteranceId)
        }
    }

    override fun add(utteranceId: Long, sentence: String) {
        synchronized(lock) { current?.takeIf { it.id == utteranceId }?.text?.trySend(sentence) }
    }

    override fun end(utteranceId: Long) {
        synchronized(lock) { current?.takeIf { it.id == utteranceId }?.text?.close() }
    }

    override fun speak(utteranceId: Long, text: String) {
        begin(utteranceId)
        SpeechText.forSpeech(text).forEach { add(utteranceId, it) }
        end(utteranceId)
    }

    override fun stop() {
        synchronized(lock) { stopLocked() }
    }

    override fun release() {
        stop()
        scope.launch(synthDispatcher) {
            synth?.close()
            synth = null
        }
    }

    private fun stopLocked() {
        current?.let {
            it.text.close()
            it.job.cancel()
        }
        current = null
        _speakingId.value = null
    }

    private fun startLocked(id: Long): Utterance {
        val text = Channel<String>(Channel.UNLIMITED)
        val audio = Channel<FloatArray>(2)
        _speakingId.value = id
        val job = scope.launch {
            launch(synthDispatcher) {
                try {
                    for (sentence in text) {
                        ensureActive()
                        val wav = try {
                            ensureSynth().synthesize(sentence, speed)
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            Log.w(TAG, "synthesis failed", e)
                            null
                        } ?: continue
                        audio.send(wav)
                    }
                } finally {
                    audio.close()
                }
            }
            withContext(audioDispatcher) { play(audio) }
        }
        job.invokeOnCompletion {
            synchronized(lock) {
                if (current?.job === job) {
                    current = null
                    _speakingId.value = null
                }
            }
        }
        return Utterance(id, text, job)
    }

    private suspend fun play(audio: Channel<FloatArray>) {
        var track: AudioTrack? = null
        try {
            var written = 0L
            for (wav in audio) {
                val t = track ?: newTrack().also { it.play(); track = it }
                written += write(t, wav)
                written += write(t, FloatArray(GAP_FRAMES))
            }
            val t = track ?: return
            // Let the buffered tail play out before reporting silence.
            var waited = 0
            while (currentCoroutineContext().isActive && (t.playbackHeadPosition.toLong() and 0xffffffffL) < written &&
                waited < 30_000
            ) {
                delay(30); waited += 30
            }
        } finally {
            track?.let {
                runCatching { it.pause(); it.flush() }
                it.release()
            }
        }
    }

    /** Non-blocking writes so a stop is never stuck inside AudioTrack. Returns frames written. */
    private suspend fun write(track: AudioTrack, samples: FloatArray): Long {
        for (i in samples.indices) samples[i] = samples[i].coerceIn(-1f, 1f)
        var off = 0
        while (off < samples.size) {
            currentCoroutineContext().ensureActive()
            val n = track.write(samples, off, minOf(CHUNK, samples.size - off), AudioTrack.WRITE_NON_BLOCKING)
            if (n < 0) throw IllegalStateException("AudioTrack.write error $n")
            off += n
            if (n == 0) delay(15)
        }
        return samples.size.toLong()
    }

    private fun newTrack(): AudioTrack {
        val rate = VoiceCatalog.SAMPLE_RATE
        val minBuf = AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
        return AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(rate)
                    .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(maxOf(minBuf, rate / 2 * 4)) // >= 0.5 s
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
    }

    private fun ensureSynth(): NabraSynth {
        synth?.let { return it }
        val g = g2p ?: openLexicon().use { lex ->
            context.assets.open(VoiceCatalog.NUMBERS_ASSET).use { num -> ArabicG2p.load(lex, num) }
        }.also { g2p = it }
        return NabraSynth(pack.modelFile(), pack.styleFile(), g).also { synth = it }
    }

    /**
     * The build tools store `*.gz` assets decompressed and drop the suffix, so the lexicon is
     * `nabra_lexicon.tsv` inside the APK. Try both names; the loader detects gzip by its magic.
     */
    private fun openLexicon(): java.io.InputStream = try {
        context.assets.open(VoiceCatalog.LEXICON_ASSET.removeSuffix(".gz"))
    } catch (e: java.io.FileNotFoundException) {
        context.assets.open(VoiceCatalog.LEXICON_ASSET)
    }

    private companion object {
        const val TAG = "DrsTts"
        const val CHUNK = 2_400 // 100 ms
        const val GAP_FRAMES = 2_880 // 120 ms of silence between sentences
    }
}
