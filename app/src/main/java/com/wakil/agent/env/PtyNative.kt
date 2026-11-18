package com.wakil.agent.env

/**
 * Thin JNI bridge over libwakil_pty.so (src/main/cpp/wakil_pty.c).
 * [available] is false when the library is missing (e.g. unit tests on the JVM);
 * every caller must check it before touching the session.
 */
internal object PtyNative {
    val available: Boolean = runCatching { System.loadLibrary("wakil_pty"); true }.getOrDefault(false)

    /** Spawns [argv] on a fresh pseudo-terminal; returns a session id or a negative error code. */
    external fun spawn(argv: Array<String>, envp: Array<String>, cwd: String, rows: Int, cols: Int): Int

    /** Blocking read; n>0 = bytes, 0 = EOF (tty closed), negative = -errno. */
    external fun read(id: Int, buf: ByteArray): Int

    external fun write(id: Int, data: ByteArray, len: Int): Int

    /** TIOCSWINSZ on the master; the kernel delivers SIGWINCH to the foreground group. */
    external fun resize(id: Int, rows: Int, cols: Int): Int

    external fun kill(id: Int)

    /** Reaps the child; exit code, 128+signal when killed, or -1. */
    external fun wait(id: Int): Int

    /** Frees the session slot. */
    external fun close(id: Int)
}
