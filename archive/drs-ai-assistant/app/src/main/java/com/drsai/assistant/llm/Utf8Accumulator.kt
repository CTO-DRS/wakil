package com.drsai.assistant.llm

import java.io.ByteArrayOutputStream

/**
 * Tokens are byte pieces; one Arabic letter (2 bytes) or emoji (4 bytes) can be split
 * across tokens. This joins pieces and only releases complete UTF-8 characters.
 */
class Utf8Accumulator {
    private val pending = ByteArrayOutputStream()

    fun push(bytes: ByteArray): String {
        if (bytes.isEmpty()) return ""
        pending.write(bytes)
        val all = pending.toByteArray()
        val cut = completePrefixLength(all)
        pending.reset()
        if (cut < all.size) pending.write(all, cut, all.size - cut)
        return if (cut == 0) "" else String(all, 0, cut, Charsets.UTF_8)
    }

    /** Releases whatever is left (invalid tails become U+FFFD). */
    fun flush(): String {
        val rest = pending.toByteArray()
        pending.reset()
        return if (rest.isEmpty()) "" else String(rest, Charsets.UTF_8)
    }

    companion object {
        /** Length of the longest prefix that does not end inside a multi-byte sequence. */
        fun completePrefixLength(b: ByteArray): Int {
            val n = b.size
            // Look back at most 3 bytes for the start of the last sequence.
            var i = n - 1
            var back = 0
            while (i >= 0 && back < 4) {
                val v = b[i].toInt() and 0xFF
                if (v and 0xC0 != 0x80) {
                    val need = when {
                        v and 0x80 == 0 -> 1
                        v and 0xE0 == 0xC0 -> 2
                        v and 0xF0 == 0xE0 -> 3
                        v and 0xF8 == 0xF0 -> 4
                        else -> 1 // invalid lead byte: let the decoder replace it
                    }
                    return if (n - i >= need) n else i
                }
                i--
                back++
            }
            return n // only continuation bytes: nothing sensible to wait for
        }
    }
}
