package com.wakil.agent.ui.code

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue

/** Pure editing helpers (auto-indent, bracket pairing, completion). Kept free of Compose UI for unit tests. */
object EditorLogic {
    private val pairs = mapOf('(' to ')', '[' to ']', '{' to '}')

    fun indentUnit(lang: Lang) = when (lang) {
        Lang.DART, Lang.JS, Lang.TS, Lang.HTML, Lang.XML, Lang.CSS, Lang.JSON, Lang.YAML, Lang.MARKDOWN -> "  "
        else -> "    "
    }

    private fun lineStartOf(t: String, pos: Int) = t.lastIndexOf('\n', (pos - 1).coerceAtLeast(-1)).let { if (pos == 0) 0 else it + 1 }

    fun leadingWs(t: String, pos: Int): String {
        val s = lineStartOf(t, pos)
        var e = s; while (e < t.length && e < pos && (t[e] == ' ' || t[e] == '\t')) e++
        return t.substring(s, e)
    }

    /** Applies smart editing to a raw change coming from the text field. */
    fun process(old: TextFieldValue, new: TextFieldValue, lang: Lang): TextFieldValue {
        val o = old.text; val n = new.text
        if (!new.selection.collapsed || n.length != o.length + 1) return new
        val pos = new.selection.start            // caret after the inserted char
        if (pos <= 0 || pos > n.length) return new
        if (o.substring(0, pos - 1) != n.substring(0, pos - 1)) return new
        val ch = n[pos - 1]
        val unit = indentUnit(lang)
        when {
            ch == '\n' -> {
                val base = leadingWs(o, pos - 1)
                val before = o.substring(0, pos - 1).trimEnd(' ', '\t').lastOrNull()
                val after = o.getOrNull(pos - 1)
                val opens = before != null && (before in pairs.keys || (before == ':' && (lang == Lang.PYTHON || lang == Lang.YAML)) ||
                    (before == '>' && (lang == Lang.HTML || lang == Lang.XML) && !o.substring(0, pos - 1).trimEnd().endsWith("/>")))
                return if (opens && after != null && (pairs[before] == after || (before == '>' && after == '<'))) {
                    val ins = "\n" + base + unit + "\n" + base
                    val t = o.substring(0, pos - 1) + ins + o.substring(pos - 1)
                    TextFieldValue(t, TextRange(pos + base.length + unit.length))
                } else {
                    val ins = "\n" + base + if (opens) unit else ""
                    val t = o.substring(0, pos - 1) + ins + o.substring(pos - 1)
                    TextFieldValue(t, TextRange(pos - 1 + ins.length))
                }
            }
            ch in pairs.keys -> {
                val next = o.getOrNull(pos - 1)
                if (next == null || next.isWhitespace() || next in ")]};,") {
                    val t = n.substring(0, pos) + pairs[ch] + n.substring(pos)
                    return TextFieldValue(t, TextRange(pos))
                }
            }
            ch in pairs.values -> {
                // typing a closer right before the same closer just steps over it
                if (o.getOrNull(pos - 1) == ch) return TextFieldValue(o, TextRange(pos))
            }
            ch == '"' || ch == '\'' || ch == '`' -> {
                val next = o.getOrNull(pos - 1)
                if (next == ch) return TextFieldValue(o, TextRange(pos))
                val prev = o.getOrNull(pos - 2)
                if ((next == null || next.isWhitespace() || next in ")]};,") && (prev == null || !prev.isLetterOrDigit())) {
                    return TextFieldValue(n.substring(0, pos) + ch + n.substring(pos), TextRange(pos))
                }
            }
        }
        return new
    }

    /** Inserts [text] at the caret (replacing the selection). "$0" marks where the caret lands; new lines keep indentation. */
    fun insert(v: TextFieldValue, text: String): TextFieldValue {
        val s = v.selection.min; val e = v.selection.max
        val base = leadingWs(v.text, s)
        val body = text.replace("\n", "\n$base")
        val caret = body.indexOf("$0").let { if (it < 0) body.length else it }
        val clean = body.replace("$0", "")
        return TextFieldValue(v.text.substring(0, s) + clean + v.text.substring(e), TextRange(s + caret))
    }

    fun currentWord(v: TextFieldValue): String {
        if (!v.selection.collapsed) return ""
        var i = v.selection.start
        while (i > 0 && (v.text[i - 1].isLetterOrDigit() || v.text[i - 1] == '_' || v.text[i - 1] == '-' && false)) i--
        return v.text.substring(i, v.selection.start)
    }

    fun applyCompletion(v: TextFieldValue, prefix: String, insertText: String): TextFieldValue {
        val s = v.selection.start - prefix.length
        val tail = v.text.substring(v.selection.start)
        // also swallow the rest of the word after the caret
        var k = 0; while (k < tail.length && (tail[k].isLetterOrDigit() || tail[k] == '_')) k++
        val base = TextFieldValue(v.text.substring(0, s) + v.text.substring(v.selection.start + k), TextRange(s))
        return insert(base, insertText)
    }

    data class Suggestion(val label: String, val insert: String, val kind: Char) // k=keyword, s=snippet, w=word

    private val wordRe = Regex("[A-Za-z_][A-Za-z0-9_]{2,}")

    fun words(text: String): Set<String> = if (text.length > 200_000) emptySet()
        else wordRe.findAll(text).map { it.value }.toHashSet()

    fun suggest(prefix: String, lang: Lang, fileWords: Set<String>, limit: Int = 14): List<Suggestion> {
        if (prefix.isEmpty() || prefix.first().isDigit()) return emptyList()
        val p = prefix.lowercase()
        val out = LinkedHashMap<String, Suggestion>()
        Keywords.snippets[lang].orEmpty().filter { it.first.lowercase().startsWith(p) }
            .forEach { out["s:" + it.first] = Suggestion(it.first, it.second, 's') }
        Keywords.map[lang].orEmpty().filter { it.lowercase().startsWith(p) && it != prefix }
            .sortedBy { it.length }.forEach { out.putIfAbsent(it, Suggestion(it, it, 'k')) }
        fileWords.asSequence().filter { it != prefix && it.lowercase().startsWith(p) }
            .sortedWith(compareBy({ !it.startsWith(prefix) }, { it.length })).take(limit)
            .forEach { out.putIfAbsent(it, Suggestion(it, it, 'w')) }
        if (out.isEmpty() && p.length >= 2) {
            // fuzzy: contains
            fileWords.asSequence().filter { it != prefix && it.lowercase().contains(p) }.take(limit / 2)
                .forEach { out.putIfAbsent(it, Suggestion(it, it, 'w')) }
        }
        return out.values.take(limit)
    }

    fun indentSelection(v: TextFieldValue, lang: Lang, outdent: Boolean): TextFieldValue {
        val unit = indentUnit(lang)
        if (v.selection.collapsed && !outdent) return insert(v, unit)
        val t = v.text
        val s = lineStartOf(t, v.selection.min)
        val e = v.selection.max
        val lines = t.substring(s, e).split('\n')
        val changed = lines.joinToString("\n") { l ->
            if (outdent) { val k = l.takeWhile { it == ' ' }.length.coerceAtMost(unit.length); l.substring(k) } else unit + l
        }
        val nt = t.substring(0, s) + changed + t.substring(e)
        return TextFieldValue(nt, if (v.selection.collapsed) TextRange((v.selection.start - (t.length - nt.length)).coerceAtLeast(s)) else TextRange(s, s + changed.length))
    }

    fun findNext(text: String, query: String, from: Int, ignoreCase: Boolean = true): IntRange? {
        if (query.isEmpty()) return null
        val i = text.indexOf(query, from, ignoreCase).takeIf { it >= 0 } ?: text.indexOf(query, 0, ignoreCase).takeIf { it >= 0 } ?: return null
        return i until i + query.length
    }

    fun countOf(text: String, query: String): Int {
        if (query.isEmpty()) return 0
        var c = 0; var i = text.indexOf(query, 0, true)
        while (i >= 0) { c++; i = text.indexOf(query, i + query.length, true) }
        return c
    }
}

/** Undo/redo stack that coalesces fast typing. */
class EditHistory(initial: TextFieldValue) {
    private val undo = ArrayDeque<TextFieldValue>()
    private val redo = ArrayDeque<TextFieldValue>()
    private var last = initial
    private var lastTime = 0L

    val canUndo get() = undo.isNotEmpty()
    val canRedo get() = redo.isNotEmpty()

    fun record(prev: TextFieldValue, next: TextFieldValue, now: Long = System.currentTimeMillis()) {
        if (prev.text == next.text) { last = next; return }
        val burst = now - lastTime < 900 && !next.text.endsWith("\n")
        if (!burst || undo.isEmpty()) {
            undo.addLast(prev); if (undo.size > 200) undo.removeFirst()
        }
        redo.clear(); last = next; lastTime = now
    }

    fun undo(current: TextFieldValue): TextFieldValue? {
        val v = undo.removeLastOrNull() ?: return null
        redo.addLast(current); lastTime = 0; return v
    }

    fun redo(current: TextFieldValue): TextFieldValue? {
        val v = redo.removeLastOrNull() ?: return null
        undo.addLast(current); lastTime = 0; return v
    }
}
