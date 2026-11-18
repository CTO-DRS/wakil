package com.drsai.assistant.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.drsai.assistant.R
import com.drsai.assistant.domain.model.DownloadState
import com.drsai.assistant.domain.model.ModelCatalog
import com.drsai.assistant.domain.model.ModelSpec

@StringRes
fun modelDescriptionRes(spec: ModelSpec): Int = when (spec.id) {
    ModelCatalog.JAIS3.id -> R.string.model_jais_desc
    else -> R.string.model_qwen_desc
}

@Composable
fun downloadErrorText(failed: DownloadState.Failed, spec: ModelSpec): String = when (failed.reason) {
    DownloadState.Reason.NOT_ENOUGH_STORAGE -> stringResource(
        R.string.error_storage,
        formatBytes(failed.detail?.toLongOrNull() ?: spec.sizeBytes),
    )
    DownloadState.Reason.NETWORK -> stringResource(R.string.error_network)
    DownloadState.Reason.CHECKSUM -> stringResource(R.string.error_checksum)
    DownloadState.Reason.UNKNOWN -> stringResource(R.string.error_unknown)
}
