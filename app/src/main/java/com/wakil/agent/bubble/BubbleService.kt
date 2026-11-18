package com.wakil.agent.bubble

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.wakil.agent.MainActivity
import com.wakil.agent.R
import com.wakil.agent.VoiceActivity
import com.wakil.agent.WakilApp
import com.wakil.agent.agent.ItemKind
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Floating robot bubble drawn over other apps. Drag it anywhere; tap it to open a small panel where you can
 * type or speak a task without leaving the app you're in. The agent's latest reply shows in the panel.
 */
class BubbleService : Service() {
    private lateinit var wm: WindowManager
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var bubble: View? = null
    private var panel: View? = null
    private lateinit var bubbleLp: WindowManager.LayoutParams
    private var replyView: TextView? = null
    private var statusView: TextView? = null

    private val app get() = application as WakilApp
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val n = Notification.Builder(this, WakilApp.CHANNEL_ID)
            .setContentTitle("فقاعة وكيل تعمل")
            .setContentText("اضغط على الفقاعة لتكلّم الوكيل من أي تطبيق")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
            .build()
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            else startForeground(NOTIF_ID, n)
        } catch (e: Exception) { stopSelf(); return }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return }
        showBubble()
        scope.launch {
            combine(app.agent.items, app.agent.running, app.agent.streaming) { items, running, _ -> items to running }.collect { (items, running) ->
                val last = items.lastOrNull { it.kind == ItemKind.ASSISTANT || it.kind == ItemKind.ERROR || it.kind == ItemKind.TOOL_CALL || it.kind == ItemKind.INFO }
                val txt = when (last?.kind) {
                    null -> "أهلاً! اكتب أو تكلّم وأنا أنفّذ."
                    ItemKind.TOOL_CALL -> "⚙ ${last.title}"
                    else -> last.text
                }
                replyView?.text = txt
                statusView?.text = if (running) "● يعمل…" else "● جاهز"
                statusView?.setTextColor(if (running) AMBER else CYAN)
                bubble?.alpha = if (running) 1f else 0.92f
            }
        }
        running = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        running = false
        scope.cancel()
        bubble?.let { runCatching { wm.removeView(it) } }; bubble = null
        panel?.let { runCatching { wm.removeView(it) } }; panel = null
        super.onDestroy()
    }

    private fun overlayType() = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

    @SuppressLint("ClickableViewAccessibility")
    private fun showBubble() {
        val size = dp(58)
        val img = ImageView(this).apply {
            setImageResource(R.drawable.wakil_robot_head)
            scaleType = ImageView.ScaleType.CENTER_CROP
            setPadding(dp(5), dp(5), dp(5), dp(5))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0xE6070B14.toInt()); setStroke(dp(2), CYAN)
            }
            elevation = dp(8).toFloat()
            contentDescription = "وكيل"
        }
        bubbleLp = WindowManager.LayoutParams(
            size, size, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = resources.displayMetrics.widthPixels - size - dp(8); y = resources.displayMetrics.heightPixels / 3
        }
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        img.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = bubbleLp.x; startY = bubbleLp.y; moved = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (abs(dx) > dp(6) || abs(dy) > dp(6)) moved = true
                    if (moved) { bubbleLp.x = startX + dx.toInt(); bubbleLp.y = startY + dy.toInt(); runCatching { wm.updateViewLayout(v, bubbleLp) } }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) togglePanel() else snapToEdge(v)
                    true
                }
                else -> false
            }
        }
        bubble = img
        wm.addView(img, bubbleLp)
    }

    private fun snapToEdge(v: View) {
        val w = resources.displayMetrics.widthPixels
        val target = if (bubbleLp.x + v.width / 2 < w / 2) dp(4) else w - v.width - dp(4)
        ValueAnimator.ofInt(bubbleLp.x, target).apply {
            duration = 220
            addUpdateListener { bubbleLp.x = it.animatedValue as Int; runCatching { wm.updateViewLayout(v, bubbleLp) } }
            start()
        }
    }

    private fun togglePanel() { if (panel != null) closePanel() else openPanel() }

    private fun closePanel() {
        panel?.let { p ->
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(p.windowToken, 0)
            runCatching { wm.removeView(p) }
        }
        panel = null; replyView = null; statusView = null
    }

    private fun openPanel() {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply {
                cornerRadius = dp(22).toFloat(); setColor(0xF2070B14.toInt()); setStroke(dp(1), 0x6600E5FF)
            }
            elevation = dp(12).toFloat()
        }
        // header
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        header.addView(TextView(this).apply { text = "وكيل"; setTextColor(Color.WHITE); textSize = 17f; typeface = Typeface.DEFAULT_BOLD })
        val status = TextView(this).apply { textSize = 12f; setPadding(dp(10), 0, dp(10), 0) }
        header.addView(status, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        header.addView(iconButton(android.R.drawable.ic_menu_view, "فتح التطبيق") {
            closePanel(); startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        })
        header.addView(iconButton(android.R.drawable.ic_menu_close_clear_cancel, "إغلاق") { closePanel() })
        card.addView(header)
        // last reply
        val reply = TextView(this).apply {
            setTextColor(0xFFDCE6F5.toInt()); textSize = 14.5f; setLineSpacing(0f, 1.15f); setTextIsSelectable(true)
            textDirection = View.TEXT_DIRECTION_FIRST_STRONG
        }
        val sc = ScrollView(this).apply { addView(reply); isVerticalScrollBarEnabled = true }
        card.addView(sc, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(150)).apply { topMargin = dp(8); bottomMargin = dp(10) })
        // input row
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val edit = EditText(this).apply {
            hint = "اكتب مهمتك…"; setHintTextColor(0xFF6B7A90.toInt()); setTextColor(Color.WHITE); textSize = 15f
            maxLines = 3; imeOptions = EditorInfo.IME_ACTION_SEND; setSingleLine(false)
            inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_FLAG_MULTI_LINE
            ellipsize = TextUtils.TruncateAt.END
            background = GradientDrawable().apply { cornerRadius = dp(18).toFloat(); setColor(0xFF0E1626.toInt()); setStroke(dp(1), 0x3300E5FF) }
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }
        fun submit() {
            val t = edit.text.toString().trim(); if (t.isEmpty()) return
            app.agent.send(t); edit.setText("")
        }
        edit.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_SEND) { submit(); true } else false }
        row.addView(edit, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(iconButton(android.R.drawable.ic_btn_speak_now, "تكلّم") {
            closePanel()
            startActivity(Intent(this, VoiceActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION))
        })
        row.addView(iconButton(android.R.drawable.ic_menu_send, "إرسال") { submit() })
        row.addView(iconButton(android.R.drawable.ic_media_pause, "إيقاف") { app.agent.stop() })
        card.addView(row)

        val root = FrameLayout(this).apply { addView(card) }
        val w = (resources.displayMetrics.widthPixels * 0.9).toInt().coerceAtMost(dp(420))
        val lp = WindowManager.LayoutParams(
            w, ViewGroup.LayoutParams.WRAP_CONTENT, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = (bubbleLp.y + dp(66)).coerceAtMost(resources.displayMetrics.heightPixels / 2)
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN or WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
        }
        replyView = reply; statusView = status
        panel = root
        wm.addView(root, lp)
        // fill with current state
        val items = app.agent.items.value
        val last = items.lastOrNull { it.kind == ItemKind.ASSISTANT || it.kind == ItemKind.ERROR || it.kind == ItemKind.INFO }
        reply.text = last?.text ?: "أهلاً! اكتب أو تكلّم وأنا أنفّذ."
        val busy = app.agent.running.value
        status.text = if (busy) "● يعمل…" else "● جاهز"; status.setTextColor(if (busy) AMBER else CYAN)
        edit.requestFocus()
    }

    private fun iconButton(res: Int, desc: String, onClick: () -> Unit) = ImageView(this).apply {
        setImageResource(res); setColorFilter(CYAN); contentDescription = desc
        setPadding(dp(8), dp(8), dp(8), dp(8))
        layoutParams = LinearLayout.LayoutParams(dp(42), dp(42))
        setOnClickListener { onClick() }
    }

    companion object {
        private const val NOTIF_ID = 43
        private const val CYAN = 0xFF00E5FF.toInt()
        private const val AMBER = 0xFFFFB020.toInt()
        @Volatile var running = false; private set

        fun start(ctx: Context) { runCatching { ctx.startForegroundService(Intent(ctx, BubbleService::class.java)) } }
        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, BubbleService::class.java)) }
    }
}
