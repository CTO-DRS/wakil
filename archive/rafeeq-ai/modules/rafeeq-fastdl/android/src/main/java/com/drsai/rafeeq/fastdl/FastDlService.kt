// Copyright (c) 2026 DRS AI. All rights reserved.
package com.drsai.rafeeq.fastdl

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Foreground service that only keeps the process (and so the download threads)
 * alive while model downloads run in the background, with a progress notification.
 * The download work itself happens in RafeeqFastDlModule's workers.
 */
class FastDlService : Service() {
  companion object {
    private const val CHANNEL_ID = "rafeeq_downloads"
    private const val NOTIFICATION_ID = 0x5AF0
    private const val EXTRA_TITLE = "title"

    @Volatile var running = false
      private set

    fun start(ctx: Context, title: String): Boolean {
      return try {
        val intent = Intent(ctx, FastDlService::class.java).putExtra(EXTRA_TITLE, title)
        ctx.startForegroundService(intent)
        true
      } catch (_: Throwable) {
        // e.g. ForegroundServiceStartNotAllowedException when started from the background:
        // downloads still run while the app is visible.
        false
      }
    }

    fun update(ctx: Context, title: String, percent: Int) {
      if (!running) return
      try {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, build(ctx, title, percent))
      } catch (_: Throwable) {
      }
    }

    fun stop(ctx: Context) {
      try {
        ctx.stopService(Intent(ctx, FastDlService::class.java))
      } catch (_: Throwable) {
      }
    }

    private fun ensureChannel(ctx: Context) {
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        val ch = NotificationChannel(CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_LOW)
        ch.setShowBadge(false)
        nm.createNotificationChannel(ch)
      }
    }

    fun build(ctx: Context, title: String, percent: Int): Notification {
      ensureChannel(ctx)
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      val pi = launch?.let {
        PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      val b = Notification.Builder(ctx, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle(title.ifBlank { "Downloading" })
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(Notification.CATEGORY_PROGRESS)
      if (percent in 0..100) {
        b.setProgress(100, percent, false).setContentText("$percent%")
      } else {
        b.setProgress(0, 0, true)
      }
      if (pi != null) b.setContentIntent(pi)
      return b.build()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: ""
    try {
      val n = build(this, title, -1)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, n)
      }
      running = true
    } catch (_: Throwable) {
      running = false
      stopSelf()
    }
    return START_NOT_STICKY
  }

  /** Android 15+ caps dataSync services; stop cleanly (downloads continue while visible). */
  override fun onTimeout(startId: Int, fgsType: Int) {
    running = false
    stopSelf()
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }
}
