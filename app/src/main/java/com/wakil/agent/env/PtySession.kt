package com.wakil.agent.env

import android.content.Context
import com.wakil.agent.service.AgentForegroundService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlin.concurrent.thread

/**
 * One interactive shell inside the Linux env, attached to a real pseudo-terminal (PTY):
 * programs inside see isatty()==true, so REPLs (python3), y/n prompts and full-screen
 * tools (vim, top, ssh) work — unlike the plain command mode which only streams stdout.
 *
 * The session is a persistent login shell (busybox ash under proot): typed lines run
 * directly and the working directory persists. `exit` ends it.
 */
object PtySession {
    val log = MutableStateFlow("")
    val running = MutableStateFlow(false)
    /** Exit code of the last session; null while running or before the first start. */
    val lastExit = MutableStateFlow<Int?>(null)

    private const val MAX = 200_000
    @Volatile private var id: Int = -1
    @Volatile private var rows = 30
    @Volatile private var cols = 100

    // applicationContext only, kept for the lifetime of the process — safe singleton pattern
    @Suppress("StaticFieldLeak")
    @Volatile private var appCtx: Context? = null

    val available: Boolean get() = PtyNative.available

    private fun append(s: String) {
        val v = log.value + s
        log.value = if (v.length > MAX) v.takeLast(MAX) else v
    }

    /**
     * Starts a login shell in [env] on a fresh PTY. Returns false when a session is
     * already running, the native helper is unavailable, or spawn failed (logged).
     */
    fun start(ctx: Context, env: LinuxEnv, rows: Int, cols: Int): Boolean {
        if (running.value) return false
        if (!PtyNative.available) { append("[الطرفية التفاعلية غير متاحة في هذا البناء]\n"); return false }
        if (!env.isReady) { append("[بيئة لينكس غير مهيأة]\n"); return false }
        this.rows = rows; this.cols = cols
        appCtx = ctx.applicationContext
        append("[بدء الطرفية التفاعلية… اكتب exit للخروج]\n")
        val sid = PtyNative.spawn(
            env.interactiveArgv().toTypedArray(),
            env.interactiveEnvp().toTypedArray(),
            "/root", rows, cols,
        )
        if (sid < 0) { append("[فشل فتح الطرفية التفاعلية: رمز $sid]\n"); return false }
        id = sid
        running.value = true
        AgentForegroundService.acquire(ctx, "الطرفية التفاعلية")
        thread(name = "wakil-pty") { pump() }
        return true
    }

    /** Reader pump: PTY master -> log, until the child exits or is killed. */
    private fun pump() {
        val dec = PtyText.Utf8StreamDecoder()
        val buf = ByteArray(8192)
        while (true) {
            val sid = id
            if (sid < 0) break
            val n = PtyNative.read(sid, buf)
            if (n <= 0) break
            append(dec.push(buf.copyOf(n)))
        }
        val sid = id
        val exit = if (sid >= 0) PtyNative.wait(sid) else null
        if (sid >= 0) PtyNative.close(sid)
        id = -1
        append("\n[انتهت الجلسة" + (exit?.let { "، رمز الخروج $it" } ?: "") + "]\n")
        lastExit.value = exit
        running.value = false
        appCtx?.let { AgentForegroundService.release(it) }
    }

    /** Writes raw bytes to the PTY (a typed line, a control key, an arrow escape…). */
    fun send(text: String) {
        val sid = id
        if (sid < 0) return
        val bytes = text.toByteArray(Charsets.UTF_8)
        if (bytes.isEmpty()) return
        runCatching { PtyNative.write(sid, bytes, bytes.size) }
    }

    /** Sends a named key from the extra-keys row (see [PtyText.keySeq]). */
    fun sendKey(name: String) = send(PtyText.keySeq(name))

    /** Updates the PTY size (full-screen apps redraw via SIGWINCH). */
    fun resize(r: Int, c: Int) {
        rows = r; cols = c
        val sid = id
        if (sid >= 0) runCatching { PtyNative.resize(sid, r, c) }
    }

    /** Kills the session; the pump ends it gracefully and reports the exit code. */
    fun kill() {
        val sid = id
        if (sid >= 0) runCatching { PtyNative.kill(sid) }
    }

    fun clear() { log.value = "" }
}
