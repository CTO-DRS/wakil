package com.drsai.assistant.llm

import org.junit.Assert.assertEquals
import org.junit.Test

class Utf8AccumulatorTest {

    private fun bytes(s: String) = s.toByteArray(Charsets.UTF_8)

    @Test
    fun asciiPassesThroughImmediately() {
        val acc = Utf8Accumulator()
        assertEquals("hello", acc.push(bytes("hello")))
        assertEquals("", acc.flush())
    }

    @Test
    fun emptyPushReturnsEmpty() {
        assertEquals("", Utf8Accumulator().push(ByteArray(0)))
    }

    @Test
    fun arabicLetterSplitAcrossPiecesIsJoined() {
        val acc = Utf8Accumulator()
        val b = bytes("س") // 2 bytes
        assertEquals(2, b.size)
        assertEquals("", acc.push(byteArrayOf(b[0])))
        assertEquals("س", acc.push(byteArrayOf(b[1])))
        assertEquals("", acc.flush())
    }

    @Test
    fun emojiSplitIntoSingleBytesIsJoined() {
        val acc = Utf8Accumulator()
        val b = bytes("😀") // 4 bytes
        assertEquals(4, b.size)
        assertEquals("", acc.push(byteArrayOf(b[0])))
        assertEquals("", acc.push(byteArrayOf(b[1])))
        assertEquals("", acc.push(byteArrayOf(b[2])))
        assertEquals("😀", acc.push(byteArrayOf(b[3])))
    }

    @Test
    fun completePartOfPieceIsReleasedAndTailKept() {
        val acc = Utf8Accumulator()
        val b = bytes("مرحبا")
        val first = b.copyOfRange(0, 3) // "م" + first byte of "ر"
        val second = b.copyOfRange(3, b.size)
        assertEquals("م", acc.push(first))
        assertEquals("رحبا", acc.push(second))
    }

    @Test
    fun arbitraryChunkingReassemblesOriginalText() {
        val text = "أهلًا يا DRS 👋 كيف الحال؟"
        val b = bytes(text)
        for (chunk in 1..5) {
            val acc = Utf8Accumulator()
            val out = StringBuilder()
            var i = 0
            while (i < b.size) {
                val end = minOf(i + chunk, b.size)
                out.append(acc.push(b.copyOfRange(i, end)))
                i = end
            }
            out.append(acc.flush())
            assertEquals("chunk=$chunk", text, out.toString())
        }
    }

    @Test
    fun flushReleasesIncompleteTailAsReplacement() {
        val acc = Utf8Accumulator()
        val b = bytes("س")
        assertEquals("", acc.push(byteArrayOf(b[0])))
        assertEquals("\uFFFD", acc.flush())
        assertEquals("", acc.flush())
    }

    @Test
    fun completePrefixLengthCases() {
        assertEquals(0, Utf8Accumulator.completePrefixLength(ByteArray(0)))
        assertEquals(3, Utf8Accumulator.completePrefixLength(bytes("abc")))
        val ar = bytes("سل") // 4 bytes
        assertEquals(4, Utf8Accumulator.completePrefixLength(ar))
        assertEquals(2, Utf8Accumulator.completePrefixLength(ar.copyOfRange(0, 3)))
        val emoji = bytes("a😀")
        assertEquals(1, Utf8Accumulator.completePrefixLength(emoji.copyOfRange(0, 4)))
        assertEquals(5, Utf8Accumulator.completePrefixLength(emoji))
    }
}
