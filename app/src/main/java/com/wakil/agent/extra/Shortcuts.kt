package com.wakil.agent.extra

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import com.wakil.agent.MainActivity
import com.wakil.agent.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class SavedShortcut(val id: Int, val title: String, val prompt: String)

/**
 * Saved prompts the user runs with one tap: from Settings, from a pinned home-screen icon,
 * or from the long-press menu of Wakil's launcher icon (top 4).
 */
class Shortcuts(private val ctx: Context) {
    private val file = File(ctx.filesDir, "shortcuts.json")
    private val _items = MutableStateFlow(load())
    val items: StateFlow<List<SavedShortcut>> = _items

    private fun load(): List<SavedShortcut> = runCatching {
        val a = JSONArray(file.readText())
        (0 until a.length()).map { val o = a.getJSONObject(it); SavedShortcut(o.getInt("id"), o.getString("t"), o.getString("p")) }
    }.getOrDefault(DEFAULTS)

    private fun save(l: List<SavedShortcut>) {
        _items.value = l
        runCatching {
            val a = JSONArray(); l.forEach { a.put(JSONObject().put("id", it.id).put("t", it.title).put("p", it.prompt)) }
            file.writeText(a.toString())
        }
        publishDynamic()
    }

    fun reload() { _items.value = load(); publishDynamic() }

    fun add(title: String, prompt: String): SavedShortcut {
        val s = SavedShortcut((_items.value.maxOfOrNull { it.id } ?: 0) + 1, title.ifBlank { prompt.take(24) }.trim(), prompt.trim())
        save(_items.value + s); return s
    }

    fun remove(id: Int) { save(_items.value.filterNot { it.id == id }); runCatching { sm().disableShortcuts(listOf("s$id")) } }

    private fun sm() = ctx.getSystemService(ShortcutManager::class.java)

    private fun info(s: SavedShortcut) = ShortcutInfo.Builder(ctx, "s${s.id}")
        .setShortLabel(s.title.take(24)).setLongLabel(s.title.take(40))
        .setIcon(Icon.createWithResource(ctx, R.mipmap.ic_launcher))
        .setIntent(runIntent(ctx, s.prompt))
        .build()

    /** Top 4 shortcuts appear when the user long-presses Wakil's icon. */
    fun publishDynamic() = runCatching {
        val m = sm(); val max = minOf(4, m.maxShortcutCountPerActivity)
        m.dynamicShortcuts = _items.value.take(max).map { info(it) }
    }

    /** Asks the launcher to add an icon for this shortcut to the home screen. */
    fun pin(s: SavedShortcut): Boolean = runCatching {
        val m = sm(); if (!m.isRequestPinShortcutSupported) return false
        m.requestPinShortcut(info(s), null)
    }.getOrDefault(false)

    companion object {
        const val ACTION_RUN = "com.wakil.agent.RUN_PROMPT"
        const val EXTRA_PROMPT = "prompt"
        fun runIntent(ctx: Context, prompt: String) = Intent(ctx, MainActivity::class.java)
            .setAction(ACTION_RUN).putExtra(EXTRA_PROMPT, prompt)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val DEFAULTS = listOf(
            SavedShortcut(1, "حالة الجوال", "أعطني ملخصاً لحالة الجوال: البطارية والذاكرة والتخزين والشبكة."),
            SavedShortcut(2, "أخبار التقنية", "ابحث في الإنترنت عن أهم 5 أخبار تقنية اليوم ولخّصها بالعربي."),
            SavedShortcut(3, "نظّف التنزيلات", "اعرض لي أكبر 10 ملفات في مجلد التنزيلات واقترح ما يمكن حذفه، ولا تحذف شيئاً قبل أن أوافق."),
        )
    }
}
