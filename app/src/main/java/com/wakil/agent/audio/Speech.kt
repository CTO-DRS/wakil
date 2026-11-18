package com.wakil.agent.audio

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/** Spoken replies through the phone's own text-to-speech engine (works offline when an Arabic voice is installed). */
object Speech {
    private var tts: TextToSpeech? = null
    @Volatile private var ready = false
    private var pending: String? = null
    /** True while a reply is being read aloud (voice conversation waits for it before listening again). */
    val speaking = kotlinx.coroutines.flow.MutableStateFlow(false)

    fun init(ctx: Context) {
        if (tts != null) return
        tts = TextToSpeech(ctx.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val t = tts ?: return@TextToSpeech
                val r = t.setLanguage(Locale("ar"))
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) t.language = Locale.getDefault()
                t.setSpeechRate(1.0f)
                t.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                    override fun onStart(id: String?) { speaking.value = true }
                    override fun onDone(id: String?) { speaking.value = false }
                    @Deprecated("Deprecated in Java") override fun onError(id: String?) { speaking.value = false }
                })
                ready = true
                pending?.let { speak(it) }; pending = null
            }
        }
    }

    /** Strips markdown/code noise so the voice reads only words. */
    fun clean(text: String): String = text
        .replace(Regex("(?s)```.*?```"), " ")
        .replace(Regex("[`*_#>|]"), " ")
        .replace(Regex("https?://\\S+"), " ")
        .replace(Regex("\\s+"), " ").trim()
        .take(3000)

    private var prefs: com.wakil.agent.Prefs? = null
    private val offlineExec = java.util.concurrent.Executors.newSingleThreadExecutor()
    private var offlineTask: java.util.concurrent.Future<*>? = null

    fun bind(p: com.wakil.agent.Prefs) { prefs = p }

    private fun useOffline() = prefs?.let { it.offlineTts && OfflineVoice.ttsAvailable(it.ttsPack) } == true

    fun speak(text: String) {
        val t = clean(text); if (t.isBlank()) return
        if (useOffline()) {
            val p = prefs!!
            OfflineVoice.stopSpeaking(); offlineTask?.cancel(false)
            speaking.value = true
            offlineTask = offlineExec.submit {
                try { OfflineVoice.speak(p.ttsPack, t, p.ttsSpeed) }
                catch (e: Throwable) { android.util.Log.w("Wakil", "offline tts failed", e) }
                finally { speaking.value = false }
            }
            return
        }
        if (!ready) { pending = t; return }
        tts?.speak(t, TextToSpeech.QUEUE_FLUSH, null, "wakil-reply")
    }

    fun stop() { tts?.stop(); pending = null; OfflineVoice.stopSpeaking(); offlineTask?.cancel(false); speaking.value = false }
}
