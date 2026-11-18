package com.drsai.assistant.domain.model

sealed interface DownloadState {
    data object NotStarted : DownloadState
    data class Downloading(val downloaded: Long, val total: Long) : DownloadState {
        val fraction: Float get() = if (total > 0) (downloaded.toFloat() / total).coerceIn(0f, 1f) else 0f
    }
    data class Paused(val downloaded: Long, val total: Long) : DownloadState
    data object Verifying : DownloadState
    data object Completed : DownloadState
    data class Failed(val reason: Reason, val detail: String? = null) : DownloadState

    enum class Reason { NOT_ENOUGH_STORAGE, NETWORK, CHECKSUM, UNKNOWN }
}
