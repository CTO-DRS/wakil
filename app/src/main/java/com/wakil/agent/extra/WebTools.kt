package com.wakil.agent.extra

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder

/** Lets the agent search the web and read pages, with no API key (DuckDuckGo HTML endpoint). */
object WebTools {
    private const val UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36"

    private fun get(url: String, maxBytes: Int = 1_500_000): Pair<String, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 20000; c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", UA)
        c.setRequestProperty("Accept-Language", "ar,en;q=0.8")
        val code = c.responseCode
        val stream = if (code >= 400) c.errorStream else c.inputStream
        val bytes = stream?.use { s -> s.readNBytesCompat(maxBytes) } ?: ByteArray(0)
        val ct = c.contentType ?: ""
        val cs = Regex("charset=([\\w-]+)", RegexOption.IGNORE_CASE).find(ct)?.groupValues?.get(1) ?: "UTF-8"
        if (code >= 400) throw RuntimeException("HTTP $code")
        return ct to String(bytes, runCatching { charset(cs) }.getOrDefault(Charsets.UTF_8))
    }

    private fun java.io.InputStream.readNBytesCompat(max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream(); val buf = ByteArray(16384)
        while (out.size() < max) { val n = read(buf); if (n < 0) break; out.write(buf, 0, n) }
        return out.toByteArray()
    }

    suspend fun search(query: String, limit: Int = 8): String = withContext(Dispatchers.IO) {
        val q = URLEncoder.encode(query, "UTF-8")
        var res = runCatching { parseDdg(get("https://html.duckduckgo.com/html/?q=$q").second) }.getOrDefault(emptyList())
        // DuckDuckGo sometimes answers automated requests with a challenge page: fall back to Bing.
        if (res.isEmpty()) res = runCatching { parseBing(get("https://www.bing.com/search?q=$q&setlang=ar").second) }.getOrDefault(emptyList())
        res = res.take(limit)
        if (res.isEmpty()) "No results for: $query"
        else res.mapIndexed { i, r -> "${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}" }.joinToString("\n")
    }

    suspend fun fetch(url: String, limit: Int): String = withContext(Dispatchers.IO) {
        val u = if (url.startsWith("http")) url else "https://$url"
        val (ct, body) = get(u)
        val text = if (ct.contains("html", true) || body.trimStart().startsWith("<")) htmlToText(body) else body
        val t = text.trim()
        if (t.length > limit) t.take(limit) + "\n…[truncated, ${t.length} chars]" else t
    }

    /**
     * Full HTTP request for the `http_request` tool: any method, custom headers, request body.
     * Unlike `fetch`, it never throws on HTTP error statuses - the agent gets the status,
     * response headers and error body so it can debug an API call.
     */
    suspend fun request(
        url: String, method: String, headers: Map<String, String>, body: String?, timeoutSec: Int, limit: Int,
    ): String = withContext(Dispatchers.IO) {
        val m = method.uppercase().ifBlank { "GET" }
        val u = if (url.startsWith("http")) url else "https://$url"
        val c = URL(u).openConnection() as HttpURLConnection
        c.connectTimeout = timeoutSec * 1000; c.readTimeout = timeoutSec * 1000
        c.instanceFollowRedirects = true
        setMethod(c, m)
        if (!headers.keys.any { it.equals("User-Agent", true) }) c.setRequestProperty("User-Agent", UA)
        if (!headers.keys.any { it.equals("Accept-Language", true) }) c.setRequestProperty("Accept-Language", "ar,en;q=0.8")
        for ((k, v) in headers) c.setRequestProperty(k, v)
        if (body != null && m != "GET" && m != "HEAD") {
            c.doOutput = true
            val out = body.toByteArray(Charsets.UTF_8)
            c.setFixedLengthStreamingMode(out.size)
            runCatching { c.outputStream.use { it.write(out) } }.getOrElse { throw RuntimeException("failed to send body: ${it.message}") }
        }
        val code = c.responseCode
        val hdrs = LinkedHashMap<String, String>()
        for (k in listOf("Content-Type", "Content-Length", "Location", "ETag", "Last-Modified", "Server", "Date", "Retry-After", "Cache-Control", "X-RateLimit-Remaining"))
            c.getHeaderField(k)?.let { hdrs[k] = it }
        val ct = (c.contentType ?: "").substringBefore(';').trim()
        val msg = c.responseMessage ?: ""
        if (m == "HEAD" || code == 204 || code == 304)
            return@withContext formatResponse(code, msg, hdrs, ct, "", limit)
        if (ct.startsWith("image/") || ct.startsWith("audio/") || ct.startsWith("video/") || ct == "application/octet-stream" || ct.startsWith("application/pdf"))
            return@withContext formatResponse(code, msg, hdrs, ct, "(binary response: $ct, ${c.contentLength} bytes)", limit)
        val stream = if (code >= 400) c.errorStream else c.inputStream
        val bytes = stream?.use { s -> s.readNBytesCompat(2_000_000) } ?: ByteArray(0)
        val cs = Regex("charset=([\\w-]+)", RegexOption.IGNORE_CASE).find(c.contentType ?: "")?.groupValues?.get(1) ?: "UTF-8"
        val text = String(bytes, runCatching { charset(cs) }.getOrDefault(Charsets.UTF_8))
        formatResponse(code, msg, hdrs, ct, text, limit)
    }

    private fun setMethod(c: HttpURLConnection, m: String) {
        if (m == "PATCH") {
            // HttpURLConnection.requestMethod rejects PATCH; set the private field directly (works on Android and JVM).
            runCatching { c.requestMethod = m }.getOrElse {
                val f = HttpURLConnection::class.java.getDeclaredField("method")
                f.isAccessible = true; f.set(c, m)
            }
        } else c.requestMethod = m
    }

    /** Pure formatting of an HTTP response - unit-tested without any network. */
    fun formatResponse(code: Int, message: String, headers: Map<String, String>, contentType: String, body: String, limit: Int): String {
        val sb = StringBuilder("HTTP $code")
        if (message.isNotBlank()) sb.append(' ').append(message)
        sb.append('\n')
        if (headers.isNotEmpty()) sb.append(headers.entries.joinToString("\n") { "${it.key}: ${it.value}" }).append('\n')
        val pretty = when {
            contentType.contains("json") -> runCatching {
                val trimmed = body.trim()
                if (trimmed.startsWith("[")) JSONArray(trimmed).toString(2)
                else JSONObject(trimmed).toString(2)
            }.getOrDefault(body)
            contentType.contains("html") || body.trimStart().startsWith("<") -> htmlToText(body)
            else -> body
        }
        val t = pretty.trim()
        sb.append(when {
            t.isEmpty() -> "(empty body)"
            t.length > limit -> t.take(limit) + "\n…[truncated, ${t.length} chars]"
            else -> t
        })
        return sb.toString()
    }

    data class Result(val title: String, val url: String, val snippet: String)

    fun parseDdg(html: String): List<Result> {
        val out = mutableListOf<Result>()
        val blocks = html.split("class=\"result__body\"", "class=\"result results_links").drop(1)
        for (b in blocks) {
            val a = Regex("""class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>""", RegexOption.DOT_MATCHES_ALL).find(b) ?: continue
            var href = a.groupValues[1].replace("&amp;", "&")
            Regex("""uddg=([^&]+)""").find(href)?.let { href = URLDecoder.decode(it.groupValues[1], "UTF-8") }
            if (href.startsWith("//")) href = "https:$href"
            if (href.contains("duckduckgo.com/y.js")) continue
            val snip = Regex("""class="result__snippet"[^>]*>(.*?)</(a|td|div)>""", RegexOption.DOT_MATCHES_ALL).find(b)?.groupValues?.get(1) ?: ""
            out += Result(clean(a.groupValues[2]), href, clean(snip))
        }
        return out.distinctBy { it.url }
    }

    fun parseBing(html: String): List<Result> {
        val out = mutableListOf<Result>()
        for (b in html.split("<li class=\"b_algo").drop(1)) {
            val a = Regex("""<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>""", RegexOption.DOT_MATCHES_ALL).find(b) ?: continue
            val snip = Regex("""<p[^>]*>(.*?)</p>""", RegexOption.DOT_MATCHES_ALL).find(b)?.groupValues?.get(1) ?: ""
            out += Result(clean(a.groupValues[2]), a.groupValues[1].replace("&amp;", "&"), clean(snip))
        }
        return out.filter { it.url.startsWith("http") }.distinctBy { it.url }
    }

    private fun clean(s: String) = decodeEntities(s.replace(Regex("<[^>]+>"), "")).replace(Regex("\\s+"), " ").trim()

    fun htmlToText(html: String): String {
        var s = html
        val title = Regex("(?is)<title[^>]*>(.*?)</title>").find(s)?.groupValues?.get(1)?.let { clean(it) }
        s = s.replace(Regex("(?is)<(script|style|noscript|svg|head|nav|footer|form|iframe)[^>]*>.*?</\\1>"), " ")
        s = s.replace(Regex("(?is)<!--.*?-->"), " ")
        s = s.replace(Regex("(?i)<\\s*(br|/p|/div|/li|/h[1-6]|/tr|/section|/article)[^>]*>"), "\n")
        s = s.replace(Regex("(?i)<\\s*li[^>]*>"), "\n• ")
        s = s.replace(Regex("(?i)<\\s*h[1-6][^>]*>"), "\n## ")
        s = s.replace(Regex("<[^>]+>"), " ")
        s = decodeEntities(s)
        val lines = s.lines().map { it.replace(Regex("[ \\t\\u00a0]+"), " ").trim() }.filter { it.isNotEmpty() }
        val body = lines.joinToString("\n").replace(Regex("\n{3,}"), "\n\n")
        return if (title != null) "# $title\n$body" else body
    }

    fun decodeEntities(s: String): String = s
        .replace("&nbsp;", " ").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'")
        .replace("&lt;", "<").replace("&gt;", ">")
        .replace(Regex("&#(\\d+);")) { m -> m.groupValues[1].toIntOrNull()?.let { String(Character.toChars(it)) } ?: m.value }
        .replace(Regex("&#x([0-9a-fA-F]+);")) { m -> m.groupValues[1].toIntOrNull(16)?.let { String(Character.toChars(it)) } ?: m.value }
        .replace("&amp;", "&")
}
