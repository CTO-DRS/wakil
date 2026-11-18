package com.wakil.agent.llm

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicLong

/** One byte range of the file: [start, end] inclusive; [pos] is the next byte to fetch. */
class Segment(val start: Long, var end: Long, var pos: Long) {
    var claimed = false
    val done get() = pos > end
    val remaining get() = (end - pos + 1).coerceAtLeast(0)
}

data class Probe(val finalUrl: String, val total: Long, val ranges: Boolean)

/**
 * Multi-connection downloader: splits the file into ranges and fetches them in parallel (like IDM / aria2),
 * which is much faster on Hugging Face's CDN than one connection. Progress is saved to "<file>.meta"
 * every second, so a download interrupted by a network drop or app restart resumes where it stopped.
 * A slow connection's remaining range is split again for an idle worker (work stealing).
 */
class FastDownloader(
    private val url: String,
    private val target: File,
    private val connections: Int,
    private val onProgress: (done: Long, total: Long, speed: Double, active: Int) -> Unit,
) {
    private val part = File(target.path + ".part")
    private val meta = File(target.path + ".meta")

    suspend fun run(): File = withContext(Dispatchers.IO) {
        val probe = probe(url)
        if (!probe.ranges || probe.total <= 0) throw NoRangeException()
        val segs = loadMeta(probe.total) ?: plan(probe.total, connections).also { RandomAccessFile(part, "rw").use { f -> f.setLength(probe.total) } }
        val done = AtomicLong(probe.total - segs.sumOf { it.remaining })
        var finalUrl = probe.finalUrl
        val lock = Any()
        coroutineScope {
            // progress + meta saver
            val ticker = launch {
                var lastT = System.nanoTime(); var lastB = done.get(); var speed = 0.0
                while (true) {
                    delay(1000)
                    val now = System.nanoTime(); val b = done.get()
                    val inst = (b - lastB) / ((now - lastT) / 1e9)
                    speed = if (speed == 0.0) inst else speed * 0.6 + inst * 0.4
                    lastT = now; lastB = b
                    synchronized(lock) { saveMeta(probe.total, segs) }
                    onProgress(b, probe.total, speed, synchronized(lock) { segs.count { !it.done } }.coerceAtMost(connections))
                }
            }
            val workers = (0 until connections).map { w ->
                launch {
                    while (true) {
                        ensureActive()
                        val seg = synchronized(lock) { pick(segs) } ?: break
                        var tries = 0
                        while (!synchronized(lock) { seg.done }) {
                            try {
                                fetch(finalUrl, seg, done, lock)
                            } catch (e: CancellationException) { throw e } catch (e: ExpiredException) {
                                finalUrl = probe(url).finalUrl // signed CDN link expired: get a fresh one
                            } catch (e: IOException) {
                                if (++tries > 12) throw e
                                delay(minOf(30_000L, 1000L * tries * tries))
                            }
                        }
                    }
                }
            }
            workers.forEach { it.join() }
            ticker.cancel()
        }
        onProgress(probe.total, probe.total, 0.0, 0)
        target.delete()
        if (!part.renameTo(target)) throw IOException("rename failed")
        meta.delete()
        target
    }

    fun discard() { part.delete(); meta.delete() }

    /** Next unclaimed segment; if none, split the biggest running one in half (work stealing). */
    private fun pick(segs: MutableList<Segment>): Segment? {
        segs.firstOrNull { !it.done && !it.claimed }?.let { it.claimed = true; return it }
        val big = segs.filter { !it.done && it.claimed }.maxByOrNull { it.remaining } ?: return null
        if (big.remaining < MIN_SPLIT) return null
        val mid = big.pos + big.remaining / 2
        val tail = Segment(mid, big.end, mid).also { it.claimed = true }
        big.end = mid - 1   // its worker stops at the new end
        segs.add(tail)
        return tail
    }

    private fun fetch(u: String, seg: Segment, done: AtomicLong, lock: Any) {
        val (from, to) = synchronized(lock) { seg.pos to seg.end }
        val c = open(u).apply {
            connectTimeout = 20_000; readTimeout = 30_000
            setRequestProperty("User-Agent", UA)
            setRequestProperty("Range", "bytes=$from-$to")
        }
        try {
            val code = c.responseCode
            if (code == 403 || code == 410) throw ExpiredException()
            if (code != 206) throw IOException("HTTP $code")
            RandomAccessFile(part, "rw").use { f ->
                c.inputStream.use { inp ->
                    val buf = ByteArray(256 * 1024)
                    f.seek(from)
                    while (true) {
                        val want = synchronized(lock) { if (seg.done) 0 else minOf(buf.size.toLong(), seg.remaining).toInt() }
                        if (want == 0) break
                        val n = inp.read(buf, 0, want)
                        if (n < 0) throw IOException("connection closed early")
                        f.write(buf, 0, n)
                        synchronized(lock) { seg.pos += n }
                        done.addAndGet(n.toLong())
                    }
                }
            }
        } finally { c.disconnect() }
    }

    private fun saveMeta(total: Long, segs: List<Segment>) = runCatching {
        val a = JSONArray(); segs.forEach { a.put(JSONArray().put(it.start).put(it.end).put(it.pos)) }
        val tmp = File(meta.path + ".tmp"); tmp.writeText(JSONObject().put("url", url).put("total", total).put("segs", a).toString()); tmp.renameTo(meta)
    }

    private fun loadMeta(total: Long): MutableList<Segment>? = runCatching {
        if (!part.exists() || part.length() != total) return null
        val o = JSONObject(meta.readText())
        if (o.getLong("total") != total) return null
        val a = o.getJSONArray("segs")
        (0 until a.length()).map { val s = a.getJSONArray(it); Segment(s.getLong(0), s.getLong(1), s.getLong(2)) }.toMutableList()
    }.getOrNull()

    class NoRangeException : IOException("server does not support parallel download")
    private class ExpiredException : IOException("link expired")

    companion object {
        const val UA = "Wakil/2.3 (Android)"
        const val MIN_SPLIT = 4L * 1024 * 1024

        fun plan(total: Long, n: Int): MutableList<Segment> {
            val k = n.coerceIn(1, 16).toLong().coerceAtMost(maxOf(1L, total / MIN_SPLIT))
            val size = total / k
            return (0 until k).map { i ->
                val s = i * size; val e = if (i == k - 1) total - 1 else s + size - 1
                Segment(s, e, s)
            }.toMutableList()
        }

        /** Loopback (local servers, tests) always goes direct, never through a system proxy. */
        fun open(u: String): HttpURLConnection {
            val url = URL(u)
            val direct = url.host == "127.0.0.1" || url.host == "localhost"
            return (if (direct) url.openConnection(java.net.Proxy.NO_PROXY) else url.openConnection()) as HttpURLConnection
        }

        /** Follows redirects (HF → CDN) to the final URL and checks size and range support. */
        fun probe(url: String): Probe {
            var u = url
            repeat(8) {
                val c = open(u).apply {
                    instanceFollowRedirects = false; connectTimeout = 20_000; readTimeout = 20_000
                    setRequestProperty("User-Agent", UA); setRequestProperty("Range", "bytes=0-0")
                }
                val code = c.responseCode
                if (code in 300..399) {
                    val loc = c.getHeaderField("Location") ?: throw IOException("redirect without location")
                    c.disconnect(); u = URL(URL(u), loc).toString(); return@repeat
                }
                val range = c.getHeaderField("Content-Range")
                val total = range?.substringAfterLast('/')?.toLongOrNull() ?: c.contentLengthLong
                c.disconnect()
                if (code >= 400) throw IOException("HTTP $code")
                return Probe(u, total, code == 206 && range != null)
            }
            throw IOException("too many redirects")
        }

        /** Hugging Face links rewritten to the hf-mirror.com mirror (often faster in some regions). */
        fun mirror(url: String, useMirror: Boolean) =
            if (useMirror) url.replace("https://huggingface.co/", "https://hf-mirror.com/") else url
    }
}
