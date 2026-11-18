package com.wakil.agent.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import com.wakil.agent.llm.FastDownloader
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import kotlin.math.sqrt

enum class PackKind { VAD, ASR, TTS }

/** A downloadable sherpa-onnx voice model. [keep] filters which archive entries are kept (saves space). */
data class VoicePack(
    val id: String, val kind: PackKind, val title: String, val note: String, val url: String,
    val downloadMb: Int, val diskMb: Int, val single: String? = null, val keep: (String) -> Boolean = { true },
)

data class PackProgress(val id: String, val stage: String, val done: Long = 0, val total: Long = -1, val error: String? = null)

/**
 * Fully offline voice with sherpa-onnx (k2-fsa): Silero VAD to cut speech from the mic, Whisper for
 * Arabic speech-to-text, and Piper Arabic voices for replies. No Google services, no internet after download.
 */
object OfflineVoice {
    private const val REL = "https://github.com/k2-fsa/sherpa-onnx/releases/download"
    private fun whisperKeep(n: String) = !n.contains("test_wavs") && (!n.endsWith(".onnx") || n.contains(".int8."))

    val PACKS = listOf(
        VoicePack("vad", PackKind.VAD, "كاشف الكلام (Silero VAD)", "يلتقط بداية ونهاية كلامك. ضروري للتعرّف المحلي.", "$REL/asr-models/silero_vad.onnx", 1, 1, single = "silero_vad.onnx"),
        VoicePack("asr-base", PackKind.ASR, "Whisper Base (سريع)", "يفهم العربي بسرعة على أغلب الجوالات. دقته متوسطة.", "$REL/asr-models/sherpa-onnx-whisper-base.tar.bz2", 208, 160, keep = ::whisperKeep),
        VoicePack("asr-small", PackKind.ASR, "Whisper Small (أدق)", "دقة أعلى بكثير للعربي، وأبطأ قليلاً. يُنصح به مع 8 جيجا رام.", "$REL/asr-models/sherpa-onnx-whisper-small.tar.bz2", 640, 370, keep = ::whisperKeep),
        VoicePack("tts-kareem", PackKind.TTS, "صوت كريم (عربي)", "صوت رجالي عربي واضح، نفس صوت الترحيب.", "$REL/tts-models/vits-piper-ar_JO-kareem-medium-int8.tar.bz2", 21, 36),
        VoicePack("tts-miro", PackKind.TTS, "صوت ميرو (عربي، جودة عالية)", "صوت عربي بجودة أعلى.", "$REL/tts-models/vits-piper-ar_JO-SA_miro_V2-high-int8.tar.bz2", 22, 40),
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var root: File
    // applicationContext only, kept for the lifetime of the process — safe singleton pattern
    @Suppress("StaticFieldLeak")
    private lateinit var appCtx: Context
    private val _progress = MutableStateFlow<PackProgress?>(null)
    val progress: StateFlow<PackProgress?> = _progress
    /** Bumped whenever packs are installed/removed so the UI refreshes. */
    val version = MutableStateFlow(0)
    private var job: Job? = null

    fun init(ctx: Context) { appCtx = ctx.applicationContext; root = File(ctx.filesDir, "voice").apply { mkdirs() } }

    fun dir(p: VoicePack) = File(root, p.id)
    fun installed(p: VoicePack) = File(dir(p), ".ok").exists()
    /** VAD plus at least one Whisper pack: enough to listen without Google's recognizer. */
    fun ready(): Boolean = installed(PACKS[0]) && installedOf(PackKind.ASR).isNotEmpty()
    fun pack(id: String) = PACKS.firstOrNull { it.id == id }
    fun installedOf(kind: PackKind) = PACKS.filter { it.kind == kind && installed(it) }

    fun install(p: VoicePack, connections: Int = 8) {
        if (job?.isActive == true) return
        job = scope.launch {
            val d = dir(p).apply { deleteRecursively(); mkdirs() }
            val tmp = File(root, "${p.id}.download")
            try {
                _progress.value = PackProgress(p.id, "تنزيل")
                val f = try {
                    FastDownloader(p.url, tmp, connections) { done, total, _, _ -> _progress.value = PackProgress(p.id, "تنزيل", done, total) }.run()
                } catch (e: FastDownloader.NoRangeException) {
                    plainDownload(p.url, tmp) { done, total -> _progress.value = PackProgress(p.id, "تنزيل", done, total) }
                }
                if (p.single != null) f.renameTo(File(d, p.single))
                else {
                    _progress.value = PackProgress(p.id, "فك الضغط")
                    extract(f, d, p.keep) { n -> _progress.value = PackProgress(p.id, "فك الضغط", n, f.length()) }
                    f.delete()
                }
                File(d, ".ok").writeText("1")
                _progress.value = null
                release()
            } catch (e: kotlinx.coroutines.CancellationException) {
                _progress.value = null; throw e
            } catch (e: Exception) {
                d.deleteRecursively()
                _progress.value = PackProgress(p.id, "فشل", error = e.message ?: e.toString())
            } finally { version.value++ }
        }
    }

    fun cancel() { job?.cancel(); _progress.value = null }

    fun remove(p: VoicePack) { release(); dir(p).deleteRecursively(); version.value++ }

    private fun plainDownload(url: String, target: File, onProgress: (Long, Long) -> Unit): File {
        var u = url
        var c: java.net.HttpURLConnection
        var hops = 0
        while (true) {
            c = FastDownloader.open(u).apply { instanceFollowRedirects = false; connectTimeout = 20_000; readTimeout = 30_000 }
            if (c.responseCode in 300..399 && hops++ < 8) { u = java.net.URL(java.net.URL(u), c.getHeaderField("Location")).toString(); c.disconnect(); continue }
            break
        }
        if (c.responseCode != 200) throw java.io.IOException("HTTP ${c.responseCode}")
        val total = c.contentLengthLong; var done = 0L
        c.inputStream.use { i -> target.outputStream().use { o ->
            val buf = ByteArray(256 * 1024)
            while (true) { val n = i.read(buf); if (n < 0) break; o.write(buf, 0, n); done += n; onProgress(done, total) }
        } }
        return target
    }

    /** Extracts a .tar.bz2, dropping the top folder and entries [keep] rejects. */
    fun extract(archive: File, out: File, keep: (String) -> Boolean, onProgress: (Long) -> Unit = {}) {
        val counting = object : java.io.FilterInputStream(BufferedInputStream(archive.inputStream(), 1 shl 16)) {
            var n = 0L
            override fun read(b: ByteArray, off: Int, len: Int): Int = super.read(b, off, len).also { if (it > 0) { n += it; if (n % (4 shl 20) < it) onProgress(n) } }
        }
        TarArchiveInputStream(BZip2CompressorInputStream(counting, true)).use { tar ->
            val base = out.canonicalPath
            while (true) {
                val e = tar.nextEntry ?: break
                val rel = e.name.substringAfter('/', "").trimStart('/')
                if (rel.isEmpty() || !keep(e.name)) continue
                val f = File(out, rel)
                if (!f.canonicalPath.startsWith(base)) continue
                if (e.isDirectory) { f.mkdirs(); continue }
                f.parentFile?.mkdirs()
                f.outputStream().use { tar.copyTo(it) }
            }
        }
    }

    // ---------------- engines ----------------
    private var recognizer: OfflineRecognizer? = null
    private var recognizerId: String? = null
    private var tts: OfflineTts? = null
    private var ttsId: String? = null

    @Synchronized fun release() {
        runCatching { recognizer?.release() }; recognizer = null; recognizerId = null
        runCatching { tts?.release() }; tts = null; ttsId = null
    }

    private fun threads() = (Runtime.getRuntime().availableProcessors() / 2).coerceIn(2, 4)

    @Synchronized private fun asr(p: VoicePack): OfflineRecognizer {
        recognizer?.takeIf { recognizerId == p.id }?.let { return it }
        runCatching { recognizer?.release() }
        val d = dir(p)
        fun find(suffix: String) = d.listFiles()?.firstOrNull { it.name.endsWith(suffix) }?.path ?: throw IllegalStateException("ملف ناقص: $suffix")
        val cfg = OfflineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
            modelConfig = OfflineModelConfig(
                whisper = OfflineWhisperModelConfig(encoder = find("-encoder.int8.onnx"), decoder = find("-decoder.int8.onnx"), language = "ar", task = "transcribe"),
                tokens = find("-tokens.txt"), numThreads = threads(), modelType = "whisper",
            ),
        )
        return OfflineRecognizer(config = cfg).also { recognizer = it; recognizerId = p.id }
    }

    /** Speech (16 kHz mono float) → Arabic text, using the chosen Whisper pack. */
    fun transcribe(packId: String, samples: FloatArray): String {
        val p = pack(packId)?.takeIf { installed(it) } ?: installedOf(PackKind.ASR).firstOrNull() ?: throw IllegalStateException("نزّل نموذج تعرّف على الكلام أولاً")
        val r = synchronized(this) { asr(p) }
        val s = r.createStream()
        try {
            s.acceptWaveform(samples, 16000)
            synchronized(this) { r.decode(s) }
            return cleanAsr(r.getResult(s).text)
        } finally { s.release() }
    }

    fun cleanAsr(t: String) = t.trim().replace(Regex("^[.،,؟?!\\s]+|[\\s]+$"), "")
        .let { if (Regex("^(\\[.*]|\\(.*\\)|ترجمة.*|اشترك.*)$").matches(it)) "" else it } // Whisper's silence hallucinations

    @Synchronized private fun ttsEngine(p: VoicePack): OfflineTts {
        tts?.takeIf { ttsId == p.id }?.let { return it }
        runCatching { tts?.release() }
        val d = dir(p)
        val model = d.listFiles()?.firstOrNull { it.name.endsWith(".onnx") }?.path ?: throw IllegalStateException("ملف الصوت ناقص")
        val cfg = OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(model = model, tokens = File(d, "tokens.txt").path, dataDir = File(d, "espeak-ng-data").path),
                numThreads = threads(),
            ),
        )
        return OfflineTts(config = cfg).also { tts = it; ttsId = p.id }
    }

    @Volatile private var stopSpeak = false
    private var track: AudioTrack? = null

    fun ttsAvailable(packId: String) = (pack(packId)?.takeIf { installed(it) } ?: installedOf(PackKind.TTS).firstOrNull()) != null

    /** Speaks [text] with the offline Arabic voice, streaming sentence by sentence. Blocks until done or [stop]. */
    fun speak(packId: String, text: String, speed: Float = 1.0f) {
        val p = pack(packId)?.takeIf { installed(it) } ?: installedOf(PackKind.TTS).firstOrNull() ?: throw IllegalStateException("نزّل صوتاً عربياً أولاً")
        stopSpeak = false
        val engine = synchronized(this) { ttsEngine(p) }
        val sr = engine.sampleRate()
        val t = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT) * 4)
            .setTransferMode(AudioTrack.MODE_STREAM).build()
        track = t
        try {
            t.play()
            for (sentence in splitSentences(text)) {
                if (stopSpeak) break
                val a = synchronized(this) { engine.generate(sentence, 0, speed) }
                if (stopSpeak) break
                t.write(a.samples, 0, a.samples.size, AudioTrack.WRITE_BLOCKING)
            }
            if (!stopSpeak) { t.write(FloatArray(sr / 5), 0, sr / 5, AudioTrack.WRITE_BLOCKING); Thread.sleep(150) }
        } finally {
            runCatching { t.stop(); t.release() }; track = null
        }
    }

    fun stopSpeaking() { stopSpeak = true; runCatching { track?.pause(); track?.flush() } }

    fun splitSentences(text: String): List<String> =
        text.split(Regex("(?<=[.!؟?\\n،:])\\s+")).map { it.trim() }.filter { it.any(Char::isLetterOrDigit) }
            .flatMap { s -> if (s.length <= 220) listOf(s) else s.chunked(200) }

    // ---------------- microphone + VAD ----------------

    /**
     * Listens on the microphone, cuts speech with Silero VAD and hands each finished utterance to [onSpeech].
     * While [paused] returns true (e.g. while Wakil is talking) the audio is dropped so it doesn't hear itself.
     */
    class Listener(
        private val onSpeech: (FloatArray) -> Unit,
        private val onLevel: (Float) -> Unit = {},
        private val onSpeaking: (Boolean) -> Unit = {},
        private val paused: () -> Boolean = { false },
    ) {
        @Volatile private var running = false
        private var thread: Thread? = null

        fun available() = OfflineVoice.installed(PACKS[0])

        @SuppressLint("MissingPermission")
        fun start() {
            if (running) return
            running = true
            thread = Thread({ loop() }, "wakil-mic").also { it.start() }
        }

        fun stop() { running = false; thread?.join(800); thread = null }

        @SuppressLint("MissingPermission")
        private fun loop() {
            val vad = Vad(config = VadModelConfig(
                sileroVadModelConfig = SileroVadModelConfig(model = File(OfflineVoice.dir(PACKS[0]), "silero_vad.onnx").path,
                    threshold = 0.5f, minSilenceDuration = 0.6f, minSpeechDuration = 0.25f, windowSize = 512, maxSpeechDuration = 20f),
                sampleRate = 16000, numThreads = 1,
            ))
            val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT)
            val rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT, maxOf(min, 16000 * 4))
            val buf = FloatArray(512)
            var wasSpeech = false
            try {
                rec.startRecording()
                while (running) {
                    var n = 0
                    while (n < buf.size && running) { val r = rec.read(buf, n, buf.size - n, AudioRecord.READ_BLOCKING); if (r <= 0) break; n += r }
                    if (n < buf.size) continue
                    if (paused()) { if (wasSpeech) { vad.reset(); wasSpeech = false; onSpeaking(false) }; onLevel(0f); continue }
                    var e = 0f; for (x in buf) e += x * x
                    onLevel((sqrt(e / buf.size) * 12f).coerceIn(0f, 1f))
                    vad.acceptWaveform(buf)
                    val sp = vad.isSpeechDetected()
                    if (sp != wasSpeech) { wasSpeech = sp; onSpeaking(sp) }
                    while (!vad.empty()) {
                        val seg = vad.front().samples; vad.pop()
                        if (seg.size > 16000 * 0.3) onSpeech(seg)
                    }
                }
            } finally {
                runCatching { rec.stop() }; rec.release(); vad.release()
            }
        }
    }
}
