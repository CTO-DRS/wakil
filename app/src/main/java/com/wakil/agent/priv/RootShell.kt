package com.wakil.agent.priv

import com.wakil.agent.env.LinuxEnv
import com.wakil.agent.env.ShellResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Optional real-root path: only offered when an `su` binary exists on the device. */
object RootShell {
    private val candidates = listOf(
        "/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su",
        "/system/sbin/su", "/vendor/bin/su", "/data/adb/ksu/bin/su", "/data/adb/ap/bin/su",
    )

    fun suPath(): String? =
        candidates.firstOrNull { File(it).exists() }
            ?: System.getenv("PATH")?.split(":")?.map { File(it, "su") }?.firstOrNull { it.exists() }?.path

    val available get() = suPath() != null

    suspend fun exec(cmd: String, timeoutSec: Int, limit: Int): ShellResult = withContext(Dispatchers.IO) {
        val su = suPath() ?: return@withContext ShellResult(-1, "su غير موجود: الجهاز غير مروّت", false)
        try {
            val p = ProcessBuilder(su, "-c", cmd).redirectErrorStream(true).start()
            LinuxEnv.runProcess(p, timeoutSec, limit, null)
        } catch (t: Throwable) {
            ShellResult(-1, "su error: $t", false)
        }
    }
}
