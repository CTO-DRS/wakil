package com.drsai.assistant.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.StopCircle
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.drsai.assistant.R
import com.drsai.assistant.di.AppContainer
import com.drsai.assistant.domain.model.ChatRole
import com.drsai.assistant.llm.EngineState
import com.drsai.assistant.ui.onboarding.KeepScreenOn

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    container: AppContainer,
    conversationId: Long,
    onNewChat: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val vm: ChatViewModel = viewModel(
        key = "chat-$conversationId",
        factory = viewModelFactory { initializer { ChatViewModel(container, conversationId) } },
    )
    val messages by vm.messages.collectAsStateWithLifecycle()
    val streaming by vm.streaming.collectAsStateWithLifecycle()
    val engine by vm.engineState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val reasoning by vm.reasoning.collectAsStateWithLifecycle()
    val autoRead by vm.autoRead.collectAsStateWithLifecycle()
    val speakingId by vm.speakingId.collectAsStateWithLifecycle()
    val voiceMissing by vm.voiceMissing.collectAsStateWithLifecycle()
    var input by rememberSaveable { mutableStateOf("") }
    val generating = streaming != null
    val listState = rememberLazyListState()

    KeepScreenOn(generating)

    LaunchedEffect(messages.size, streaming?.text?.length) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DRS", fontWeight = FontWeight.Bold) },
                actions = {
                    val readingAloud = autoRead && vm.voiceAvailable
                    IconButton(onClick = vm::toggleAutoRead) {
                        Icon(
                            if (readingAloud) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                            contentDescription = stringResource(
                                if (readingAloud) R.string.action_auto_read_off else R.string.action_auto_read_on,
                            ),
                            tint = if (readingAloud) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = onNewChat) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.action_new_chat))
                    }
                    IconButton(onClick = onOpenHistory) {
                        Icon(Icons.Filled.History, contentDescription = stringResource(R.string.action_history))
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Settings, contentDescription = stringResource(R.string.action_settings))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding(),
        ) {
            if (engine is EngineState.Loading) {
                LinearProgressIndicator(Modifier.fillMaxWidth())
                Text(stringResource(R.string.chat_loading_model), Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.bodySmall)
            }
            Box(Modifier.weight(1f)) {
                if (messages.isEmpty()) {
                    EmptyState(onPick = { vm.send(it) })
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(messages, key = { it.id }) { m ->
                            val live = streaming?.takeIf { it.messageId == m.id }
                            Bubble(
                                role = m.role,
                                text = live?.text ?: m.content,
                                pending = live != null,
                                reasoning = live?.reasoning ?: reasoning[m.id].orEmpty(),
                                thinking = live?.thinking == true,
                                speaking = speakingId == m.id,
                                canSpeak = m.role == ChatRole.ASSISTANT &&
                                    (live == null && m.content.isNotBlank() || speakingId == m.id),
                                onSpeak = { vm.toggleSpeak(m) },
                            )
                        }
                    }
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.chat_hint)) },
                    maxLines = 5,
                    shape = RoundedCornerShape(24.dp),
                )
                if (generating) {
                    FilledIconButton(onClick = vm::stop, modifier = Modifier.padding(start = 8.dp)) {
                        Icon(Icons.Filled.Stop, contentDescription = stringResource(R.string.action_stop))
                    }
                } else {
                    FilledIconButton(
                        onClick = { vm.send(input); input = "" },
                        enabled = input.isNotBlank() && engine !is EngineState.Loading,
                        modifier = Modifier.padding(start = 8.dp),
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.action_send))
                    }
                }
            }
        }
    }

    if (voiceMissing) {
        AlertDialog(
            onDismissRequest = vm::dismissVoiceMissing,
            title = { Text(stringResource(R.string.voice_missing_title)) },
            text = { Text(stringResource(R.string.voice_missing_body)) },
            confirmButton = {
                TextButton(onClick = { vm.dismissVoiceMissing(); onOpenSettings() }) {
                    Text(stringResource(R.string.voice_open_settings))
                }
            },
            dismissButton = {
                TextButton(onClick = vm::dismissVoiceMissing) { Text(stringResource(R.string.action_cancel)) }
            },
        )
    }

    error?.let { msg ->
        AlertDialog(
            onDismissRequest = vm::clearError,
            confirmButton = { TextButton(onClick = vm::clearError) { Text(stringResource(R.string.action_ok)) } },
            title = { Text(stringResource(R.string.error_title)) },
            text = { Text(msg) },
        )
    }
}

@Composable
private fun Bubble(
    role: ChatRole,
    text: String,
    pending: Boolean,
    reasoning: String = "",
    thinking: Boolean = false,
    speaking: Boolean = false,
    canSpeak: Boolean = false,
    onSpeak: () -> Unit = {},
) {
    val mine = role == ChatRole.USER
    val bg = if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (mine) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
    var showReasoning by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.Start else Arrangement.End) {
        Column(
            Modifier
                .widthIn(max = 320.dp)
                .background(bg, RoundedCornerShape(18.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            if (!mine && (reasoning.isNotEmpty() || thinking)) {
                // Reasoning stays collapsed; the user can peek at it.
                Text(
                    text = when {
                        thinking && !showReasoning -> stringResource(R.string.chat_thinking)
                        showReasoning -> stringResource(R.string.chat_reasoning_hide)
                        else -> stringResource(R.string.chat_reasoning_show)
                    },
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier
                        .clickable(enabled = reasoning.isNotEmpty()) { showReasoning = !showReasoning }
                        .padding(bottom = 4.dp),
                )
                if (showReasoning && reasoning.isNotEmpty()) {
                    Text(
                        text = reasoning,
                        color = fg.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(bottom = 6.dp),
                    )
                }
            }
            if (text.isNotEmpty() || !thinking) {
                SelectionContainer {
                    Text(
                        text = if (text.isEmpty() && pending) "…" else text,
                        color = fg,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
            if (canSpeak) {
                IconButton(onClick = onSpeak, modifier = Modifier.size(36.dp)) {
                    Icon(
                        if (speaking) Icons.Filled.StopCircle else Icons.Filled.PlayArrow,
                        contentDescription = stringResource(if (speaking) R.string.action_stop_reading else R.string.action_read_aloud),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun EmptyState(onPick: (String) -> Unit) {
    val suggestions = listOf(
        stringResource(R.string.suggestion_1),
        stringResource(R.string.suggestion_2),
        stringResource(R.string.suggestion_3),
    )
    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(stringResource(R.string.chat_greeting), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.chat_greeting_sub), style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp))
        suggestions.forEach { s ->
            SuggestionChip(onClick = { onPick(s) }, label = { Text(s) })
        }
    }
}
