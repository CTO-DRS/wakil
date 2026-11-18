package com.wakil.agent.env

import android.content.Context
import android.system.Os
import com.wakil.agent.Prefs
import com.wakil.agent.service.AgentForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPInputStream

sealed class EnvState {
    data object NotInstalled : EnvState()
    data class Installing(val step: String, val progress: Float) : EnvState()
    data object Ready : EnvState()
    data class Error(val message: String) : EnvState()
}

data class ShellResult(val exitCode: Int, val output: String, val timedOut: Boolean)

/**
 * Alpine Linux userland running under proot (shipped as libproot.so in nativeLibraryDir,
 * which is exec-able on Android 10+). Runs with -0 (fake root) so apk works.
 */
class LinuxEnv(private val ctx: Context, private val prefs: Prefs, private val scope: CoroutineScope) {
    private val base = File(ctx.filesDir, "linux")
    val rootfs = File(base, "alpine")
    private val tmp = File(base, "tmp")
    private val marker = File(rootfs, ".wakil_installed")
    private val nativeDir = File(ctx.applicationInfo.nativeLibraryDir)
    private val proot = File(nativeDir, "libproot.so")
    private val loader = File(nativeDir, "libproot-loader.so")

    private val _state = MutableStateFlow<EnvState>(if (marker.exists()) EnvState.Ready else EnvState.NotInstalled)
    val state: StateFlow<EnvState> = _state

    val isReady get() = marker.exists()

    init { if (isReady) runCatching { installHelpers() } }

    /** Copies Wakil's helper commands (wakil-apk…) into the env; refreshed on every app start. */
    fun installHelpers() {
        val bin = File(rootfs, "usr/local/bin").apply { mkdirs() }
        for (name in listOf("wakil-apk")) {
            val f = File(bin, name)
            ctx.assets.open("env/$name").use { input -> f.outputStream().use { input.copyTo(it) } }
            chmod(f, 0b111_101_101)
        }
    }

    /** Host file for a path inside the env (relative paths are under /root). */
    fun hostFile(path: String): File = resolve(path)

    fun install() {
        if (_state.value is EnvState.Installing) return
        scope.launch(Dispatchers.IO) {
            AgentForegroundService.acquire(ctx, "تهيئة بيئة لينكس…")
            try {
                if (!proot.exists()) throw Exception("libproot.so غير موجود في ${nativeDir.path}")
                base.mkdirs(); tmp.mkdirs()
                val archive = File(ctx.cacheDir, "rootfs.tar.gz")
                download(prefs.rootfsUrl, archive)
                _state.value = EnvState.Installing("فك ضغط النظام…", -1f)
                if (rootfs.exists()) rootfs.deleteRecursively()
                rootfs.mkdirs()
                archive.inputStream().buffered().use { extractTarGz(it, rootfs) }
                archive.delete()
                postInstall()
                marker.writeText(System.currentTimeMillis().toString())
                _state.value = EnvState.Ready
            } catch (e: Exception) {
                _state.value = EnvState.Error(e.message ?: e.toString())
            } finally {
                AgentForegroundService.release(ctx)
            }
        }
    }

    fun reset() {
        scope.launch(Dispatchers.IO) {
            rootfs.deleteRecursively()
            _state.value = EnvState.NotInstalled
        }
    }

    private fun download(url: String, out: File) {
        var u = URL(url)
        var conn: HttpURLConnection
        var hops = 0
        while (true) {
            conn = u.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 30_000; conn.readTimeout = 60_000
            val c = conn.responseCode
            if (c in 300..399 && hops++ < 10) { u = URL(u, conn.getHeaderField("Location")); conn.disconnect(); continue }
            if (c !in 200..299) throw Exception("تنزيل rootfs فشل: HTTP $c")
            break
        }
        val total = conn.contentLengthLong
        conn.inputStream.use { input ->
            out.outputStream().use { o ->
                val buf = ByteArray(1 shl 16); var done = 0L
                while (true) {
                    val n = input.read(buf); if (n < 0) break
                    o.write(buf, 0, n); done += n
                    _state.value = EnvState.Installing("تنزيل Alpine Linux…", if (total > 0) done.toFloat() / total else -1f)
                }
            }
        }
    }

    private fun extractTarGz(input: InputStream, dest: File) {
        TarArchiveInputStream(GZIPInputStream(input)).use { tar ->
            val hardLinks = mutableListOf<Pair<File, File>>()
            var e: TarArchiveEntry? = tar.nextEntry
            while (e != null) {
                val name = e.name.removePrefix("./")
                if (name.isNotEmpty()) {
                    val f = File(dest, name)
                    if (name.split('/').contains("..")) throw Exception("مسار غير آمن: $name")
                    when {
                        e.isDirectory -> { f.mkdirs(); chmod(f, e.mode or 0b111_000_000) }
                        e.isSymbolicLink -> {
                            f.parentFile?.mkdirs()
                            runCatching { Os.remove(f.path) }
                            runCatching { Os.symlink(e.linkName, f.path) }
                        }
                        e.isLink -> hardLinks += f to File(dest, e.linkName.removePrefix("./"))
                        e.isFile -> {
                            f.parentFile?.mkdirs()
                            if (f.exists()) f.delete()
                            f.outputStream().use { tar.copyTo(it) }
                            chmod(f, e.mode or 0b110_000_000)
                        }
                        else -> {} // device nodes, fifos: skipped (proot binds /dev)
                    }
                }
                e = tar.nextEntry
            }
            for ((link, target) in hardLinks) {
                runCatching { link.parentFile?.mkdirs(); target.copyTo(link, overwrite = true); chmod(link, 0b111_101_101) }
            }
        }
    }

    private fun chmod(f: File, mode: Int) { runCatching { Os.chmod(f.path, mode and 0xFFF) } }

    private fun postInstall() {
        File(rootfs, "etc/resolv.conf").apply { delete(); writeText("nameserver 8.8.8.8\nnameserver 1.1.1.1\n") }
        File(rootfs, "etc/hosts").writeText("127.0.0.1 localhost\n::1 localhost\n")
        File(rootfs, "root").mkdirs()
        File(rootfs, "tmp").apply { mkdirs(); chmod(this, 0b111_111_111) }
        File(rootfs, "etc/profile.d").mkdirs()
        runCatching { installHelpers() }
        File(rootfs, "etc/profile.d/wakil.sh").writeText(
            "export PS1='wakil:\\w# '\nexport LANG=C.UTF-8\n"
        )
    }

    /** Full argv for running [cmd] inside the env; null [cmd] = interactive login shell. */
    private fun buildArgv(cmd: String?, cwd: String): List<String> {
        val argv = mutableListOf(
            proot.path,
            "--kill-on-exit",
            "--link2symlink",
            "-0",
            "-r", rootfs.path,
            "-b", "/dev", "-b", "/proc", "-b", "/sys",
            "-b", "${File(rootfs, "tmp").path}:/dev/shm",
            "-w", cwd,
        )
        val sd = File("/storage/emulated/0")
        if (sd.canRead()) { argv += listOf("-b", "${sd.path}:/sdcard") }
        argv += listOf(
            "/usr/bin/env", "-i",
            "HOME=/root", "USER=root", "TERM=xterm-256color", "LANG=C.UTF-8",
            "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "TMPDIR=/tmp",
            "PYTHONUNBUFFERED=1",
        )
        argv += if (cmd == null) listOf("/bin/sh", "-l") else listOf("/bin/sh", "-l", "-c", cmd)
        return argv
    }

    /** Host-side environment for spawning proot directly (JNI PTY): loader paths and the seccomp toggle. */
    fun interactiveEnvp(): List<String> = buildList {
        add("PROOT_TMP_DIR=${tmp.path}")
        add("PROOT_LOADER=${loader.path}")
        add("LD_LIBRARY_PATH=${nativeDir.path}")
        if (prefs.prootNoSeccomp) add("PROOT_NO_SECCOMP=1")
    }

    /** Argv for a persistent interactive login shell in the env (for the PTY terminal). */
    fun interactiveArgv(cwd: String = "/root"): List<String> {
        tmp.mkdirs()
        return buildArgv(null, cwd)
    }

    private fun processBuilder(cmd: String, cwd: String): ProcessBuilder {
        tmp.mkdirs()
        val pb = ProcessBuilder(buildArgv(cmd, cwd)).redirectErrorStream(true)
        val env = pb.environment()
        env["PROOT_TMP_DIR"] = tmp.path
        env["PROOT_LOADER"] = loader.path
        env["LD_LIBRARY_PATH"] = nativeDir.path
        if (prefs.prootNoSeccomp) env["PROOT_NO_SECCOMP"] = "1"
        return pb
    }

    /**
     * Runs [cmd] in the env. [onOutput] receives streamed chunks (for the terminal).
     * Output returned is truncated to [limit] chars (head + tail kept).
     */
    suspend fun run(
        cmd: String,
        timeoutSec: Int = prefs.shellTimeoutSec,
        limit: Int = prefs.outputLimit,
        cwd: String = "/root",
        onOutput: ((String) -> Unit)? = null,
        onStart: ((Process) -> Unit)? = null,
    ): ShellResult = withContext(Dispatchers.IO) {
        if (!isReady) return@withContext ShellResult(-1, "بيئة لينكس غير مهيأة. افتح الطرفية واضغط \"تهيئة البيئة\".", false)
        val p = processBuilder(cmd, cwd).start()
        onStart?.invoke(p)
        runProcess(p, timeoutSec, limit, onOutput)
    }

    fun writeFile(path: String, content: String): String {
        val f = resolve(path)
        f.parentFile?.mkdirs()
        f.writeText(content)
        return "wrote ${content.toByteArray().size} bytes to $path"
    }

    fun readFile(path: String, limit: Int): String {
        val f = resolve(path)
        if (!f.exists()) return "ERROR: not found: $path"
        if (f.isDirectory) return f.list()?.sorted()?.joinToString("\n") ?: ""
        return truncate(f.readText(), limit)
    }

    /** Maps a guest path to the host file inside rootfs (relative paths are under /root). */
    private fun resolve(path: String): File {
        val p = if (path.startsWith("/")) path else "/root/$path"
        if (p.split('/').contains("..")) throw SecurityException("'..' not allowed in path")
        return File(rootfs, p.removePrefix("/"))
    }

    companion object {
        fun truncate(s: String, limit: Int): String {
            if (s.length <= limit) return s
            val head = limit * 2 / 3
            val tail = limit - head
            return s.take(head) + "\n…[truncated ${s.length - limit} chars]…\n" + s.takeLast(tail)
        }

        /** Shared process runner used by proot, Shizuku and su shells. */
        fun runProcess(p: Process, timeoutSec: Int, limit: Int, onOutput: ((String) -> Unit)?): ShellResult {
            val sb = StringBuilder()
            val reader = Thread {
                runCatching {
                    p.inputStream.bufferedReader().use { r ->
                        val buf = CharArray(4096)
                        while (true) {
                            val n = r.read(buf); if (n < 0) break
                            val s = String(buf, 0, n)
                            synchronized(sb) { if (sb.length < 2_000_000) sb.append(s) }
                            onOutput?.invoke(s)
                        }
                    }
                }
            }.apply { isDaemon = true; start() }
            val finished = p.waitFor(timeoutSec.toLong(), TimeUnit.SECONDS)
            if (!finished) { p.destroy(); runCatching { p.waitFor(2, TimeUnit.SECONDS) }; p.destroyForcibly() }
            reader.join(2000)
            val out = synchronized(sb) { sb.toString() }
            return ShellResult(if (finished) p.exitValue() else -1, truncate(out, limit), !finished)
        }
    }
}
