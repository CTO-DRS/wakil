package com.drsai.assistant.ui.onboarding

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.drsai.assistant.R
import com.drsai.assistant.di.AppContainer
import com.drsai.assistant.domain.model.DownloadState
import com.drsai.assistant.ui.downloadErrorText
import com.drsai.assistant.ui.formatBytes
import com.drsai.assistant.ui.modelDescriptionRes

@Composable
fun OnboardingScreen(container: AppContainer, onReady: () -> Unit) {
    val models = container.models
    val selected by models.selected.collectAsStateWithLifecycle()
    val repo = models.repository(selected.id)
    val state by repo.downloadState.collectAsStateWithLifecycle()
    val spec = selected

    LaunchedEffect(spec.id, state) { if (state is DownloadState.Completed) onReady() }

    val downloading = state is DownloadState.Downloading || state is DownloadState.Verifying
    KeepScreenOn(downloading)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(24.dp))
        Text("DRS", style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary)
        Text(stringResource(R.string.onboarding_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.onboarding_body), style = MaterialTheme.typography.bodyLarge)

        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Lock, contentDescription = null, modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.size(8.dp))
            Text(stringResource(R.string.onboarding_privacy), style = MaterialTheme.typography.bodyMedium)
        }

        Text(stringResource(R.string.onboarding_choose_model), style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.fillMaxWidth())
        models.catalog.forEach { m ->
            val isSelected = m.id == spec.id
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .selectable(selected = isSelected, enabled = !downloading, onClick = { models.select(m.id) }),
                colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) MaterialTheme.colorScheme.secondaryContainer
                    else MaterialTheme.colorScheme.surfaceVariant,
                ),
            ) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = isSelected, onClick = null, enabled = !downloading)
                    Spacer(Modifier.size(8.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(m.displayName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        if (m.recommended) {
                            Text(stringResource(R.string.model_recommended), style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.primary)
                        }
                        Text(stringResource(modelDescriptionRes(m)), style = MaterialTheme.typography.bodySmall)
                        Text(stringResource(R.string.onboarding_model_size, formatBytes(m.sizeBytes)),
                            style = MaterialTheme.typography.bodySmall)
                        Text(stringResource(R.string.onboarding_model_license, m.license),
                            style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        Text(stringResource(R.string.onboarding_free_space, formatBytes(repo.freeBytes())),
            style = MaterialTheme.typography.bodySmall, modifier = Modifier.fillMaxWidth())

        when (val s = state) {
            is DownloadState.NotStarted -> Button(onClick = repo::startDownload, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.onboarding_download))
            }
            is DownloadState.Downloading -> {
                LinearProgressIndicator(progress = { s.fraction }, modifier = Modifier.fillMaxWidth())
                Text(stringResource(R.string.onboarding_progress, formatBytes(s.downloaded), formatBytes(s.total),
                    (s.fraction * 100).toInt()))
                OutlinedButton(onClick = repo::pauseDownload, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.onboarding_pause))
                }
                Text(stringResource(R.string.onboarding_keep_open), style = MaterialTheme.typography.bodySmall)
            }
            is DownloadState.Paused -> {
                val f = if (s.total > 0) s.downloaded.toFloat() / s.total else 0f
                LinearProgressIndicator(progress = { f }, modifier = Modifier.fillMaxWidth())
                Text(stringResource(R.string.onboarding_paused, formatBytes(s.downloaded), formatBytes(s.total)))
                Button(onClick = repo::startDownload, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.onboarding_resume))
                }
            }
            is DownloadState.Verifying -> {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Text(stringResource(R.string.onboarding_verifying))
            }
            is DownloadState.Completed -> Text(stringResource(R.string.onboarding_done))
            is DownloadState.Failed -> {
                Text(downloadErrorText(s, spec), color = MaterialTheme.colorScheme.error)
                Button(onClick = repo::startDownload, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.action_retry))
                }
            }
        }
    }
}

@Composable
fun KeepScreenOn(enabled: Boolean) {
    val activity = LocalContext.current as? Activity ?: return
    DisposableEffect(enabled) {
        if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
}
