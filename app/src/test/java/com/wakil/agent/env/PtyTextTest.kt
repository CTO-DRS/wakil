package com.wakil.agent.env

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class PtyTextTest {

    // --- UTF-8 stream decoder: no multi-byte char may be split across pushes (Arabic!) ---

    @Test fun utf8DecoderSurvivesEveryByteSplit() {
        val s = "مرحباً بالعالم — wakil ✓ Σ 𝔘"
        val bytes = s.toByteArray(Charsets.UTF_8)
        for (split in 1 until bytes.size) {
            val dec = PtyText.Utf8StreamDecoder()
            val out = dec.push(bytes.copyOfRange(0, split)) +
                dec.push(bytes.copyOfRange(split, bytes.size)) +
                dec.finish()
            assertEquals("split at $split", s, out)
        }
    }

    @Test fun utf8DecoderSurvivesThreeWayChunks() {
        val s = "وكيل 3.1.0: طرفية تفاعلية ✓✓✓"
        val bytes = s.toByteArray(Charsets.UTF_8)
        val rnd = Random(42)
        repeat(50) {
            val cuts = listOf(0, rnd.nextInt(1, bytes.size), rnd.nextInt(1, bytes.size), bytes.size).sorted()
            val dec = PtyText.Utf8StreamDecoder()
            var out = ""
            for (i in 0 until cuts.size - 1) {
                val part = bytes.copyOfRange(cuts[i], cuts[i + 1])
                out += if (i == cuts.size - 2) dec.push(part) + dec.finish() else dec.push(part)
            }
            assertEquals("cuts=$cuts", s, out)
        }
    }

    @Test fun utf8DecoderCarriesTruncatedCharAcrossPushes() {
        val dec = PtyText.Utf8StreamDecoder()
        // é = 0xC3 0xA9 split in half: the carry must complete it — correct stream behavior
        val out = dec.push(byteArrayOf('a'.code.toByte(), 0xC3.toByte())) +
            dec.push(byteArrayOf(0xA9.toByte(), 'b'.code.toByte())) + dec.finish()
        assertEquals("aéb", out)
    }

    @Test fun utf8DecoderReplacesTrulyBrokenTailAtFinish() {
        val dec = PtyText.Utf8StreamDecoder()
        val out = dec.push(byteArrayOf('a'.code.toByte(), 0xC3.toByte())) + dec.finish()
        assertEquals("a\uFFFD", out) // stream ended mid-char: replacement, never a stall or exception
    }

    @Test fun utf8DecoderEmptyPushReturnsEmpty() {
        val dec = PtyText.Utf8StreamDecoder()
        assertEquals("", dec.push(ByteArray(0)))
        assertEquals("", dec.finish())
    }

    // --- ANSI cleaning ---

    @Test fun cleanStripsCsiSequences() {
        assertEquals("ls\n", PtyText.clean("\u001B[01;32mls\u001B[0m\r\n"))
        assertEquals("total 12\n", PtyText.clean("\u001B[?25l\u001B[38;5;196mtotal 12\u001B[0m\n"))
        assertEquals("ok", PtyText.clean("\u001B[2Jok")) // clear screen
    }

    @Test fun cleanStripsOscSequences() {
        assertEquals("abc", PtyText.clean("\u001B]0;window title\u0007abc"))
        assertEquals("abc", PtyText.clean("\u001B]8;;https://x.y\u001B\\abc"))
    }

    @Test fun cleanStripsTwoCharEscapesAndControls() {
        assertEquals("A7", PtyText.clean("A\u001B7")) // ESC 7 (save cursor)
        assertEquals("ok", PtyText.clean("o\u0008k\u0007")) // backspace + BEL removed
        assertEquals("a\tb", PtyText.clean("a\tb")) // tab kept
        assertEquals("", PtyText.clean("\u0000\u001C"))
    }

    @Test fun cleanNormalizesCarriageReturns() {
        assertEquals("p1\np2\n", PtyText.clean("p1\r\np2\r\n"))
        // bare \r (progress-bar redraw) is dropped: redraws collapse into one line
        assertEquals("50%100%done", PtyText.clean("50%\r100%\rdone"))
    }

    @Test fun cleanKeepsPlainArabicText() {
        val s = "النتيجة: 42 ملف"
        assertEquals(s, PtyText.clean(s))
    }

    // --- key sequences ---

    @Test fun keySeqCtrlKeys() {
        assertEquals("\u0003", PtyText.keySeq("^C"))
        assertEquals("\u0004", PtyText.keySeq("^D"))
        assertEquals("\u001A", PtyText.keySeq("^Z"))
        assertEquals("\t", PtyText.keySeq("Tab"))
        assertEquals("\u001B", PtyText.keySeq("Esc"))
    }

    @Test fun keySeqArrows() {
        assertEquals("\u001B[A", PtyText.keySeq("↑"))
        assertEquals("\u001B[B", PtyText.keySeq("↓"))
        assertEquals("\u001B[D", PtyText.keySeq("←"))
        assertEquals("\u001B[C", PtyText.keySeq("→"))
        assertEquals("\u001B[H", PtyText.keySeq("Home"))
        assertEquals("\u001B[F", PtyText.keySeq("End"))
    }

    @Test fun keySeqFallsBackToLiteralText() {
        assertEquals("ls -la", PtyText.keySeq("ls -la"))
        assertFalse(PtyText.keySeq("ls").startsWith("\u001B"))
        assertTrue(PtyText.keySeq("^C").length == 1)
    }
}
