package com.wakil.agent.agent

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.wakil.agent.MainActivity
import com.wakil.agent.WakilApp

/**
 * When the agent is driving another app, the in-app approval dialog is not visible.
 * This posts a heads-up notification with Allow / Deny actions as well.
 */
object ApprovalNotifier {
    private const val ID = 77

    fun show(ctx: Context, tool: String, args: String) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        fun action(a: String, code: Int) = PendingIntent.getBroadcast(
            ctx, code, Intent(ctx, ApprovalReceiver::class.java).setAction(a),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = Notification.Builder(ctx, WakilApp.APPROVAL_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("وكيل يطلب إذناً: $tool")
            .setContentText(args.replace('\n', ' ').take(120))
            .setStyle(Notification.BigTextStyle().bigText(args.take(600)))
            .setContentIntent(open)
            .setAutoCancel(true)
            .addAction(Notification.Action.Builder(null, "سماح", action(ApprovalReceiver.ALLOW, 1)).build())
            .addAction(Notification.Action.Builder(null, "رفض", action(ApprovalReceiver.DENY, 2)).build())
            .build()
        runCatching { nm.notify(ID, n) }
    }

    fun cancel(ctx: Context) {
        runCatching { ctx.getSystemService(NotificationManager::class.java).cancel(ID) }
    }
}

class ApprovalReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val agent = WakilApp.instance.agent
        when (intent.action) {
            ALLOW -> agent.answerApproval(Approval.ONCE)
            DENY -> agent.answerApproval(Approval.DENY)
        }
        ApprovalNotifier.cancel(context)
    }

    companion object {
        const val ALLOW = "com.wakil.agent.APPROVE"
        const val DENY = "com.wakil.agent.DENY"
    }
}
