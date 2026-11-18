// Copyright (c) 2026 DRS AI. All rights reserved.
package com.drsai.rafeeq.fastdl

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer

/** Thrown for HTTP answers that the JS side decides about (URL refresh, fatal). */
class HttpStatusException(val status: Int) : IOException("HTTP_$status")

/** The server answered a range request with the whole body (or the wrong range). */
class RangeIgnoredException : IOException("RANGE_IGNORED")

object Http {
  const val USER_AGENT = "RafeeqAI-FastDownload/1"
  private const val MAX_REDIRECTS = 10

  fun open(url: String, followRedirects: Boolean): HttpURLConnection {
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 15_000
    conn.readTimeout = 30_000
    conn.instanceFollowRedirects = followRedirects
    conn.useCaches = false
    conn.setRequestProperty("User-Agent", USER_AGENT)
    conn.setRequestProperty("Accept-Encoding", "identity")
    return conn
  }

  /** Parses "bytes a-b/total" into (a, total); total is -1 when "*". */
  fun parseContentRange(header: String?): Pair<Long, Long>? {
    if (header == null) return null
    val m = Regex("""bytes\s+(\d+)-(\d+)/(\d+|\*)""").find(header.trim()) ?: return null
    val start = m.groupValues[1].toLongOrNull() ?: return null
    val total = m.groupValues[3].toLongOrNull() ?: -1L
    return Pair(start, total)
  }

  /**
   * Follows redirects by hand (relative Locations included) with a 1-byte range
   * request, so the caller learns the final URL, the total size and range support.
   */
  fun probe(url: String): Map<String, Any?> {
    var current = url
    for (i in 0..MAX_REDIRECTS) {
      val conn = open(current, false)
      conn.setRequestProperty("Range", "bytes=0-0")
      try {
        val code = conn.responseCode
        if (code in 300..399) {
          val loc = conn.getHeaderField("Location") ?: throw HttpStatusException(code)
          current = URL(URL(current), loc).toString()
          continue
        }
        return when (code) {
          206 -> {
            val cr = parseContentRange(conn.getHeaderField("Content-Range"))
            val total = cr?.second ?: -1L
            mapOf("finalUrl" to current, "totalBytes" to total.toDouble(), "acceptRanges" to (total > 0))
          }
          200 -> mapOf(
            "finalUrl" to current,
            "totalBytes" to conn.contentLengthLong.toDouble(),
            "acceptRanges" to false
          )
          else -> throw HttpStatusException(code)
        }
      } finally {
        conn.disconnect()
      }
    }
    throw IOException("TOO_MANY_REDIRECTS")
  }
}

/**
 * Downloads one byte range [pos, end) of `url` straight into `file` at the same
 * offsets (positional FileChannel writes, no concat step). `end == -1` means "until
 * EOF" without a Range header. The end can be shrunk while running (work stealing).
 */
class SegmentWorker(
  val taskId: String,
  val segmentId: Int,
  private val url: String,
  private val file: File,
  @Volatile var pos: Long,
  end: Long,
  private val maxRetries: Int,
  private val onFinish: (worker: SegmentWorker, completed: Boolean, error: String?) -> Unit
) : Runnable {
  private val lock = Object()
  private val ranged = end >= 0
  private var endLimit = end
  @Volatile private var stopped = false
  @Volatile private var conn: HttpURLConnection? = null

  fun setEnd(newEnd: Long): Boolean = synchronized(lock) {
    if (!ranged || newEnd <= pos || newEnd >= endLimit) false else {
      endLimit = newEnd
      true
    }
  }

  fun stop() {
    stopped = true
    try {
      conn?.disconnect()
    } catch (_: Throwable) {
    }
  }

  private fun limit(): Long = synchronized(lock) { endLimit }

  override fun run() {
    var attempt = 0
    var raf: RandomAccessFile? = null
    try {
      raf = RandomAccessFile(file, "rw")
      while (true) {
        if (stopped) return onFinish(this, false, null)
        if (ranged && pos >= limit()) return onFinish(this, true, null)
        val before = pos
        try {
          transferOnce(raf)
          if (stopped) return onFinish(this, false, null)
          if (!ranged || pos >= limit()) return onFinish(this, true, null)
          throw IOException("SHORT_READ")
        } catch (e: HttpStatusException) {
          if (stopped) return onFinish(this, false, null)
          val retryable = e.status == 408 || e.status == 429 || e.status >= 500
          if (!retryable) return onFinish(this, false, "HTTP_${e.status}")
        } catch (e: RangeIgnoredException) {
          return onFinish(this, false, "RANGE_IGNORED")
        } catch (e: IOException) {
          if (stopped) return onFinish(this, false, null)
          if (!ranged && pos > 0) {
            // A plain stream cannot continue mid-file; restart it from the top.
            pos = 0
          }
        }
        attempt = if (pos > before) 1 else attempt + 1
        if (attempt > maxRetries) return onFinish(this, false, "NETWORK_ERROR")
        val delay = minOf(15_000L, 1000L shl minOf(attempt - 1, 4))
        var waited = 0L
        while (waited < delay && !stopped) {
          Thread.sleep(200)
          waited += 200
        }
      }
    } catch (e: Throwable) {
      onFinish(this, false, if (stopped) null else "IO_ERROR")
    } finally {
      try {
        raf?.close()
      } catch (_: Throwable) {
      }
    }
  }

  private fun transferOnce(raf: RandomAccessFile) {
    val c = Http.open(url, true)
    conn = c
    try {
      val lim = limit()
      if (ranged) c.setRequestProperty("Range", "bytes=$pos-${lim - 1}")
      val code = c.responseCode
      when (code) {
        206 -> {
          val cr = Http.parseContentRange(c.getHeaderField("Content-Range"))
          if (cr == null || cr.first != pos) throw RangeIgnoredException()
        }
        200 -> if (pos != 0L) throw RangeIgnoredException()
        416 -> if (ranged && pos >= lim) return else throw HttpStatusException(code)
        else -> throw HttpStatusException(code)
      }
      val input: InputStream = c.inputStream
      input.use { stream -> copy(stream, raf) }
    } finally {
      conn = null
      try {
        c.disconnect()
      } catch (_: Throwable) {
      }
    }
  }

  private fun copy(input: InputStream, raf: RandomAccessFile) {
    val channel = raf.channel
    val buf = ByteArray(256 * 1024)
    while (!stopped) {
      val n = input.read(buf)
      if (n < 0) return
      var reached = false
      synchronized(lock) {
        val allowed = if (ranged) minOf(n.toLong(), endLimit - pos).toInt() else n
        if (allowed > 0) {
          val bb = ByteBuffer.wrap(buf, 0, allowed)
          var at = pos
          while (bb.hasRemaining()) at += channel.write(bb, at)
          pos += allowed
        }
        if (ranged && pos >= endLimit) reached = true
      }
      if (reached) return
    }
  }
}
