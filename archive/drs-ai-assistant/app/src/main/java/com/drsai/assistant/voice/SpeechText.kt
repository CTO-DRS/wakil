package com.drsai.assistant.voice

/**
 * Turns assistant replies (markdown, emoji, code) into speakable sentences for the TTS.
 * Pure Kotlin so it is unit-tested on the JVM.
 */
object SpeechText {
    /** Longest chunk handed to the synthesizer; longer sentences are split at commas / spaces. */
    const val MAX_CHUNK = 220

    private const val FENCE = "```"
    private const val ENDERS = ".!?؟…؛"

    private val IMAGE = Regex("!\\[[^\\]]*]\\([^)]*\\)")
    private val LINK = Regex("\\[([^\\]]*)]\\([^)]*\\)")
    private val URL = Regex("(?:https?://|www\\.)\\S+")
    private val INLINE_CODE = Regex("`[^`]*`")
    private val HEADING = Regex("(?m)^\\s{0,3}#{1,6}\\s*")
    private val QUOTE = Regex("(?m)^\\s*>+\\s?")
    private val BULLET = Regex("(?m)^\\s*(?:[-*+•▪◦]|\\d{1,3}[.)]|[٠-٩]{1,3}[.)])\\s+")
    private val RULE = Regex("(?m)^\\s*(?:[-*_=]\\s*){3,}$")
    private val EMPHASIS = Regex("[*_~]+")
    private val TABLE = Regex("[|]+")
    private val WS = Regex("\\s+")
    private val SPACE_BEFORE_PUNCT = Regex("\\s+([.,!?;:،؛؟…])")

    /**
     * Removes fenced code blocks. An unclosed fence hides everything after it. While the
     * reply is still streaming ([final] = false) a trailing run of backticks is held back
     * because it may become a fence.
     */
    fun stripCode(text: String, final: Boolean): String {
        val sb = StringBuilder(text.length)
        var i = 0
        while (true) {
            val open = text.indexOf(FENCE, i)
            if (open < 0) {
                var rest = text.substring(i)
                if (!final) rest = rest.trimEnd('`')
                sb.append(rest)
                break
            }
            sb.append(text, i, open).append('\n')
            val close = text.indexOf(FENCE, open + FENCE.length)
            if (close < 0) break
            i = close + FENCE.length
        }
        return sb.toString()
    }

    /**
     * True when position [i] ends a sentence. A newline always does; `. ! ? ؟ … ؛` do when
     * followed by whitespace (or the end of the text when [atEndIsBoundary]). A period after a
     * digit ("1." list numbers, "2.5") or before another period does not.
     */
    fun isBoundary(s: CharSequence, i: Int, atEndIsBoundary: Boolean): Boolean {
        val c = s[i]
        if (c == '\n') return true
        if (c !in ENDERS) return false
        if (c == '.' && i > 0 && (s[i - 1].isDigit())) return false
        val next = if (i + 1 < s.length) s[i + 1] else return atEndIsBoundary
        if (c == '.' && next == '.') return false
        return next.isWhitespace()
    }

    /** Splits finished text (code already stripped) into cleaned, speakable chunks. */
    fun sentences(text: String): List<String> {
        val out = ArrayList<String>()
        var start = 0
        for (i in text.indices) {
            if (isBoundary(text, i, atEndIsBoundary = true)) {
                addPiece(text.substring(start, i + 1), out)
                start = i + 1
            }
        }
        if (start < text.length) addPiece(text.substring(start), out)
        return out
    }

    /** Full message to chunks: strip code, split, clean. */
    fun forSpeech(message: String): List<String> = sentences(stripCode(message, final = true))

    private fun addPiece(piece: String, out: MutableList<String>) {
        val cleaned = clean(piece)
        if (!isSpeakable(cleaned)) return
        out.addAll(chunk(cleaned))
    }

    /** Strips markdown syntax, links, URLs, inline code and emoji; collapses whitespace. */
    fun clean(s: String): String {
        var t = s
        t = IMAGE.replace(t, " ")
        t = LINK.replace(t) { it.groupValues[1] }
        t = URL.replace(t, " ")
        t = INLINE_CODE.replace(t, " ")
        t = RULE.replace(t, " ")
        t = HEADING.replace(t, "")
        t = QUOTE.replace(t, "")
        t = BULLET.replace(t, "")
        t = EMPHASIS.replace(t, "")
        t = TABLE.replace(t, " ")
        t = removeEmoji(t)
        t = WS.replace(t, " ")
        return SPACE_BEFORE_PUNCT.replace(t, "$1").trim()
    }

    fun removeEmoji(s: String): String {
        val sb = StringBuilder(s.length)
        var i = 0
        while (i < s.length) {
            val cp = s.codePointAt(i)
            i += Character.charCount(cp)
            if (isEmojiLike(cp)) continue
            sb.appendCodePoint(cp)
        }
        return sb.toString()
    }

    private fun isEmojiLike(cp: Int): Boolean {
        if (cp >= 0x1F000) return true // emoji, pictographs, flags, skin tones, tags
        if (cp in 0x2600..0x27BF || cp in 0x2B00..0x2BFF || cp in 0x2190..0x21FF) return true
        if (cp == 0x200D || cp in 0xFE00..0xFE0F || cp == 0x20E3) return true
        val type = Character.getType(cp)
        return type == Character.OTHER_SYMBOL.toInt() || type == Character.SURROGATE.toInt()
    }

    /** Contains at least one Arabic letter or a digit (Latin text is dropped by the G2P). */
    fun isSpeakable(s: String): Boolean = s.any { it in '\u0621'..'\u064A' || it.isDigit() }

    /** Splits text longer than [MAX_CHUNK] at the last comma, then the last space, before the limit. */
    fun chunk(s: String): List<String> {
        if (s.length <= MAX_CHUNK) return listOf(s)
        val out = ArrayList<String>()
        var rest = s
        while (rest.length > MAX_CHUNK) {
            val window = rest.substring(0, MAX_CHUNK)
            var cut = window.indexOfLast { it == '،' || it == ',' || it == '؛' || it == ':' }
            if (cut < MAX_CHUNK / 3) cut = window.lastIndexOf(' ')
            if (cut <= 0) cut = MAX_CHUNK - 1
            out.add(rest.substring(0, cut + 1).trim())
            rest = rest.substring(cut + 1).trim()
        }
        if (rest.isNotEmpty()) out.add(rest)
        return out.filter { isSpeakable(it) }
    }
}

/**
 * Emits each sentence of a streaming reply once it is finished, so speech can start while
 * the model is still writing. Feed it the visible answer so far (reasoning already hidden).
 */
class SentenceStreamer {
    private var consumed = 0

    fun feed(answerSoFar: String): List<String> {
        val s = SpeechText.stripCode(answerSoFar, final = false)
        if (consumed > s.length) consumed = s.length
        var end = -1
        for (i in consumed until s.length) {
            if (SpeechText.isBoundary(s, i, atEndIsBoundary = false)) end = i + 1
        }
        if (end <= consumed) return emptyList()
        val piece = s.substring(consumed, end)
        consumed = end
        return SpeechText.sentences(piece)
    }

    /** Call once with the final answer: returns whatever was not spoken yet. */
    fun finish(finalAnswer: String): List<String> {
        val s = SpeechText.stripCode(finalAnswer, final = true)
        val rest = if (consumed < s.length) s.substring(consumed) else ""
        consumed = s.length
        return SpeechText.sentences(rest)
    }
}
