package com.wakil.agent.llm

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.random.Random

class DownloadAndModelsTest {
    init {
        // The build sandbox routes traffic through a proxy; local test server must be reached directly.
        java.net.ProxySelector.setDefault(object : java.net.ProxySelector() {
            override fun select(uri: java.net.URI?) = listOf(java.net.Proxy.NO_PROXY)
            override fun connectFailed(uri: java.net.URI?, sa: java.net.SocketAddress?, ioe: java.io.IOException?) {}
        })
        System.clearProperty("http.proxyHost"); System.clearProperty("https.proxyHost")
    }

    /** Tiny HTTP/1.0 server with Range support (com.sun.net.httpserver isn't on the Android test classpath). */
    class Srv(val data: ByteArray, val failEvery: Int) {
        val sock = java.net.ServerSocket(0, 50, java.net.InetAddress.getByName("127.0.0.1"))
        val port get() = sock.localPort
        private val hits = AtomicInteger()
        init {
            Thread {
                while (!sock.isClosed) {
                    val c = runCatching { sock.accept() }.getOrNull() ?: break
                    Thread { runCatching { handle(c) }; runCatching { c.close() } }.start()
                }
            }.apply { isDaemon = true }.start()
        }
        private fun handle(c: java.net.Socket) {
            val r = c.getInputStream().bufferedReader(Charsets.ISO_8859_1)
            val first = r.readLine() ?: return
            var range: String? = null
            while (true) { val l = r.readLine() ?: break; if (l.isEmpty()) break; if (l.startsWith("Range:", true)) range = l.substringAfter(':').trim() }
            val out = c.getOutputStream()
            if (first.contains("/redir")) { out.write("HTTP/1.0 302 Found\r\nLocation: /m.gguf\r\nContent-Length: 0\r\n\r\n".toByteArray()); out.flush(); return }
            val n = hits.incrementAndGet()
            val m = Regex("bytes=(\\d+)-(\\d*)").find(range ?: "")
            if (m == null) { out.write("HTTP/1.0 200 OK\r\nContent-Length: ${data.size}\r\n\r\n".toByteArray()); out.write(data); out.flush(); return }
            val a = m.groupValues[1].toInt(); val b = m.groupValues[2].ifEmpty { "${data.size - 1}" }.toInt().coerceAtMost(data.size - 1)
            val len = b - a + 1
            out.write("HTTP/1.0 206 Partial Content\r\nContent-Range: bytes $a-$b/${data.size}\r\nContent-Length: $len\r\n\r\n".toByteArray())
            if (failEvery > 0 && n % failEvery == 0 && len > 1000) { out.write(data, a, len / 2); out.flush(); return }
            out.write(data, a, len); out.flush()
        }
        fun stop() = sock.close()
    }

    @Test fun parallelDownloadMatches() = runBlocking {
        val data = Random(1).nextBytes(20 * 1024 * 1024 + 123)
        val s = Srv(data, 0)
        val f = File.createTempFile("wakm", ".gguf").also { it.delete() }
        try {
            var last = 0L
            val out = FastDownloader("http://127.0.0.1:${s.port}/redir", f, 6) { d, _, _, _ -> last = d }.run()
            assertArrayEquals(data, out.readBytes())
            assertEquals(data.size.toLong(), last)
            assertFalse(File(f.path + ".part").exists()); assertFalse(File(f.path + ".meta").exists())
        } finally { s.stop(); f.delete() }
    }

    @Test fun survivesDroppedConnections() = runBlocking {
        val data = Random(2).nextBytes(12 * 1024 * 1024)
        val s = Srv(data, 3)
        val f = File.createTempFile("wakm2", ".gguf").also { it.delete() }
        try {
            val out = FastDownloader("http://127.0.0.1:${s.port}/m.gguf", f, 4) { _, _, _, _ -> }.run()
            assertArrayEquals(data, out.readBytes())
        } finally { s.stop(); f.delete() }
    }

    @Test fun planCoversWholeFile() {
        val segs = FastDownloader.plan(100L * 1024 * 1024 + 7, 8)
        assertEquals(8, segs.size); assertEquals(0L, segs.first().start); assertEquals(100L * 1024 * 1024 + 6, segs.last().end)
        for (i in 1 until segs.size) assertEquals(segs[i - 1].end + 1, segs[i].start)
        assertEquals(1, FastDownloader.plan(1000, 8).size)
        assertEquals("https://hf-mirror.com/a/b", FastDownloader.mirror("https://huggingface.co/a/b", true))
    }

    @Test fun gemma4AndThinking() {
        val p = PromptFormats.gemma4(listOf(Msg("system", "S"), Msg("user", "hi"), Msg("assistant", "yo")))
        assertEquals("<|turn>system\nS<turn|>\n<|turn>user\nhi<turn|>\n<|turn>model\nyo<turn|>\n<|turn>model\n", p)
        assertTrue(PromptFormats.needsNoThink("qwen3.5-4b-q4_k_m.gguf", false))
        assertFalse(PromptFormats.needsNoThink("qwen3.5-4b-q4_k_m.gguf", true))
        assertFalse(PromptFormats.needsNoThink("deepseek-r1-0528-qwen3-8b-q4_k_m.gguf", false))
        assertFalse(PromptFormats.needsNoThink("qwen3-4b-instruct-2507-q4_k_m.gguf", false))
        assertTrue(PromptFormats.hitStop(StringBuilder("hello<turn|>")))
        assertEquals("ok", PromptFormats.clean("<|channel>thought\nhmm<channel|>ok<turn|>"))
    }

    @Test fun hfParsing() {
        val files = HfSearch.parseFiles("""[{"path":"a-Q8_0.gguf","size":9},{"path":"mmproj-F16.gguf","size":1},{"path":"a-Q4_K_M.gguf","size":5},{"path":"README.md","size":1},{"path":"x-00002-of-00003.gguf","size":3}]""")
        assertEquals(listOf("a-Q4_K_M.gguf", "a-Q8_0.gguf"), files.map { it.path })
        assertEquals("https://huggingface.co/u/r/resolve/main/sub/a%20b.gguf", HfSearch.fileUrl("u/r", "sub/a b.gguf"))
        assertEquals("u/r", HfSearch.parseRepos("""[{"id":"u/r","downloads":3,"likes":1}]""").single().id)
        assertTrue(ModelManager.PRESETS.all { it.url.startsWith("https://huggingface.co/") && it.url.endsWith(".gguf") })
    }
}
