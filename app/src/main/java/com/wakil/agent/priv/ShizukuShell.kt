package com.wakil.agent.priv

import android.content.pm.PackageManager
import com.wakil.agent.env.LinuxEnv
import com.wakil.agent.env.ShellResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import rikka.shizuku.Shizuku

enum class ShizukuStatus { NOT_RUNNING, NO_PERMISSION, READY, UNSUPPORTED }

/**
 * "Privileged mode" through Shizuku: runs shell commands as the ADB shell user (uid 2000),
 * or as root if the Shizuku server itself was started with root.
 *
 * Uses Shizuku's remote process API. In api 13.x `Shizuku.newProcess` is private (the
 * recommended route is a UserService/AIDL); we call it via reflection, which works with
 * the 13.1.5 client and current Shizuku servers.
 */
object ShizukuShell {
    private const val REQ = 4242
    private val _status = MutableStateFlow(ShizukuStatus.NOT_RUNNING)
    val status: StateFlow<ShizukuStatus> = _status

    private val permListener = Shizuku.OnRequestPermissionResultListener { _, _ -> refresh() }
    private val binderReceived = Shizuku.OnBinderReceivedListener { refresh() }
    private val binderDead = Shizuku.OnBinderDeadListener { refresh() }

    fun init() {
        runCatching {
            Shizuku.addBinderReceivedListenerSticky(binderReceived)
            Shizuku.addBinderDeadListener(binderDead)
            Shizuku.addRequestPermissionResultListener(permListener)
        }
        refresh()
    }

    fun refresh(): ShizukuStatus {
        val s = runCatching {
            when {
                !Shizuku.pingBinder() -> ShizukuStatus.NOT_RUNNING
                Shizuku.isPreV11() -> ShizukuStatus.UNSUPPORTED
                Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED -> ShizukuStatus.READY
                else -> ShizukuStatus.NO_PERMISSION
            }
        }.getOrDefault(ShizukuStatus.NOT_RUNNING)
        _status.value = s
        return s
    }

    fun requestPermission() {
        runCatching { if (Shizuku.pingBinder()) Shizuku.requestPermission(REQ) }
    }

    /** uid of the Shizuku server: 2000 = adb shell, 0 = root. */
    fun serverUid(): Int = runCatching { Shizuku.getUid() }.getOrDefault(-1)

    val isReady get() = refresh() == ShizukuStatus.READY

    private fun newProcess(argv: Array<String>): Process {
        val m = Shizuku::class.java.getDeclaredMethod(
            "newProcess", Array<String>::class.java, Array<String>::class.java, String::class.java
        )
        m.isAccessible = true
        return m.invoke(null, argv, null, null) as Process
    }

    suspend fun exec(cmd: String, timeoutSec: Int, limit: Int): ShellResult = withContext(Dispatchers.IO) {
        if (!isReady) return@withContext ShellResult(-1, "Shizuku غير متاح أو بلا إذن (status=${_status.value})", false)
        try {
            val p = newProcess(arrayOf("sh", "-c", cmd))
            LinuxEnv.runProcess(p, timeoutSec, limit, null)
        } catch (t: Throwable) {
            ShellResult(-1, "Shizuku exec error: ${t.cause ?: t}", false)
        }
    }
}
