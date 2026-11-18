package com.wakil.agent.extra

import com.wakil.agent.audio.WakeWord
import org.junit.Assert.*
import org.junit.Test

class V24Test {
    @Test fun wakeWord() {
        assertEquals("افتح يوتيوب", WakeWord.command("يا وكيل افتح يوتيوب"))
        assertEquals("", WakeWord.command("يا وكيل"))
        assertEquals("كم الساعة", WakeWord.command("وكيل، كم الساعة"))
        assertNull(WakeWord.command("افتح يوتيوب"))
    }

    @Test fun eventRepeats() {
        assertEquals("on:charging", Scheduler.normRepeat("on:charging"))
        assertEquals("on:wifi", Scheduler.normRepeat("wifi"))
        assertEquals("on:boot", Scheduler.normRepeat("عند التشغيل"))
        val t = ScheduledTask(1, "x", 123L, "on:charging", "x")
        assertEquals(123L, Scheduler.nextAfter(t, 999L))
    }

    @Test fun docXmlStrip() {
        val x = "<w:document><w:body><w:p><w:r><w:t>مرحبا</w:t></w:r></w:p><w:p><w:r><w:t>بالعالم &amp; الكل</w:t></w:r></w:p></w:body></w:document>"
        val t = DocReader.stripXml(x).trim()
        assertTrue(t.contains("مرحبا")); assertTrue(t.contains("بالعالم & الكل")); assertTrue(t.contains("\n"))
        assertFalse(DocReader.stripXml("<html><style>a{}</style><p>Hi</p></html>").contains("a{}"))
    }
}
