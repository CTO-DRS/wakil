package com.drsai.assistant.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeechTextTest {

    private fun streamAll(text: String, step: Int = 1): List<String> {
        val s = SentenceStreamer()
        val out = ArrayList<String>()
        var i = step
        while (i < text.length) {
            out += s.feed(text.substring(0, i).trim())
            i += step
        }
        out += s.finish(text.trim())
        return out
    }

    @Test
    fun streamsFinishedSentencesOnce() {
        val text = "مرحبا يا صديقي. كيف حالك اليوم؟ أنا بخير والحمد لله"
        val s = SentenceStreamer()
        assertEquals(emptyList<String>(), s.feed("مرحبا يا صديقي."))
        assertEquals(listOf("مرحبا يا صديقي."), s.feed("مرحبا يا صديقي. كيف"))
        assertEquals(emptyList<String>(), s.feed("مرحبا يا صديقي. كيف حالك"))
        assertEquals(listOf("كيف حالك اليوم؟", "أنا بخير والحمد لله"), s.finish(text))
        assertEquals(listOf("مرحبا يا صديقي.", "كيف حالك اليوم؟", "أنا بخير والحمد لله"), streamAll(text))
    }

    @Test
    fun skipsCodeBlocksWhileStreaming() {
        val text = "شوف هذا المثال:\n```kotlin\nval x = 1. println(x)\n```\nوهذا كل شيء."
        assertEquals(listOf("شوف هذا المثال:", "وهذا كل شيء."), streamAll(text))
        assertEquals(listOf("شوف هذا المثال:", "وهذا كل شيء."), streamAll(text, step = 7))
        assertEquals(listOf("شوف هذا المثال:", "وهذا كل شيء."), SpeechText.forSpeech(text))
    }

    @Test
    fun unclosedCodeBlockIsNotSpoken() {
        assertEquals(listOf("الكود:"), SpeechText.forSpeech("الكود:\n```\nفيه نص عربي داخل الكود"))
    }

    @Test
    fun stripsMarkdownEmojiLinksAndInlineCode() {
        val md = "## العنوان\n- **أول** نقطة 😀\n2. ثاني نقطة 👍🏽\n> اقتباس\nزور [الموقع](https://example.com) أو https://x.y/z واستخدم `print()` الحين"
        assertEquals(
            listOf("العنوان", "أول نقطة", "ثاني نقطة", "اقتباس", "زور الموقع أو واستخدم الحين"),
            SpeechText.forSpeech(md),
        )
    }

    @Test
    fun noSpaceLeftBeforePunctuation() {
        assertEquals(listOf("أنا درس، مساعدك الذكي."), SpeechText.forSpeech("أنا درس ، مساعدك الذكي 😀."))
    }

    @Test
    fun listNumbersAndDecimalsDoNotSplit() {
        assertEquals(listOf("السعر 2.5 ريال فقط."), SpeechText.forSpeech("السعر 2.5 ريال فقط."))
        assertEquals(listOf("أولا", "ثانيا"), SpeechText.forSpeech("1. أولا\n2. ثانيا"))
    }

    @Test
    fun englishOnlyAndEmojiOnlyAreSkipped() {
        assertTrue(SpeechText.forSpeech("Hello there. 🎉🎉").isEmpty())
        assertFalse(SpeechText.isSpeakable("OK"))
        assertTrue(SpeechText.isSpeakable("عندي 3"))
    }

    @Test
    fun longSentencesAreChunked() {
        val long = (1..60).joinToString(" ") { "كلمة" } + "، " + (1..30).joinToString(" ") { "ثانية" } + "."
        val chunks = SpeechText.forSpeech(long)
        assertTrue(chunks.size >= 2)
        assertTrue(chunks.all { it.length <= SpeechText.MAX_CHUNK })
        assertEquals(long.replace(" ", ""), chunks.joinToString("").replace(" ", ""))
    }
}
