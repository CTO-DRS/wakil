package com.wakil.agent.extra

import android.app.ActivityManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Small phone tools: device status, clipboard, notifications. */
object DeviceTools {
    fun info(ctx: Context): String {
        val bat = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val lvl = bat?.let { it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) * 100 / maxOf(1, it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)) }
        val charging = bat?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)?.let { it != 0 } ?: false
        val mi = ActivityManager.MemoryInfo().also { ctx.getSystemService(ActivityManager::class.java).getMemoryInfo(it) }
        val st = StatFs(Environment.getDataDirectory().path)
        val cm = ctx.getSystemService(ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val net = when {
            caps == null -> "offline"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile data"
            else -> "online"
        }
        val gb = { b: Long -> String.format(Locale.US, "%.1f GB", b / 1e9) }
        return buildString {
            append("Time: ${SimpleDateFormat("yyyy-MM-dd HH:mm EEEE", Locale.US).format(Date())} (${java.util.TimeZone.getDefault().id})\n")
            append("Device: ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}), ${Build.SUPPORTED_ABIS.firstOrNull()}\n")
            append("Battery: ${lvl ?: "?"}%${if (charging) " (charging)" else ""}\n")
            append("RAM: ${gb(mi.availMem)} free of ${gb(mi.totalMem)}\n")
            append("Storage: ${gb(st.availableBytes)} free of ${gb(st.totalBytes)}\n")
            append("Network: $net")
        }
    }

    fun clipboardGet(ctx: Context): String {
        val cm = ctx.getSystemService(ClipboardManager::class.java)
        val t = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(ctx)?.toString()
        return t ?: "(clipboard empty or not readable while Wakil is in the background)"
    }

    fun clipboardSet(ctx: Context, text: String): String {
        ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Wakil", text))
        return "Copied ${text.length} chars to the clipboard."
    }
}
