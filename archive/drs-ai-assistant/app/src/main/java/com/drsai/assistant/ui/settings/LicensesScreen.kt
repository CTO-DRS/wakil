package com.drsai.assistant.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.drsai.assistant.R

/** One open-source component shown on the licenses screen. */
private data class LicenseEntry(val name: String, val license: String, val copyright: String, val url: String)

private val ENTRIES = listOf(
    LicenseEntry(
        "llama.cpp (8642541)", "MIT",
        "Copyright (c) 2023-2026 The ggml authors", "https://github.com/ggml-org/llama.cpp",
    ),
    LicenseEntry(
        "ONNX Runtime 1.22.0", "MIT",
        "Copyright (c) Microsoft Corporation", "https://github.com/microsoft/onnxruntime",
    ),
    LicenseEntry(
        "espeak-ng 1.52 Arabic data (lexicon, numbers, rules — derived)", "GPL-3.0-or-later",
        "Copyright (C) Jonathan Duddington, Reece H. Dunn and the espeak-ng contributors",
        "https://github.com/espeak-ng/espeak-ng",
    ),
    LicenseEntry(
        "Nabra-Saudi-7M voice (ONNX, fp16 weights)", "Apache-2.0",
        "Copyright (c) oddadmix", "https://huggingface.co/oddadmix/Nabra-Saudi-7M",
    ),
    LicenseEntry(
        "Jais-3-0.9B", "Apache-2.0",
        "Copyright (c) Inception / IFM", "https://huggingface.co/IFM/Jais-3-0.9B-GGUF",
    ),
    LicenseEntry(
        "Qwen2.5-1.5B-Instruct", "Apache-2.0",
        "Copyright (c) Alibaba Cloud, Qwen Team", "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    ),
    LicenseEntry(
        "AndroidX, Jetpack Compose, Kotlin coroutines", "Apache-2.0",
        "Copyright (c) The Android Open Source Project; JetBrains s.r.o.", "https://developer.android.com/jetpack",
    ),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicensesScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.licenses_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        SelectionContainer {
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("DRS AI — GPL-3.0-or-later", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(stringResource(R.string.licenses_app_body), style = MaterialTheme.typography.bodyMedium)
                        Text("https://github.com/CTO-DRS/DRS-AI-Assistant", style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary)
                    }
                }
                Text(stringResource(R.string.licenses_third_party), style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold)
                ENTRIES.forEach { e ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(e.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            Text(e.license, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                            Text(e.copyright, style = MaterialTheme.typography.bodySmall)
                            Text(e.url, style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                Text(stringResource(R.string.licenses_models_note), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
