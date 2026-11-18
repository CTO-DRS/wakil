package com.wakil.agent.audio

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.wakil.agent.WakilApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

enum class VoicePhase { OFF, LISTENING, HEARD, THINKING, SPEAKING }

/**
 * Hands-free conversation: listen → send to the agent → read the reply aloud → listen again, until stopped.
 * With [requireWakeWord] it ignores speech that doesn't contain "وكيل" (used by the background wake-word service).
 */
class VoiceLoop(private val ctx: Context, private val requireWakeWord: Boolean = false, private val onWake: ((String) -> Unit)? = null) {
    private val main = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var rec: SpeechRecognizer? = null
    private var job: Job? = null
    private val _phase = MutableStateFlow(VoicePhase.OFF)
    val phase: StateFlow<VoicePhase> = _phase
    val partial = MutableStateFlow("")
    val level = MutableStateFlow(0f)
    @Volatile private var on = false

    private val prefs get() = WakilApp.instance.prefs
    /** Offline mode: sherpa-onnx VAD + Whisper on this phone instead of Google's recognizer (no beeps, no internet). */
    private val offline: Boolean get() = (prefs.offlineAsr || requireWakeWord) && OfflineVoice.ready()
    /** Consecutive recognizer errors with no result; drives backoff and the give-up rule. */
    private var errors = 0
    /** Called when the phone's recognizer keeps failing and the loop gave up (message in Arabic). */
    var onGiveUp: ((String) -> Unit)? = null
    private var mic: OfflineVoice.Listener? = null
    @Volatile private var busy = false
    private val asrExec = java.util.concurrent.Executors.newSingleThreadExecutor()

    fun available() = offline || SpeechRecognizer.isRecognitionAvailable(ctx)
    val usingOffline get() = offline

    fun start() {
        if (on) return; on = true
        if (offline) startOffline() else listen()
    }

    private fun startOffline() {
        _phase.value = VoicePhase.LISTENING
        mic = OfflineVoice.Listener(
            onSpeech = { seg -> if (!busy) { busy = true; asrExec.execute { decodeOffline(seg) } } },
            onLevel = { level.value = it },
            onSpeaking = { sp -> if (sp && !busy && _phase.value == VoicePhase.LISTENING) partial.value = "…" },
            paused = { busy || Speech.speaking.value },
        ).also { it.start() }
    }

    private fun decodeOffline(seg: FloatArray) {
        try {
            if (!requireWakeWord) _phase.value = VoicePhase.HEARD
            val text = runCatching { OfflineVoice.transcribe(prefs.asrPack, seg) }.getOrDefault("")
            if (!on) return
            if (text.isBlank()) { _phase.value = VoicePhase.LISTENING; partial.value = ""; return }
            partial.value = text
            if (requireWakeWord) {
                WakeWord.command(text)?.let { cmd -> main.launch { onWake?.invoke(cmd) } }
                return
            }
            if (Regex("^(توقف|خلاص|اسكت|إيقاف|stop)[.!]?$").matches(text)) { main.launch { stop(); Speech.stop() }; return }
            val done = java.util.concurrent.CountDownLatch(1)
            main.launch { handle(text) { done.countDown(); Unit } }
            done.await()
        } finally {
            busy = false
            if (on) { _phase.value = VoicePhase.LISTENING }
        }
    }

    fun stop() {
        on = false; job?.cancel()
        mic?.stop(); mic = null
        main.launch { runCatching { rec?.cancel(); rec?.destroy() }; rec = null }
        _phase.value = VoicePhase.OFF; partial.value = ""
    }

    private fun intent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-SA")
        .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)

    private fun listen(): Job = main.launch {
        if (!on) return@launch
        if (rec == null) rec = SpeechRecognizer.createSpeechRecognizer(ctx).apply { setRecognitionListener(listener) }
        _phase.value = VoicePhase.LISTENING; partial.value = ""
        runCatching { rec?.startListening(intent()) }.onFailure { retry(1500) }
    }

    private fun retry(ms: Long) { if (!on) return; job = main.launch { delay(ms); listen() } }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(p: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(v: Float) { level.value = ((v + 2f) / 12f).coerceIn(0f, 1f) }
        override fun onBufferReceived(b: ByteArray?) {}
        override fun onEndOfSpeech() { _phase.value = VoicePhase.HEARD }
        override fun onError(e: Int) {
            val normal = e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
            if (normal) { errors = 0; retry(400); return }
            errors++
            // Some phones (Google app voice disabled / Arabic not available) fail instantly every time:
            // without this the loop restarts many times a second, beeping and flashing Google's dialog.
            if (errors >= 4 || e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                val why = "التعرّف الصوتي في الجوال لا يعمل (رمز $e). فعّل «الصوت بدون إنترنت» من الإعدادات بدلاً منه."
                stop(); onGiveUp?.invoke(why); return
            }
            retry(1000L shl errors)   // 2 s, 4 s, 8 s
        }
        override fun onPartialResults(b: Bundle?) {
            b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { partial.value = it }
        }
        override fun onEvent(t: Int, b: Bundle?) {}
        override fun onResults(b: Bundle?) {
            errors = 0
            val text = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
            partial.value = text
            if (text.isBlank()) { retry(200); return }
            if (requireWakeWord) {
                val cmd = WakeWord.command(text)
                if (cmd == null) { retry(200); return }
                onWake?.invoke(cmd); retry(400); return
            }
            if (Regex("^(توقف|خلاص|اسكت|إيقاف|stop)[.!]?$").matches(text)) { stop(); Speech.stop(); return }
            handle(text) { listen(); Unit }
        }
    }

    private fun handle(text: String, then: () -> Unit): Unit {
        val app = WakilApp.instance
        job = main.launch {
            _phase.value = VoicePhase.THINKING
            if (app.agent.running.value) app.agent.running.first { !it }
            app.agent.send(text, fromVoice = true)
            delay(300)
            app.agent.running.first { !it }
            delay(400)
            if (Speech.speaking.value) { _phase.value = VoicePhase.SPEAKING; Speech.speaking.first { !it } }
            delay(300)
            then()
        }
    }
}

object WakeWord {
    private val WORDS = listOf("يا وكيل", "ياوكيل", "وكيل", "wakil")
    /** If [heard] contains the wake word, returns what was said after it ("" if only the name was said). */
    fun command(heard: String): String? {
        val t = heard.trim()
        for (w in WORDS) {
            val i = t.indexOf(w, ignoreCase = true)
            if (i >= 0) return t.substring(i + w.length).trim().trimStart('،', ',', '.', ' ')
        }
        return null
    }
}
