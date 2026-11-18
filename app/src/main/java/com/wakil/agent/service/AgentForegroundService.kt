package com.wakil.agent.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import com.wakil.agent.MainActivity
import com.wakil.agent.WakilApp
import java.util.concurrent.atomic.AtomicInteger

/**
 * Keeps the process alive (foreground + partial wake lock) while long work runs:
 * agent loops, shell commands, model downloads, Linux env setup.
 * Ref-counted: acquire() when work starts, release() when it ends.
 */
class AgentForegroundService : Service() {
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: "وكيل يعمل…"
        instance = this
        // Android requires startForeground() after every startForegroundService(), even when the work
        // already finished (e.g. a task that failed instantly). Skipping it kills the whole app.
        val n = buildNotification(text)
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIF_ID, n)
            }
        } catch (e: Exception) {
            android.util.Log.w("Wakil", "startForeground failed", e)
            stopSelf(); return START_NOT_STICKY
        }
        if (refs.get() <= 0) { stopForegroundCompat(); stopSelf(); return START_NOT_STICKY }
        if (wakeLock == null) {
            wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "wakil:task").apply { acquire(6 * 60 * 60 * 1000L) }
        }
        return START_NOT_STICKY
    }

    private fun stopForegroundCompat() {
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    private fun buildNotification(text: String): Notification {
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return Notification.Builder(this, WakilApp.CHANNEL_ID)
            .setContentTitle("وكيل")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
    }

    companion object {
        private const val NOTIF_ID = 42
        private const val EXTRA_TEXT = "text"
        private val refs = AtomicInteger(0)
        @Volatile private var instance: AgentForegroundService? = null

        /** Start keeping the process alive; only the first concurrent task actually starts the service. */
        fun acquire(ctx: Context, text: String) {
            if (refs.incrementAndGet() == 1 || instance == null) {
                val i = Intent(ctx, AgentForegroundService::class.java).putExtra(EXTRA_TEXT, text)
                runCatching { ctx.startForegroundService(i) }
            }
        }

        fun release(@Suppress("UNUSED_PARAMETER") ctx: Context) {
            if (refs.decrementAndGet() <= 0) {
                refs.set(0)
                instance?.let { runCatching { it.stopForegroundCompat(); it.stopSelf() } }
            }
        }
    }
}
