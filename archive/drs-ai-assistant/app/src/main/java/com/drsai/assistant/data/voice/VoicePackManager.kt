package com.drsai.assistant.data.voice

import android.content.Context
import com.drsai.assistant.data.model.ModelDownloader
import com.drsai.assistant.domain.model.DownloadState
import com.drsai.assistant.domain.model.VoiceCatalog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import java.io.File

/** The downloadable voice (ONNX model + style pack), as one unit with one progress state. */
interface VoicePack {
    val downloadState: StateFlow<DownloadState>
    val totalBytes: Long
    fun isReady(): Boolean
    fun modelFile(): File
    fun styleFile(): File
    fun freeBytes(): Long
    fun startDownload()
    fun pauseDownload()
    suspend fun delete()
}

class VoicePackManager(context: Context, scope: CoroutineScope) : VoicePack {
    private val downloaders = VoiceCatalog.FILES.map {
        ModelDownloader(context, it, scope, dirName = "voice", safetyMargin = 50L * 1024 * 1024)
    }
    private val model = downloaders[0]
    private val style = downloaders[1]
    private val totals = VoiceCatalog.FILES.map { it.sizeBytes }

    override val totalBytes: Long = VoiceCatalog.TOTAL_BYTES

    override val downloadState: StateFlow<DownloadState> =
        combine(downloaders.map { it.downloadState }) { VoiceCatalog.combine(it.toList(), totals) }
            .stateIn(scope, SharingStarted.Eagerly, VoiceCatalog.combine(downloaders.map { it.downloadState.value }, totals))

    override fun isReady(): Boolean = downloaders.all { it.isModelReady() }
    override fun modelFile(): File = model.modelFile()
    override fun styleFile(): File = style.modelFile()
    override fun freeBytes(): Long = model.freeBytes()

    override fun startDownload() = downloaders.forEach { it.startDownload() }
    override fun pauseDownload() = downloaders.forEach { it.pauseDownload() }
    override suspend fun delete() = downloaders.forEach { it.deleteModel() }
}
