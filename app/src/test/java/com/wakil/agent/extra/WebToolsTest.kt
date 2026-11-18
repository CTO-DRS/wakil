package com.wakil.agent.extra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WebToolsTest {

    // Minimal fixture shaped like the DuckDuckGo HTML endpoint response.
    private val ddgHtml = """
        <html><body>
        <div class="result results_links results_links_deep web-result">
          <div class="result__body">
            <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fllama&amp;rut=abc">llama.cpp guide</a>
            <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fllama&amp;rut=abc">How to build <b>llama.cpp</b> on Android.</a>
          </div>
        </div>
        <div class="result results_links results_links_deep web-result">
          <div class="result__body">
            <a rel="nofollow" class="result__a" href="//duckduckgo.com/y.js?ad_domain=www.google.com">Sponsored</a>
            <a class="result__snippet">Buy widgets</a>
          </div>
        </div>
        </body></html>
    """.trimIndent()

    private val bingHtml = """
        <html><body>
        <li class="b_algo">
          <h2><a href="https://example.com/1">First result</a></h2>
          <p>Snippet <strong>one</strong> text.</p>
        </li>
        <li class="b_algo">
          <h2><a href="https://example.com/2">Second result</a></h2>
          <p>Snippet two text.</p>
        </li>
        </body></html>
    """.trimIndent()

    @Test
    fun `parses DuckDuckGo results and decodes uddg links`() {
        val rs = WebTools.parseDdg(ddgHtml)
        assertEquals(1, rs.size)
        assertEquals("llama.cpp guide", rs[0].title)
        assertEquals("https://example.org/llama", rs[0].url)
        assertTrue(rs[0].snippet.contains("llama.cpp"))
        assertTrue(rs[0].snippet.contains("How to build"))
    }

    @Test
    fun `parses Bing results as fallback`() {
        val rs = WebTools.parseBing(bingHtml)
        assertEquals(2, rs.size)
        assertEquals("First result", rs[0].title)
        assertEquals("https://example.com/1", rs[0].url)
        assertTrue(rs[0].snippet.contains("Snippet one text"))
        assertTrue(rs[1].url == "https://example.com/2")
    }

    @Test
    fun `htmlToText strips scripts and keeps structure`() {
        val html = """
            <html><head><title>Page title here</title><script>var x = 1;</script>
            <style>.a { color: red }</style></head>
            <body><h1>Header one</h1><p>First paragraph</p><ul><li>Item alpha</li><li>Item beta</li></ul>
            <p>Ending<br/>with a break</p></body></html>
        """.trimIndent()
        val t = WebTools.htmlToText(html)
        assertTrue(t.startsWith("# Page title here"))
        assertTrue(t.contains("Header one"))
        assertTrue(t.contains("• Item alpha"))
        assertTrue(t.contains("with a break"))
        assertTrue(!t.contains("var x") && !t.contains("color: red"))
        assertTrue(!t.contains("<") && !t.contains(">"))
    }

    @Test
    fun `decodeEntities handles named numeric and hex`() {
        assertEquals("a <b & \"q\" 'd'", WebTools.decodeEntities("a &lt;b &amp; &quot;q&quot; &#39;d&#x27;"))
        assertEquals("مرحبا", WebTools.decodeEntities("&#1605;&#1585;&#1581;&#1576;&#1575;"))
        assertEquals("\u0645", WebTools.decodeEntities("&#x645;"))
    }

    @Test
    fun `formatResponse pretty prints json and keeps headers`() {
        val out = WebTools.formatResponse(
            200, "OK",
            linkedMapOf("Content-Type" to "application/json", "X-RateLimit-Remaining" to "58"),
            "application/json", """{"b":2,"a":1}""", 10_000,
        )
        assertTrue(out.startsWith("HTTP 200 OK"))
        assertTrue(out.contains("X-RateLimit-Remaining: 58"))
        assertTrue(out.contains("\"b\": 2"))
        assertTrue(out.contains("\"a\": 1"))
    }

    @Test
    fun `formatResponse converts html and truncates`() {
        val long = (1..500).joinToString("") { "<p>word$it </p>" }
        val out = WebTools.formatResponse(200, "OK", emptyMap(), "text/html", "<html><body>$long</body></html>", 300)
        assertTrue(out.contains("…[truncated"))
        assertTrue(out.contains("word1"))
        assertTrue(!out.contains("<p>"))
    }

    @Test
    fun `formatResponse handles error statuses and empty bodies`() {
        val out = WebTools.formatResponse(404, "Not Found", linkedMapOf("Content-Type" to "text/plain"), "text/plain", "", 1000)
        assertTrue(out.startsWith("HTTP 404 Not Found"))
        assertTrue(out.contains("(empty body)"))
    }
}
