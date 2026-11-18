package com.wakil.agent.extra

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.PersistableBundle
import com.wakil.agent.WakilApp

/**
 * "When X happens" automations (charging started, joined Wi-Fi) without a background service:
 * a JobScheduler job waits for the condition, runs the task once, then a light watcher job
 * (every 15 min) re-arms it after the condition ends, so it fires once per plug-in / Wi-Fi join.
 */
object EventTriggers {
    private const val TRIGGER = 20_000
    private const val WATCH = 30_000

    private fun js(ctx: Context) = ctx.getSystemService(JobScheduler::class.java)
    private fun comp(ctx: Context) = ComponentName(ctx, TriggerJob::class.java)

    fun arm(ctx: Context, t: ScheduledTask) {
        val b = JobInfo.Builder(TRIGGER + t.id, comp(ctx)).setPersisted(true)
            .setExtras(PersistableBundle().apply { putInt("id", t.id); putString("ev", t.repeat) })
        when (t.repeat) {
            "on:charging" -> b.setRequiresCharging(true)
            "on:wifi" -> b.setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
            else -> return // on:boot is handled by the boot receiver
        }
        if (active(ctx, t.repeat)) { watch(ctx, t); return } // already charging / on Wi-Fi: wait for the next time
        runCatching { js(ctx).schedule(b.build()) }
    }

    private fun watch(ctx: Context, t: ScheduledTask) = runCatching {
        js(ctx).schedule(
            JobInfo.Builder(WATCH + t.id, comp(ctx)).setPersisted(true).setPeriodic(15 * 60_000L)
                .setExtras(PersistableBundle().apply { putInt("id", t.id); putString("ev", t.repeat) }).build()
        )
    }

    fun cancel(ctx: Context, id: Int) { runCatching { js(ctx).cancel(TRIGGER + id); js(ctx).cancel(WATCH + id) } }

    fun active(ctx: Context, ev: String): Boolean = when (ev) {
        "on:charging" -> ctx.getSystemService(BatteryManager::class.java).isCharging
        "on:wifi" -> ctx.getSystemService(ConnectivityManager::class.java).let { cm ->
            cm.getNetworkCapabilities(cm.activeNetwork)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        }
        else -> false
    }

    class TriggerJob : JobService() {
        override fun onStartJob(p: JobParameters): Boolean {
            val id = p.extras.getInt("id", -1); val ev = p.extras.getString("ev") ?: return false
            val app = applicationContext as WakilApp
            val t = app.scheduler.tasks.value.firstOrNull { it.id == id }
            if (t == null) { cancel(this, id); return false }
            if (p.jobId >= WATCH) {
                if (!active(this, ev)) { js(this).cancel(WATCH + id); arm(this, t) }
            } else {
                app.scheduler.fire(id)
                watch(this, t)
            }
            return false
        }
        override fun onStopJob(p: JobParameters) = false
    }
}
