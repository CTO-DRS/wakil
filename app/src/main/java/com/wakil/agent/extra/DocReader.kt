package com.wakil.agent.extra

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.io.InputStream
import java.util.zip.ZipInputStream

/** Pulls plain text out of documents so the model can read them: PDF, Word, PowerPoint, Excel, ODT, EPUB, HTML and text files. */
object DocReader {
    private var pdfReady = false

    fun nameOf(ctx: Context, uri: Uri): String = runCatching {
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"

    fun read(ctx: Context, uri: Uri, maxChars: Int = 60_000): String {
        val name = nameOf(ctx, uri)
        return ctx.contentResolver.openInputStream(uri)!!.use { read(ctx, name, it, maxChars) }
    }

    fun read(ctx: Context, f: File, maxChars: Int = 60_000): String = f.inputStream().use { read(ctx, f.name, it, maxChars) }

    fun read(ctx: Context, name: String, input: InputStream, maxChars: Int): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        val text = when (ext) {
            "pdf" -> pdf(ctx, input)
            "docx" -> zipXml(input) { it == "word/document.xml" }
            "pptx" -> zipXml(input) { it.startsWith("ppt/slides/slide") && it.endsWith(".xml") }
            "xlsx" -> zipXml(input) { it == "xl/sharedStrings.xml" || it.startsWith("xl/worksheets/sheet") }
            "odt", "odp", "ods" -> zipXml(input) { it == "content.xml" }
            "epub" -> zipXml(input) { it.endsWith(".xhtml") || it.endsWith(".html") }
            "html", "htm", "xml" -> stripXml(input.readBytes().toString(Charsets.UTF_8))
            else -> {
                val b = input.readBytes()
                if (b.take(4096).count { it == 0.toByte() } > 8) throw IllegalArgumentException("نوع الملف غير مدعوم (.$ext)")
                b.toString(Charsets.UTF_8)
            }
        }
        val clean = text.replace(Regex("[ \\t]+"), " ").replace(Regex("\\n{3,}"), "\n\n").trim()
        return if (clean.length > maxChars) clean.take(maxChars) + "\n…[اقتُطع، الملف أطول من ${maxChars} حرف]" else clean
    }

    private fun pdf(ctx: Context, input: InputStream): String {
        if (!pdfReady) { com.tom_roush.pdfbox.android.PDFBoxResourceLoader.init(ctx.applicationContext); pdfReady = true }
        com.tom_roush.pdfbox.pdmodel.PDDocument.load(input).use { doc ->
            val t = com.tom_roush.pdfbox.text.PDFTextStripper().apply { sortByPosition = true }.getText(doc)
            if (t.isBlank()) throw IllegalArgumentException("ملف PDF مصوَّر بدون نص قابل للقراءة")
            return t
        }
    }

    private fun zipXml(input: InputStream, want: (String) -> Boolean): String {
        val parts = sortedMapOf<String, String>(compareBy({ Regex("\\d+").find(it)?.value?.toIntOrNull() ?: 0 }, { it }))
        ZipInputStream(input).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                if (!e.isDirectory && want(e.name)) parts[e.name] = stripXml(z.readBytes().toString(Charsets.UTF_8))
            }
        }
        if (parts.isEmpty()) throw IllegalArgumentException("لم أجد نصاً في الملف")
        return parts.values.joinToString("\n\n")
    }

    fun stripXml(x: String): String = x
        .replace(Regex("(?is)<(script|style)[^>]*>.*?</\\1>"), " ")
        .replace(Regex("(?i)</(w:p|a:p|text:p|p|div|h\\d|li|tr|br)\\s*>|<br\\s*/?>|<w:br/>"), "\n")
        .replace(Regex("(?i)<w:tab/>|</(w:t|c|td)>"), " ")
        .replace(Regex("<[^>]+>"), "")
        .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ")
}
