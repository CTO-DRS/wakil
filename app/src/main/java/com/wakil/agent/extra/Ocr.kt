package com.wakil.agent.extra

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import com.googlecode.tesseract.android.TessBaseAPI
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * On-device OCR (Tesseract, Arabic + English). Language data (~5 MB, tessdata_fast) is downloaded
 * once on first use into the app's files. Used to read and tap text that the accessibility tree
 * does not expose (images, games, canvas-drawn apps) and to read text from photos.
 */
object Ocr {
    data class Line(val text: String, val box: Rect, val conf: Float)

    private val LANGS = listOf("ara", "eng")
    private const val BASE = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/"
    private const val MIRROR = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/"
    private var api: TessBaseAPI? = null
    private val lock = Any()

    fun root(ctx: Context) = File(ctx.filesDir, "ocr")
    private fun data(ctx: Context, l: String) = File(root(ctx), "tessdata/$l.traineddata")
    fun ready(ctx: Context) = LANGS.all { data(ctx, it).length() > 100_000 }

    /** Downloads missing language files. Returns null on success or an error message. */
    fun ensure(ctx: Context): String? {
        for (l in LANGS) {
            val f = data(ctx, l)
            if (f.length() > 100_000) continue
            f.parentFile?.mkdirs()
            val tmp = File(f.path + ".part")
            val ok = listOf(BASE, MIRROR).any { base -> runCatching { fetch(base + "$l.traineddata", tmp) }.getOrDefault(false) }
            if (!ok || tmp.length() < 100_000) { tmp.delete(); return "could not download OCR language data ($l). Check the internet connection." }
            tmp.renameTo(f)
        }
        return null
    }

    private fun fetch(url: String, to: File): Boolean {
        var u = URL(url)
        repeat(5) {
            val c = u.openConnection() as HttpURLConnection
            c.connectTimeout = 15000; c.readTimeout = 30000; c.instanceFollowRedirects = false
            val code = c.responseCode
            if (code in 300..399) { u = URL(u, c.getHeaderField("Location")); c.disconnect(); return@repeat }
            if (code != 200) { c.disconnect(); return false }
            c.inputStream.use { i -> to.outputStream().use { o -> i.copyTo(o) } }
            return true
        }
        return false
    }

    private fun engine(ctx: Context): TessBaseAPI = api ?: TessBaseAPI().also {
        check(it.init(root(ctx).path, LANGS.joinToString("+"), TessBaseAPI.OEM_LSTM_ONLY)) { "Tesseract init failed" }
        it.pageSegMode = 11 // PSM_SPARSE_TEXT: scattered UI labels, not a page of prose
        api = it
    }

    /** Text lines with their boxes in [bmp]'s pixel coordinates. */
    fun lines(ctx: Context, bmp: Bitmap, sparse: Boolean = true): List<Line> = synchronized(lock) {
        val t = engine(ctx)
        t.pageSegMode = if (sparse) 11 else 3
        t.setImage(bmp)
        t.getUTF8Text()
        val out = mutableListOf<Line>()
        val it = t.resultIterator ?: return@synchronized out
        it.begin()
        val level = TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE
        do {
            val s = it.getUTF8Text(level)?.trim().orEmpty()
            val c = it.confidence(level)
            if (s.isNotEmpty() && c > 35f && s.any { ch -> ch.isLetterOrDigit() }) out += Line(s, it.getBoundingRect(level), c)
        } while (it.next(level))
        it.delete(); t.clear()
        out
    }

    /** Plain text of [bmp] (photos, scanned pages). */
    fun text(ctx: Context, bmp: Bitmap): String = synchronized(lock) {
        val t = engine(ctx); t.pageSegMode = 3; t.setImage(bmp)
        t.getUTF8Text().orEmpty().trim().also { t.clear() }
    }

    fun format(lines: List<Line>, max: Int = 120): String =
        lines.take(max).mapIndexed { i, l -> "[$i] \"${l.text.take(80)}\" | ${l.box.centerX()},${l.box.centerY()}" }.joinToString("\n")
}
