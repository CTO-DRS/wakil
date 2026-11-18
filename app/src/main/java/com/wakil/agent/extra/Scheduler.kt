package com.wakil.agent.extra

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.wakil.agent.MainActivity
import com.wakil.agent.WakilApp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Calendar

/** repeat: "none" (once), "daily", "hourly", or "every:<minutes>". */
data class ScheduledTask(val id: Int, val prompt: String, val nextAt: Long, val repeat: String, val title: String)

/** Automations: the agent runs a prompt by itself at a set time (once, hourly, daily, every N minutes). */
class Scheduler(private val ctx: Context) {
    private val file = File(ctx.filesDir, "tasks.json")
    private val _tasks = MutableStateFlow(load())
    val tasks: StateFlow<List<ScheduledTask>> = _tasks

    private fun load(): List<ScheduledTask> = runCatching {
        val a = JSONArray(file.readText())
        (0 until a.length()).map {
            val o = a.getJSONObject(it)
            ScheduledTask(o.getInt("id"), o.getString("p"), o.getLong("at"), o.optString("r", "none"), o.optString("title"))
        }
    }.getOrDefault(emptyList())

    @Synchronized private fun save(l: List<ScheduledTask>) {
        _tasks.value = l
        runCatching {
            val a = JSONArray()
            l.forEach { a.put(JSONObject().put("id", it.id).put("p", it.prompt).put("at", it.nextAt).put("r", it.repeat).put("title", it.title)) }
            file.writeText(a.toString())
        }
    }

    @Synchronized fun add(prompt: String, firstAt: Long, repeat: String, title: String): ScheduledTask {
        val t = ScheduledTask((_tasks.value.maxOfOrNull { it.id } ?: 0) + 1, prompt, firstAt, normRepeat(repeat), title.ifBlank { prompt.take(40) })
        save(_tasks.value + t); arm(t); return t
    }

    @Synchronized fun cancel(id: Int): Boolean {
        val t = _tasks.value.firstOrNull { it.id == id } ?: return false
        am().cancel(pi(t.id)); EventTriggers.cancel(ctx, t.id); save(_tasks.value - t); return true
    }

    fun rearmAll() = _tasks.value.forEach { arm(it) }

    /** Called by the alarm: runs the task and schedules the next run (or removes a one-shot). */
    /** Runs every task waiting on [event] ("on:boot", …). */
    fun fireEvent(event: String) = _tasks.value.filter { it.repeat == event }.forEach { fire(it.id) }

    @Synchronized fun fire(id: Int) {
        val t = _tasks.value.firstOrNull { it.id == id } ?: return
        if (t.repeat.startsWith("on:")) {
            val app = WakilApp.instance
            if (!app.agent.running.value) app.agent.send("⚡ مهمة تلقائية (${eventLabel(t.repeat)}): ${t.prompt}", notifyResult = true)
            return
        }
        val next = nextAfter(t, System.currentTimeMillis())
        if (next == null) save(_tasks.value - t) else { val n = t.copy(nextAt = next); save(_tasks.value.map { if (it.id == id) n else it }); arm(n) }
        val app = WakilApp.instance
        if (app.agent.running.value) {
            // agent busy: try this run again in 3 minutes
            add(t.prompt, System.currentTimeMillis() + 3 * 60_000, "none", t.title + " (إعادة)")
            return
        }
        app.agent.send("⏰ مهمة مجدولة: ${t.prompt}", notifyResult = true)
    }

    private fun am() = ctx.getSystemService(AlarmManager::class.java)
    private fun pi(id: Int) = PendingIntent.getBroadcast(
        ctx, 7000 + id, Intent(ctx, TaskAlarmReceiver::class.java).putExtra("id", id),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    private fun arm(t: ScheduledTask) {
        if (t.repeat.startsWith("on:")) { EventTriggers.arm(ctx, t); return }
        val at = maxOf(t.nextAt, System.currentTimeMillis() + 5_000)
        val am = am()
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        runCatching {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(t.id))
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(t.id))
        }
    }

    fun canExact(): Boolean = Build.VERSION.SDK_INT < 31 || am().canScheduleExactAlarms()

    companion object {
        fun eventLabel(r: String) = when (r) { "on:charging" -> "عند الشحن"; "on:wifi" -> "عند الاتصال بالواي فاي"; "on:boot" -> "عند تشغيل الجوال"; else -> r }

        fun normRepeat(r: String): String {
            val s = r.trim().lowercase()
            return when {
                s in setOf("daily", "day", "يومي", "يوميا") -> "daily"
                s in setOf("hourly", "hour", "كل ساعة") -> "hourly"
                s.startsWith("every:") && s.removePrefix("every:").toIntOrNull()?.let { it >= 15 } == true -> s
                s in setOf("on:charging", "charging", "عند الشحن") -> "on:charging"
                s in setOf("on:wifi", "wifi", "عند الواي فاي", "عند wifi") -> "on:wifi"
                s in setOf("on:boot", "boot", "عند التشغيل") -> "on:boot"
                else -> "none"
            }
        }

        fun nextAfter(t: ScheduledTask, now: Long): Long? {
            val step = when {
                t.repeat == "daily" -> 24 * 3_600_000L
                t.repeat == "hourly" -> 3_600_000L
                t.repeat.startsWith("every:") -> t.repeat.removePrefix("every:").toLong() * 60_000L
                t.repeat.startsWith("on:") -> return t.nextAt
                else -> return null
            }
            var n = t.nextAt
            while (n <= now) n += step
            return n
        }

        /** "HH:MM" today (or tomorrow if passed), or minutes from now. */
        fun parseWhen(at: String?, inMinutes: Int?, now: Long = System.currentTimeMillis()): Long? {
            if (inMinutes != null && inMinutes > 0) return now + inMinutes * 60_000L
            val m = Regex("""^(\d{1,2}):(\d{2})$""").find(at?.trim() ?: return null) ?: return null
            val h = m.groupValues[1].toInt(); val mi = m.groupValues[2].toInt()
            if (h > 23 || mi > 59) return null
            val c = Calendar.getInstance().apply { timeInMillis = now; set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, mi); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
            if (c.timeInMillis <= now) c.add(Calendar.DAY_OF_MONTH, 1)
            return c.timeInMillis
        }

        fun notify(ctx: Context, title: String, text: String, id: Int = 9100) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel("wakil_results", "وكيل - نتائج المهام", NotificationManager.IMPORTANCE_DEFAULT))
            val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val n = android.app.Notification.Builder(ctx, "wakil_results")
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title).setContentText(text.take(200))
                .setStyle(android.app.Notification.BigTextStyle().bigText(text.take(3000)))
                .setContentIntent(open).setAutoCancel(true).build()
            runCatching { nm.notify(id, n) }
        }
    }
}

class TaskAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as WakilApp
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> { app.scheduler.rearmAll(); app.scheduler.fireEvent("on:boot") }
            "android.intent.action.MY_PACKAGE_REPLACED" -> app.scheduler.rearmAll()
            else -> app.scheduler.fire(intent.getIntExtra("id", -1))
        }
    }
}
