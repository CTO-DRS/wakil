package com.drsai.assistant.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.drsai.assistant.BuildConfig
import com.drsai.assistant.R
import com.drsai.assistant.domain.model.VoiceCatalog
import com.drsai.assistant.di.AppContainer
import com.drsai.assistant.domain.model.AppSettings
import com.drsai.assistant.domain.model.DownloadState
import com.drsai.assistant.domain.model.ModelSpec
import com.drsai.assistant.ui.downloadErrorText
import com.drsai.assistant.ui.formatBytes
import com.drsai.assistant.ui.modelDescriptionRes
import java.util.Locale
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onModelDeleted: () -> Unit,
    onOpenLicenses: () -> Unit = {},
) {
    val vm: SettingsViewModel = viewModel(
        factory = viewModelFactory { initializer { SettingsViewModel(container) } },
    )
    val settings by vm.settings.collectAsStateWithLifecycle()
    val deleting by vm.deleting.collectAsStateWithLifecycle()
    val selected by vm.selected.collectAsStateWithLifecycle()
    val needsOnboarding by vm.needsOnboarding.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf<ModelSpec?>(null) }
    var confirmDeleteVoice by remember { mutableStateOf(false) }
    val voiceState by vm.voiceState.collectAsStateWithLifecycle()
    val deletingVoice by vm.deletingVoice.collectAsStateWithLifecycle()
    val speakingId by vm.speakingId.collectAsStateWithLifecycle()

    LaunchedEffect(needsOnboarding) { if (needsOnboarding) onModelDeleted() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Temperature
            Section(title = stringResource(R.string.settings_temperature)) {
                var temp by remember(settings.temperature) { mutableFloatStateOf(settings.temperature) }
                Text(
                    stringResource(R.string.settings_temperature_value, String.format(Locale.getDefault(), "%.1f", temp)),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Slider(
                    value = temp,
                    onValueChange = { temp = (it * 10).roundToInt() / 10f },
                    onValueChangeFinished = { vm.setTemperature(temp) },
                    valueRange = 0f..1.5f,
                    steps = 14,
                )
                Text(stringResource(R.string.settings_temperature_hint), style = MaterialTheme.typography.bodySmall)
            }

            // Context size
            Section(title = stringResource(R.string.settings_context)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppSettings.CONTEXT_OPTIONS.forEach { size ->
                        FilterChip(
                            selected = settings.contextSize == size,
                            onClick = { vm.setContextSize(size) },
                            label = { Text(stringResource(R.string.settings_context_tokens, size)) },
                        )
                    }
                }
                Text(stringResource(R.string.settings_context_hint), style = MaterialTheme.typography.bodySmall)
            }

            // Voice
            Section(title = stringResource(R.string.settings_voice)) {
                val sample = stringResource(R.string.voice_sample_text)
                VoiceCard(
                    state = voiceState,
                    totalBytes = vm.voiceTotalBytes,
                    deleting = deletingVoice,
                    autoRead = settings.autoRead,
                    speed = settings.ttsSpeed,
                    sampling = speakingId == SettingsViewModel.SAMPLE_ID,
                    onDownload = vm::startVoiceDownload,
                    onPause = vm::pauseVoiceDownload,
                    onDelete = { confirmDeleteVoice = true },
                    onAutoRead = vm::setAutoRead,
                    onSpeed = vm::setTtsSpeed,
                    onSample = { vm.toggleSample(sample) },
                )
            }

            // Models
            Section(title = stringResource(R.string.settings_model)) {
                vm.catalog.forEach { spec ->
                    ModelRow(
                        spec = spec,
                        state = vm.repository(spec).downloadState.collectAsStateWithLifecycle().value,
                        isSelected = spec.id == selected.id,
                        deleting = deleting == spec.id,
                        onSelect = { vm.select(spec) },
                        onDownload = { vm.startDownload(spec) },
                        onPause = { vm.pauseDownload(spec) },
                        onDelete = { confirmDelete = spec },
                    )
                }
            }

            // About & licenses
            Section(title = stringResource(R.string.settings_about)) {
                Text(stringResource(R.string.settings_about_body), style = MaterialTheme.typography.bodyMedium)
                Text(stringResource(R.string.settings_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = onOpenLicenses) { Text(stringResource(R.string.licenses_title)) }
            }
        }
    }

    if (confirmDeleteVoice) {
        AlertDialog(
            onDismissRequest = { confirmDeleteVoice = false },
            title = { Text(stringResource(R.string.voice_delete_title)) },
            text = { Text(stringResource(R.string.voice_delete_body, formatBytes(vm.voiceTotalBytes))) },
            confirmButton = {
                TextButton(onClick = { confirmDeleteVoice = false; vm.deleteVoice() }) {
                    Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDeleteVoice = false }) { Text(stringResource(R.string.action_cancel)) }
            },
        )
    }

    confirmDelete?.let { spec ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text(stringResource(R.string.settings_delete_model_title)) },
            text = {
                Text(spec.displayName + "\n" +
                    stringResource(R.string.settings_delete_model_body, formatBytes(spec.sizeBytes)))
            },
            confirmButton = {
                TextButton(onClick = { confirmDelete = null; vm.deleteModel(spec) }) {
                    Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = null }) { Text(stringResource(R.string.action_cancel)) }
            },
        )
    }
}

@Composable
private fun ModelRow(
    spec: ModelSpec,
    state: DownloadState,
    isSelected: Boolean,
    deleting: Boolean,
    onSelect: () -> Unit,
    onDownload: () -> Unit,
    onPause: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 4.dp)) {
        Text(spec.displayName, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
        if (spec.recommended) {
            Text(stringResource(R.string.model_recommended), style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary)
        }
        Text(stringResource(modelDescriptionRes(spec)), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.onboarding_model_size, formatBytes(spec.sizeBytes)),
            style = MaterialTheme.typography.bodySmall)
        val status = when (state) {
            is DownloadState.Completed ->
                if (isSelected) stringResource(R.string.settings_model_in_use) else stringResource(R.string.settings_model_downloaded)
            is DownloadState.Downloading -> stringResource(R.string.onboarding_progress,
                formatBytes(state.downloaded), formatBytes(state.total), (state.fraction * 100).toInt())
            is DownloadState.Paused -> stringResource(R.string.onboarding_paused,
                formatBytes(state.downloaded), formatBytes(state.total))
            is DownloadState.Verifying -> stringResource(R.string.onboarding_verifying)
            is DownloadState.Failed -> downloadErrorText(state, spec)
            is DownloadState.NotStarted -> stringResource(R.string.settings_model_not_downloaded)
        }
        Text(
            status,
            style = MaterialTheme.typography.bodySmall,
            color = if (state is DownloadState.Failed) MaterialTheme.colorScheme.error
            else if (isSelected && state is DownloadState.Completed) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (state is DownloadState.Downloading) {
            LinearProgressIndicator(progress = { state.fraction }, modifier = Modifier.fillMaxWidth())
        } else if (state is DownloadState.Verifying) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when (state) {
                is DownloadState.Completed -> if (!isSelected) {
                    Button(onClick = onSelect) { Text(stringResource(R.string.settings_model_use)) }
                }
                is DownloadState.Downloading -> OutlinedButton(onClick = onPause) {
                    Text(stringResource(R.string.onboarding_pause))
                }
                is DownloadState.Paused -> Button(onClick = onDownload) {
                    Text(stringResource(R.string.onboarding_resume))
                }
                is DownloadState.NotStarted, is DownloadState.Failed -> Button(onClick = onDownload) {
                    Text(stringResource(R.string.settings_model_download))
                }
                is DownloadState.Verifying -> Unit
            }
            val canDelete = state is DownloadState.Completed || state is DownloadState.Paused ||
                state is DownloadState.Failed
            if (canDelete) {
                OutlinedButton(
                    onClick = onDelete,
                    enabled = !deleting,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    if (deleting) {
                        CircularProgressIndicator(Modifier.padding(end = 8.dp).size(18.dp), strokeWidth = 2.dp)
                    }
                    Text(stringResource(R.string.action_delete))
                }
            }
        }
        HorizontalDivider(Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun VoiceCard(
    state: DownloadState,
    totalBytes: Long,
    deleting: Boolean,
    autoRead: Boolean,
    speed: Float,
    sampling: Boolean,
    onDownload: () -> Unit,
    onPause: () -> Unit,
    onDelete: () -> Unit,
    onAutoRead: (Boolean) -> Unit,
    onSpeed: (Float) -> Unit,
    onSample: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.voice_name), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
        Text(stringResource(R.string.voice_desc), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.onboarding_model_size, formatBytes(totalBytes)), style = MaterialTheme.typography.bodySmall)
        val status = when (state) {
            is DownloadState.Completed -> stringResource(R.string.voice_ready)
            is DownloadState.Downloading -> stringResource(R.string.onboarding_progress,
                formatBytes(state.downloaded), formatBytes(state.total), (state.fraction * 100).toInt())
            is DownloadState.Paused -> stringResource(R.string.onboarding_paused,
                formatBytes(state.downloaded), formatBytes(state.total))
            is DownloadState.Verifying -> stringResource(R.string.onboarding_verifying)
            is DownloadState.Failed -> voiceErrorText(state, totalBytes)
            is DownloadState.NotStarted -> stringResource(R.string.settings_model_not_downloaded)
        }
        Text(
            status,
            style = MaterialTheme.typography.bodySmall,
            color = when (state) {
                is DownloadState.Failed -> MaterialTheme.colorScheme.error
                is DownloadState.Completed -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
        if (state is DownloadState.Downloading) {
            LinearProgressIndicator(progress = { state.fraction }, modifier = Modifier.fillMaxWidth())
        } else if (state is DownloadState.Verifying) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when (state) {
                is DownloadState.Completed -> Button(onClick = onSample) {
                    Text(stringResource(if (sampling) R.string.action_stop_reading else R.string.voice_try))
                }
                is DownloadState.Downloading -> OutlinedButton(onClick = onPause) {
                    Text(stringResource(R.string.onboarding_pause))
                }
                is DownloadState.Paused -> Button(onClick = onDownload) {
                    Text(stringResource(R.string.onboarding_resume))
                }
                is DownloadState.NotStarted, is DownloadState.Failed -> Button(onClick = onDownload) {
                    Text(stringResource(R.string.settings_model_download))
                }
                is DownloadState.Verifying -> Unit
            }
            if (state is DownloadState.Completed || state is DownloadState.Paused || state is DownloadState.Failed) {
                OutlinedButton(
                    onClick = onDelete,
                    enabled = !deleting,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    if (deleting) {
                        CircularProgressIndicator(Modifier.padding(end = 8.dp).size(18.dp), strokeWidth = 2.dp)
                    }
                    Text(stringResource(R.string.action_delete))
                }
            }
        }
        HorizontalDivider(Modifier.padding(vertical = 4.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.voice_auto_read), style = MaterialTheme.typography.bodyMedium)
                Text(stringResource(R.string.voice_auto_read_hint), style = MaterialTheme.typography.bodySmall)
            }
            Switch(checked = autoRead, onCheckedChange = onAutoRead)
        }
        var s by remember(speed) { mutableFloatStateOf(speed) }
        Text(
            stringResource(R.string.voice_speed_value, String.format(Locale.US, "%.2f", s)),
            style = MaterialTheme.typography.bodyMedium,
        )
        Slider(
            value = s,
            onValueChange = { s = (it * 20).roundToInt() / 20f },
            onValueChangeFinished = { onSpeed(s) },
            valueRange = VoiceCatalog.MIN_SPEED..VoiceCatalog.MAX_SPEED,
            steps = 9,
        )
    }
}

@Composable
private fun voiceErrorText(failed: DownloadState.Failed, totalBytes: Long): String = when (failed.reason) {
    DownloadState.Reason.NOT_ENOUGH_STORAGE -> stringResource(
        R.string.error_storage, formatBytes(failed.detail?.toLongOrNull() ?: totalBytes),
    )
    DownloadState.Reason.NETWORK -> stringResource(R.string.error_network)
    DownloadState.Reason.CHECKSUM -> stringResource(R.string.error_checksum)
    DownloadState.Reason.UNKNOWN -> stringResource(R.string.error_unknown)
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}
