package com.wakil.agent.env

import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction

/**
 * Pure helpers for the interactive PTY terminal — no Android imports, unit-testable on the JVM:
 * - [Utf8StreamDecoder]: never splits a multi-byte UTF-8 char across read chunks (Arabic!)
 * - [clean]: strips ANSI escapes for the line-oriented log view
 * - [keySeq]: control/arrow key sequences for the extra-keys row
 */
object PtyText {
    private val OSC = Regex("\u001B\\].*?(?:\u0007|\u001B\\\\)", RegexOption.DOT_MATCHES_ALL)
    private val CSI = Regex("\u001B\\[[0-?]*[ -/]*[@-~]")
    private val ESC2 = Regex("\u001B[@-~]")
    private val CTRL = Regex("[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F]")

    /**
     * Removes ANSI escape sequences and stray control characters, keeping \n and \t.
     * \r\n becomes \n; a bare \r (progress-bar redraw) is dropped. The display is a
     * line-oriented log, not a full terminal emulator, so full-screen apps stay readable.
     */
    fun clean(raw: String): String = raw
        .replace(OSC, "")
        .replace(CSI, "")
        .replace(ESC2, "")
        .replace("\r\n", "\n")
        .replace("\r", "")
        .replace(CTRL, "")
        .replace("\u001B", "")

    /**
     * Incremental UTF-8 decoder; incomplete trailing bytes are carried to the next push().
     * CharsetDecoder does not retain them internally — the caller must (that's us).
     */
    class Utf8StreamDecoder {
        private val dec = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPLACE)
            .onUnmappableCharacter(CodingErrorAction.REPLACE)
        private var carry = ByteArray(0)

        /** Decodes one chunk; call [finish] after the stream ends. */
        fun push(bytes: ByteArray): String {
            if (bytes.isEmpty()) return ""
            val input = if (carry.isEmpty()) bytes else carry + bytes
            val inBuf = ByteBuffer.wrap(input)
            val cb = CharBuffer.allocate(input.size + 16)
            dec.decode(inBuf, cb, false)
            // whatever the decoder left unconsumed is an incomplete trailing sequence
            val rem = inBuf.remaining()
            carry = if (rem > 0) input.copyOfRange(input.size - rem, input.size) else ByteArray(0)
            cb.flip()
            return cb.toString()
        }

        /** Flushes any bytes carried from the last push(); broken trailing bytes become U+FFFD. */
        fun finish(): String {
            val rest = carry
            carry = ByteArray(0)
            val cb = CharBuffer.allocate(rest.size + 16)
            dec.decode(ByteBuffer.wrap(rest), cb, true)
            dec.flush(cb)
            cb.flip()
            return cb.toString()
        }
    }

    /** Terminal input sequences for keys a phone keyboard lacks. */
    fun keySeq(name: String): String = when (name) {
        "^C" -> "\u0003"
        "^D" -> "\u0004"
        "^Z" -> "\u001A"
        "Tab" -> "\t"
        "Esc" -> "\u001B"
        "↑" -> "\u001B[A"
        "↓" -> "\u001B[B"
        "←" -> "\u001B[D"
        "→" -> "\u001B[C"
        "Home" -> "\u001B[H"
        "End" -> "\u001B[F"
        else -> name
    }
}
