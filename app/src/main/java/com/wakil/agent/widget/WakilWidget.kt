package com.wakil.agent.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.wakil.agent.MainActivity
import com.wakil.agent.R
import com.wakil.agent.VoiceActivity

/** Home-screen widget: the robot, an "اسأل وكيل…" box that opens the chat, and a mic button. */
class WakilWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val chat = PendingIntent.getActivity(ctx, 41, Intent(ctx, MainActivity::class.java).putExtra("tab", 0).putExtra("focus_input", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), flags)
        val mic = PendingIntent.getActivity(ctx, 42, Intent(ctx, VoiceActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)
        val talk = PendingIntent.getActivity(ctx, 43, Intent(ctx, MainActivity::class.java).putExtra("voice_chat", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), flags)
        ids.forEach { id ->
            val v = RemoteViews(ctx.packageName, R.layout.widget_wakil)
            v.setOnClickPendingIntent(R.id.w_ask, chat)
            v.setOnClickPendingIntent(R.id.w_mic, mic)
            v.setOnClickPendingIntent(R.id.w_robot, talk)
            mgr.updateAppWidget(id, v)
        }
    }
}
