package com.wakil.agent.access

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** Screen reading & control. Enabled by the user in Settings > Accessibility. */
class WakilAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() { instance = this }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onDestroy() { if (instance === this) instance = null; super.onDestroy() }

    data class UiNode(val label: String, val cls: String, val bounds: Rect, val clickable: Boolean, val editable: Boolean, val scrollable: Boolean)

    private fun collect(): List<UiNode> {
        val out = mutableListOf<UiNode>()
        val roots = runCatching { windows.mapNotNull { it.root } }.getOrDefault(emptyList())
            .ifEmpty { listOfNotNull(rootInActiveWindow) }
        fun walk(n: AccessibilityNodeInfo?, depth: Int) {
            if (n == null || depth > 40 || out.size > 400) return
            val text = n.text?.toString()?.trim().orEmpty()
            val desc = n.contentDescription?.toString()?.trim().orEmpty()
            val label = when {
                text.isNotEmpty() && desc.isNotEmpty() && desc != text -> "$text ($desc)"
                text.isNotEmpty() -> text
                desc.isNotEmpty() -> desc
                n.isEditable -> n.hintText?.toString() ?: ""
                else -> ""
            }
            if (n.isVisibleToUser && (label.isNotEmpty() || n.isClickable || n.isEditable || n.isScrollable)) {
                val r = Rect(); n.getBoundsInScreen(r)
                if (r.width() > 0 && r.height() > 0)
                    out += UiNode(label.take(80), n.className?.toString()?.substringAfterLast('.') ?: "View", r, n.isClickable, n.isEditable, n.isScrollable)
            }
            for (i in 0 until n.childCount) walk(n.getChild(i), depth + 1)
        }
        roots.forEach { walk(it, 0) }
        return out
    }

    fun readScreen(): String {
        val pkg = rootInActiveWindow?.packageName ?: "?"
        val nodes = collect()
        val sb = StringBuilder("app=$pkg, ${nodes.size} elements (label | type | center x,y | flags):\n")
        nodes.take(150).forEachIndexed { i, n ->
            val flags = buildString {
                if (n.clickable) append("click ")
                if (n.editable) append("edit ")
                if (n.scrollable) append("scroll")
            }.trim()
            sb.append("[$i] \"${n.label}\" | ${n.cls} | ${n.bounds.centerX()},${n.bounds.centerY()} | $flags\n")
        }
        return sb.toString()
    }

    /** Screenshot of the default display (Android 11+); null when not supported or refused. */
    suspend fun screenshot(): android.graphics.Bitmap? {
        if (android.os.Build.VERSION.SDK_INT < 30) return null
        return suspendCancellableCoroutine { cont ->
            runCatching {
                takeScreenshot(android.view.Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                    override fun onSuccess(r: ScreenshotResult) {
                        val hb = r.hardwareBuffer
                        val bmp = android.graphics.Bitmap.wrapHardwareBuffer(hb, r.colorSpace)
                            ?.copy(android.graphics.Bitmap.Config.ARGB_8888, false)
                        hb.close()
                        if (cont.isActive) cont.resume(bmp)
                    }
                    override fun onFailure(code: Int) { if (cont.isActive) cont.resume(null) }
                })
            }.onFailure { if (cont.isActive) cont.resume(null) }
        }
    }

    fun activePackage(): String? = rootInActiveWindow?.packageName?.toString()

    /** Finds a node whose text/description matches [text] (Arabic-normalized); returns its center or null. */
    fun findCenter(text: String): Pair<Int, Int>? {
        val nodes = collect(); val t = TextMatch.norm(text)
        if (t.isEmpty()) return null
        val n = nodes.firstOrNull { TextMatch.norm(it.label) == t }
            ?: nodes.firstOrNull { TextMatch.norm(it.label).contains(t) }
            ?: nodes.firstOrNull { val l = TextMatch.norm(it.label); l.length >= 2 && t.contains(l) } ?: return null
        return n.bounds.centerX() to n.bounds.centerY()
    }

    /** Up to [max] visible labels closest to [text], to tell the model what it can tap instead. */
    fun suggestions(text: String, max: Int = 6): List<String> =
        TextMatch.closest(text, collect().map { it.label }.filter { it.isNotBlank() }, max)

    suspend fun tapText(text: String): String {
        val root = rootInActiveWindow ?: return "ERROR: no active window"
        val matches = root.findAccessibilityNodeInfosByText(text)
        val node = matches.firstOrNull { it.isVisibleToUser }
        if (node != null) {
            var c: AccessibilityNodeInfo? = node
            while (c != null && !c.isClickable) c = c.parent
            if (c != null && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return "clicked \"$text\""
            val r = Rect(); node.getBoundsInScreen(r)
            return if (tap(r.centerX(), r.centerY())) "tapped \"$text\" at ${r.centerX()},${r.centerY()}" else "ERROR: tap failed"
        }
        val p = findCenter(text) ?: return "ERROR: text not found on screen: $text" +
            suggestions(text).let { if (it.isEmpty()) "" else ". Visible labels you can tap: " + it.joinToString(" | ") { l -> "\"$l\"" } } +
            ". Do not retry the same text; pick one of these, use tap_xy, scroll, or open_app."
        return if (tap(p.first, p.second)) "tapped \"$text\" at ${p.first},${p.second}" else "ERROR: tap failed"
    }

    suspend fun tap(x: Int, y: Int): Boolean {
        val path = Path().apply { moveTo(x.toFloat(), y.toFloat()) }
        return gesture(GestureDescription.StrokeDescription(path, 0, 60))
    }

    suspend fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, ms: Long = 350): Boolean {
        val path = Path().apply { moveTo(x1.toFloat(), y1.toFloat()); lineTo(x2.toFloat(), y2.toFloat()) }
        return gesture(GestureDescription.StrokeDescription(path, 0, ms))
    }

    private suspend fun gesture(stroke: GestureDescription.StrokeDescription): Boolean =
        suspendCancellableCoroutine { cont ->
            val ok = dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), object : GestureResultCallback() {
                override fun onCompleted(g: GestureDescription?) { if (cont.isActive) cont.resume(true) }
                override fun onCancelled(g: GestureDescription?) { if (cont.isActive) cont.resume(false) }
            }, null)
            if (!ok && cont.isActive) cont.resume(false)
        }

    fun typeText(text: String): String {
        val root = rootInActiveWindow ?: return "ERROR: no active window"
        var target = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (target == null || !target.isEditable) {
            target = findEditable(root) ?: return "ERROR: no editable field found (tap a text field first)"
            target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        }
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return if (target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) "typed text" else "ERROR: set text failed"
    }

    private fun findEditable(n: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (n == null) return null
        if (n.isEditable && n.isVisibleToUser) return n
        for (i in 0 until n.childCount) findEditable(n.getChild(i))?.let { return it }
        return null
    }

    suspend fun scroll(direction: String): String {
        val dm = resources.displayMetrics
        val w = dm.widthPixels; val h = dm.heightPixels
        val cx = w / 2; val cy = h / 2
        val ok = when (direction.lowercase()) {
            "down" -> swipe(cx, (h * 0.75).toInt(), cx, (h * 0.25).toInt())   // content moves up => see further down
            "up" -> swipe(cx, (h * 0.25).toInt(), cx, (h * 0.75).toInt())
            "left" -> swipe((w * 0.2).toInt(), cy, (w * 0.8).toInt(), cy)
            "right" -> swipe((w * 0.8).toInt(), cy, (w * 0.2).toInt(), cy)
            else -> return "ERROR: direction must be up/down/left/right"
        }
        return if (ok) "scrolled $direction" else "ERROR: scroll gesture failed"
    }

    fun back() = performGlobalAction(GLOBAL_ACTION_BACK)
    fun home() = performGlobalAction(GLOBAL_ACTION_HOME)

    companion object {
        @Volatile var instance: WakilAccessibilityService? = null
            private set

        fun isEnabledInSettings(ctx: Context): Boolean {
            val s = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return s.split(':').any { it.startsWith(ctx.packageName + "/") }
        }
    }
}
