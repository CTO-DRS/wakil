package com.wakil.agent.extra

import org.junit.Assert.*
import org.junit.Test
import java.io.File

class ExtraToolsTest {
    @Test fun ddgResultsParsed() {
        val html = """
<div class="result results_links results_links_deep web-result "><div class="links_main links_deep result__body">
<h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fkotlinlang.org%2Fdocs%2F&amp;rut=abc">Kotlin <b>Docs</b></a></h2>
<a class="result__snippet" href="x">Official &amp; complete <b>docs</b>.</a></div></div>
<div class="result results_links results_links_deep web-result "><div class="links_main links_deep result__body">
<h2 class="result__title"><a rel="nofollow" class="result__a" href="https://example.com/">Example</a></h2>
<a class="result__snippet" href="y">Second &#39;one&#39;</a></div></div>"""
        val r = WebTools.parseDdg(html)
        assertEquals(2, r.size)
        assertEquals("https://kotlinlang.org/docs/", r[0].url)
        assertEquals("Kotlin Docs", r[0].title)
        assertEquals("Official & complete docs.", r[0].snippet)
        assertEquals("Second 'one'", r[1].snippet)
    }

    @Test fun bingResultsParsed() {
        val r = WebTools.parseBing("""<ol><li class="b_algo" data-x="1"><h2><a href="https://a.com/x?y=1&amp;z=2" h="ID">A <strong>title</strong></a></h2><div class="b_caption"><p>Snip &amp; more</p></div></li></ol>""")
        assertEquals(1, r.size); assertEquals("https://a.com/x?y=1&z=2", r[0].url); assertEquals("A title", r[0].title); assertEquals("Snip & more", r[0].snippet)
    }

    @Test fun htmlToTextDropsScripts() {
        val t = WebTools.htmlToText("<html><head><title>Hi</title><script>var x=1</script></head><body><h1>مرحبا</h1><p>a&nbsp;b</p><ul><li>one</li></ul></body></html>")
        assertTrue(t.startsWith("# Hi"))
        assertTrue(t.contains("مرحبا")); assertTrue(t.contains("a b")); assertTrue(t.contains("• one"))
        assertFalse(t.contains("var x"))
    }

    @Test fun schedulerRepeat() {
        assertEquals("daily", Scheduler.normRepeat("يومي"))
        assertEquals("every:30", Scheduler.normRepeat("every:30"))
        assertEquals("none", Scheduler.normRepeat("every:5"))
        val t = ScheduledTask(1, "p", 1_000L, "hourly", "x")
        assertEquals(1_000L + 3 * 3_600_000L, Scheduler.nextAfter(t, 1_000L + 2 * 3_600_000L + 5))
        assertNull(Scheduler.nextAfter(t.copy(repeat = "none"), 5_000L))
        val now = System.currentTimeMillis()
        assertEquals(now + 600_000L, Scheduler.parseWhen(null, 10, now))
        val at = Scheduler.parseWhen("08:30", null, now)!!
        assertTrue(at > now && at - now <= 24 * 3_600_000L)
        assertNull(Scheduler.parseWhen("25:00", null, now))
    }

    @Test fun memoryPersists() {
        val f = File.createTempFile("mem", ".json"); f.delete()
        val m = AgentMemory(f)
        val a = m.add("يحب Kotlin"); m.add("يحب Kotlin"); m.add("المستودع wakil-demo")
        assertEquals(2, m.notes.value.size)
        val m2 = AgentMemory(f)
        assertEquals(2, m2.notes.value.size)
        assertTrue(m2.promptBlock().contains("#${a.id}: يحب Kotlin"))
        assertTrue(m2.remove(a.id)); assertEquals(1, AgentMemory(f).notes.value.size)
    }
}
