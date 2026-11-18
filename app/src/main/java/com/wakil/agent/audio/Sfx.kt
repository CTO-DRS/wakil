package com.wakil.agent.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.SoundPool
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import com.wakil.agent.Prefs
import com.wakil.agent.R
import java.util.Locale

/** Short UI / robot sound effects, all generated procedurally for Wakil (res/raw/sfx_*.ogg). */
enum class Sound(val res: Int, val gain: Float = 1f) {
    TAP(R.raw.sfx_tap), CONFIRM(R.raw.sfx_confirm), TOGGLE(R.raw.sfx_toggle), WHOOSH(R.raw.sfx_whoosh),
    POWER_ON(R.raw.sfx_power_on), ROBOT_TALK(R.raw.sfx_robot_talk), ROBOT_THINK(R.raw.sfx_robot_think),
    GRANTED(R.raw.sfx_granted), ERROR(R.raw.sfx_error, 0.8f), CELEBRATE(R.raw.sfx_celebrate),
    SENT(R.raw.sfx_sent), RECEIVED(R.raw.sfx_received), TOOL_TICK(R.raw.sfx_tool_tick),
    SERVO(R.raw.sfx_servo, 0.9f), CHIRP(R.raw.sfx_chirp),
}

/**
 * Low-latency SoundPool player. Respects Settings (sounds on/off + volume) and the ringer mode:
 * nothing plays when the phone is on silent or vibrate. Every call is best-effort and never throws.
 */
object Sfx {
    private var pool: SoundPool? = null
    private val ids = HashMap<Sound, Int>()
    private val loaded = HashSet<Int>()
    private var prefs: Prefs? = null
    private var am: AudioManager? = null
    // applicationContext only, kept for the lifetime of the process — safe singleton pattern
    @Suppress("StaticFieldLeak")
    private var app: Context? = null
    private val lastPlay = HashMap<Sound, Long>()
    private var lastAny = 0L
    private var voice: MediaPlayer? = null
    private var tts: TextToSpeech? = null

    fun init(ctx: Context, p: Prefs) {
        if (pool != null) return
        runCatching {
            app = ctx.applicationContext; prefs = p
            am = ctx.getSystemService(AudioManager::class.java)
            val sp = SoundPool.Builder().setMaxStreams(6).setAudioAttributes(
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
            ).build()
            sp.setOnLoadCompleteListener { _, id, status -> if (status == 0) synchronized(loaded) { loaded += id } }
            Sound.entries.forEach { ids[it] = sp.load(ctx, it.res, 1) }
            pool = sp
        }
    }

    private fun allowed(): Boolean {
        val p = prefs ?: return false
        if (!p.soundsEnabled) return false
        val mode = runCatching { am?.ringerMode }.getOrNull() ?: AudioManager.RINGER_MODE_NORMAL
        return mode == AudioManager.RINGER_MODE_NORMAL
    }

    /** Plays [s]; identical sounds closer than [minGapMs] are dropped (typing ticks, streaming). */
    fun play(s: Sound, volume: Float = 1f, rate: Float = 1f, minGapMs: Long = 40) {
        runCatching {
            if (!allowed()) return
            val now = SystemClock.uptimeMillis()
            if (now - (lastPlay[s] ?: 0L) < minGapMs) return
            // a generic tap right after a more specific sound (same click) is redundant
            if (s == Sound.TAP && now - lastAny < 120) return
            lastPlay[s] = now; lastAny = now
            val id = ids[s] ?: return
            if (synchronized(loaded) { id !in loaded }) return
            val v = (prefs!!.soundVolume * volume * s.gain).coerceIn(0f, 1f)
            pool?.play(id, v, v, 1, 0, rate.coerceIn(0.5f, 2f))
        }
    }

    /** Generic click for buttons: plays only if the click handler did not already play a specific sound. */
    fun click() = play(Sound.TAP)

    /** "مرحباً، أنا وكيل، مساعدك الذكي" — prerecorded robotic voice; falls back to system Arabic TTS. */
    fun welcome() {
        runCatching {
            val p = prefs ?: return
            if (!p.welcomeVoice || !allowed()) return
            val ctx = app ?: return
            voice?.release()
            val mp = MediaPlayer.create(ctx, R.raw.voice_welcome)
            if (mp != null) {
                val v = p.soundVolume.coerceIn(0.05f, 1f); mp.setVolume(v, v)
                mp.setOnCompletionListener { it.release(); if (voice === it) voice = null }
                voice = mp; mp.start()
            } else speakTts(ctx)
        }
    }

    private fun speakTts(ctx: Context) {
        runCatching {
            tts?.shutdown()
            var engine: TextToSpeech? = null
            engine = TextToSpeech(ctx) { st ->
                val e = engine ?: return@TextToSpeech
                if (st != TextToSpeech.SUCCESS) { e.shutdown(); return@TextToSpeech }
                val r = e.setLanguage(Locale("ar"))
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) { e.shutdown(); return@TextToSpeech }
                e.setPitch(0.7f); e.setSpeechRate(0.95f)
                e.speak("مرحباً، أنا وكيل، مساعدك الذكي", TextToSpeech.QUEUE_FLUSH, null, "wakil_welcome")
            }
            tts = engine
        }
    }
}
