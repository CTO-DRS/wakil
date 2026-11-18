package com.wakil.agent.agent

import org.junit.Assert.assertEquals
import org.junit.Test

class StreamPreviewTest {
    @Test fun emptyAndBrace() {
        assertEquals(StreamView.Pending, StreamView.of(""))
        assertEquals(StreamView.Pending, StreamView.of("{"))
        assertEquals(StreamView.Pending, StreamView.of("{\"fi"))
    }

    @Test fun partialFinalArabic() {
        assertEquals(StreamView.Answer("تم تثبيت"), StreamView.of("{\"final\": \"تم تثبيت"))
        assertEquals(StreamView.Answer("سطر1\nسطر \"2\""), StreamView.of("{\"final\": \"سطر1\\nسطر \\\"2\\\"\"}"))
    }

    @Test fun danglingEscape() {
        assertEquals(StreamView.Answer("abc"), StreamView.of("{\"final\": \"abc\\"))
        assertEquals(StreamView.Answer("ab"), StreamView.of("{\"final\": \"ab\\u06"))
        assertEquals(StreamView.Answer("abم"), StreamView.of("{\"final\": \"ab\\u0645"))
    }

    @Test fun toolCall() {
        assertEquals(StreamView.Tool("", ""), StreamView.of("{\"tool\": \"run_sh"))
        val v = StreamView.of("{\"tool\": \"run_shell\", \"args\": {\"cmd\": \"apk add py")
        assertEquals(StreamView.Tool("run_shell", "{\"cmd\": \"apk add py"), v)
    }

    @Test fun thinkAndFences() {
        assertEquals(StreamView.Pending, StreamView.of("<think>hmm"))
        assertEquals(StreamView.Answer("hi"), StreamView.of("<think>x</think>\n{\"final\": \"hi"))
        assertEquals(StreamView.Answer("hi"), StreamView.of("```json\n{\"final\": \"hi\"}\n```"))
        assertEquals(StreamView.Answer("plain prose"), StreamView.of("plain prose"))
    }
}
