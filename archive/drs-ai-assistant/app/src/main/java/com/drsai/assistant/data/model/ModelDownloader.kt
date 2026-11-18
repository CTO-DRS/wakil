package com.drsai.assistant.data.model

import android.content.Context
import android.os.StatFs
import com.drsai.assistant.BuildConfig
import com.drsai.assistant.domain.model.DownloadState
import com.drsai.assistant.domain.model.ModelSpec
import com.drsai.assistant.domain.repository.ModelRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.coroutines.cancellation.CancellationException

/**
 * Downloads a model file into app-specific storage (filesDir/<dirName>) with HTTP Range resume,
 * a free-space check, and SHA-256 verification. Runs in the application scope so it
 * survives screen rotation and navigation; a killed process resumes from the .part file.
 */
class ModelDownloader(
    context: Context,
    override val spec: ModelSpec,
    private val scope: CoroutineScope,
    dirName: String = "models",
    private val safetyMargin: Long = DEFAULT_SAFETY_MARGIN,
) : ModelRepository {
    private val dir = File(context.filesDir, dirName).apply { mkdirs() }
    private val target = File(dir, spec.fileName)
    private val partial = File(dir, spec.fileName + ".part")

    private val _state = MutableStateFlow<DownloadState>(initialState())
    override val downloadState: StateFlow<DownloadState> = _state.asStateFlow()
    private var job: Job? = null

    override fun modelFile(): File = target
    override fun isModelReady(): Boolean = target.exists() && target.length() == spec.sizeBytes

    override fun freeBytes(): Long = StatFs(dir.absolutePath).availableBytes

    private fun initialState(): DownloadState = when {
        isModelReady() -> DownloadState.Completed
        partial.exists() -> DownloadState.Paused(partial.length(), spec.sizeBytes)
        else -> DownloadState.NotStarted
    }

    override fun startDownload() {
        if (job?.isActive == true || isModelReady()) return
        job = scope.launch(Dispatchers.IO) {
            try {
                download()
            } catch (e: CancellationException) {
                _state.value = DownloadState.Paused(partial.length(), spec.sizeBytes)
                throw e
            } catch (e: IOException) {
                _state.value = DownloadState.Failed(DownloadState.Reason.NETWORK, e.message)
            } catch (e: Exception) {
                _state.value = DownloadState.Failed(DownloadState.Reason.UNKNOWN, e.message)
            }
        }
    }

    override fun pauseDownload() {
        job?.cancel()
        job = null
        if (!isModelReady()) _state.value = DownloadState.Paused(partial.length(), spec.sizeBytes)
    }

    override suspend fun deleteModel() = withContext(Dispatchers.IO) {
        job?.cancelAndJoin()
        job = null
        target.delete()
        partial.delete()
        _state.value = DownloadState.NotStarted
    }

    private suspend fun download() {
        var have = if (partial.exists()) partial.length() else 0L
        if (have > spec.sizeBytes) {
            partial.delete(); have = 0L
        }
        val needed = spec.sizeBytes - have + safetyMargin
        if (freeBytes() < needed) {
            _state.value = DownloadState.Failed(DownloadState.Reason.NOT_ENOUGH_STORAGE, needed.toString())
            return
        }
        _state.value = DownloadState.Downloading(have, spec.sizeBytes)

        if (have < spec.sizeBytes) {
            val conn = (URL(spec.url).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 20_000
                readTimeout = 30_000
                setRequestProperty("User-Agent", "DRS-AI/${BuildConfig.VERSION_NAME} (Android)")
                if (have > 0) setRequestProperty("Range", "bytes=$have-")
            }
            try {
                val code = conn.responseCode
                val append = when (code) {
                    HttpURLConnection.HTTP_PARTIAL -> true
                    HttpURLConnection.HTTP_OK -> false // server ignored Range: start over
                    416 -> true // already complete
                    else -> throw IOException("HTTP $code")
                }
                if (!append) have = 0L
                if (code != 416) {
                    conn.inputStream.use { input ->
                        FileOutputStream(partial, append).use { out ->
                            val buf = ByteArray(256 * 1024)
                            var lastEmit = 0L
                            while (true) {
                                currentCoroutineContext().ensureActive()
                                val r = input.read(buf)
                                if (r < 0) break
                                out.write(buf, 0, r)
                                have += r
                                if (have - lastEmit >= 1_000_000 || have == spec.sizeBytes) {
                                    lastEmit = have
                                    _state.value = DownloadState.Downloading(have, spec.sizeBytes)
                                }
                            }
                        }
                    }
                }
            } finally {
                conn.disconnect()
            }
        }

        if (partial.length() != spec.sizeBytes) {
            throw IOException("Incomplete download: ${partial.length()} of ${spec.sizeBytes}")
        }
        _state.value = DownloadState.Verifying
        val digest = sha256(partial)
        if (!digest.equals(spec.sha256, ignoreCase = true)) {
            partial.delete()
            _state.value = DownloadState.Failed(DownloadState.Reason.CHECKSUM, digest)
            return
        }
        if (!partial.renameTo(target)) throw IOException("Could not move model into place")
        _state.value = DownloadState.Completed
    }

    private suspend fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(1024 * 1024)
            while (true) {
                currentCoroutineContext().ensureActive()
                val r = input.read(buf)
                if (r < 0) break
                md.update(buf, 0, r)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val DEFAULT_SAFETY_MARGIN = 200L * 1024 * 1024
    }
}
