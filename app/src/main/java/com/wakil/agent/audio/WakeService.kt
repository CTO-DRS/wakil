package com.wakil.agent.audio

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.wakil.agent.MainActivity
import com.wakil.agent.WakilApp

/**
 * Experimental "يا وكيل" listening in the background (foreground service with the microphone).
 * Say «يا وكيل افتح يوتيوب» and the words after the name go straight to the agent; saying only
 * «يا وكيل» opens the app in voice-conversation mode. Runs only on the offline engine (Silero VAD +
 * Whisper), so there are no recognizer beeps or Google dialogs.
 */
class WakeService : Service() {
    private var loop: VoiceLoop? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 2, Intent(this, WakeService::class.java).setAction("stop"), PendingIntent.FLAG_IMMUTABLE)
        if (!OfflineVoice.ready()) {
            // The wake word only runs on the offline engine: Google's recognizer beeps on every restart.
            (application as WakilApp).prefs.wakeWord = false; stopSelf(); return START_NOT_STICKY
        }
        if (intent?.action == "stop") { (application as WakilApp).prefs.wakeWord = false; stopSelf(); return START_NOT_STICKY }
        val n = Notification.Builder(this, WakilApp.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("وكيل يسمع: قل «يا وكيل…»")
            .setContentText("مثال: يا وكيل شغّل الواي فاي")
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "إيقاف", stop).build())
            .setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 30) startForeground(9400, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(9400, n)
        running = true
        if (loop == null) loop = VoiceLoop(this, requireWakeWord = true) { cmd ->
            val app = application as WakilApp
            Speech.init(this)
            if (cmd.isBlank()) {
                runCatching { startActivity(Intent(this, MainActivity::class.java).putExtra("voice_chat", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            } else if (!app.agent.running.value) {
                com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.CONFIRM)
                app.agent.send(cmd, fromVoice = true)
            }
        }.also { l ->
            l.onGiveUp = { why -> (application as WakilApp).prefs.wakeWord = false; notifyStopped(why); stopSelf() }
            l.start()
        }
        return START_STICKY
    }

    private fun notifyStopped(why: String) {
        val n = Notification.Builder(this, WakilApp.CHANNEL_ID).setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("أُوقفت كلمة التنبيه").setContentText(why).setStyle(Notification.BigTextStyle().bigText(why)).build()
        runCatching { getSystemService(android.app.NotificationManager::class.java).notify(9401, n) }
    }

    override fun onDestroy() { loop?.stop(); loop = null; running = false; super.onDestroy() }

    companion object {
        @Volatile var running = false
        fun start(ctx: Context) = runCatching { ctx.startForegroundService(Intent(ctx, WakeService::class.java)) }
        fun stop(ctx: Context) = runCatching { ctx.stopService(Intent(ctx, WakeService::class.java)) }
    }
}
