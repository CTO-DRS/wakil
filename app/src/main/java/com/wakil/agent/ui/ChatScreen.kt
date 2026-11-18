package com.wakil.agent.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Launch
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wakil.agent.WakilApp
import com.wakil.agent.agent.ChatItem
import com.wakil.agent.agent.ItemKind
import com.wakil.agent.agent.StreamView
import com.wakil.agent.llm.LlmState
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.MonoLtr
import com.wakil.agent.ui.theme.Neon

/** Maps the agent's existing state flows to an orb state (pure UI derivation, no logic change). */
fun deriveOrbState(running: Boolean, streaming: String, approvalPending: Boolean, items: List<ChatItem>, llmLoading: Boolean): OrbState {
    val last = items.lastOrNull()
    return when {
        approvalPending -> OrbState.APPROVAL
        running && last?.kind == ItemKind.TOOL_CALL -> OrbState.TOOL
        running || llmLoading -> OrbState.THINKING
        last?.kind == ItemKind.ERROR -> OrbState.ERROR
        else -> OrbState.IDLE
    }
}

@Composable
fun rememberAgentOrbState(app: WakilApp): OrbState {
    // robot / agent sounds on state changes (think chirp, tool tick, reply blip, error buzz)
    val st = rememberAgentOrbStateRaw(app)
    var prev by remember { mutableStateOf(st) }
    LaunchedEffect(st) {
        when {
            st == prev -> {}
            st == OrbState.THINKING && prev == OrbState.IDLE -> com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.ROBOT_THINK)
            st == OrbState.TOOL -> com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.TOOL_TICK)
            st == OrbState.ERROR -> com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.ERROR)
            st == OrbState.IDLE && prev != OrbState.ERROR -> com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.RECEIVED)
        }
        prev = st
    }
    return st
}

@Composable
private fun rememberAgentOrbStateRaw(app: WakilApp): OrbState {
    val items by app.agent.items.collectAsState()
    val running by app.agent.running.collectAsState()
    val streaming by app.agent.streaming.collectAsState()
    val approval by app.agent.approval.collectAsState()
    val llmState by app.llm.state.collectAsState()
    return deriveOrbState(running, streaming, approval != null, items, llmState is LlmState.Loading)
}

/** A chat row as displayed: plain message, or a tool call paired with its result. */
private sealed class Row_ {
    abstract val key: Long
    data class Msg(val item: ChatItem) : Row_() { override val key get() = item.id }
    data class Tool(val call: ChatItem?, val result: ChatItem?) : Row_() { override val key get() = (call ?: result)!!.id }
}

private fun toRows(items: List<ChatItem>): List<Row_> {
    val out = ArrayList<Row_>(items.size)
    var i = 0
    while (i < items.size) {
        val it = items[i]
        when (it.kind) {
            ItemKind.TOOL_CALL -> {
                val next = items.getOrNull(i + 1)
                if (next != null && next.kind == ItemKind.TOOL_RESULT) { out += Row_.Tool(it, next); i++ } else out += Row_.Tool(it, null)
            }
            ItemKind.TOOL_RESULT -> out += Row_.Tool(null, it)
            else -> out += Row_.Msg(it)
        }
        i++
    }
    return out
}

val SUGGESTIONS = listOf(
    "ثبّت بايثون واطبع إصدارها",
    "افتح الإعدادات واقرأ الشاشة",
    "اعرض التطبيقات المثبتة",
    "Install nmap and scan my router",
)

@Composable
fun ChatScreen(app: WakilApp, orbState: OrbState) {
    val items by app.agent.items.collectAsState()
    val running by app.agent.running.collectAsState()
    val streaming by app.agent.streaming.collectAsState()
    val llmState by app.llm.state.collectAsState()
    val approval by app.agent.approval.collectAsState()
    var input by remember { mutableStateOf("") }
    var showChats by remember { mutableStateOf(false) }
    val shared by app.agent.pendingInput.collectAsState()
    LaunchedEffect(shared) { shared?.let { input = if (input.isBlank()) it else input + "\n" + it; app.agent.pendingInput.value = null } }
    val listState = rememberLazyListState()
    val view = LocalView.current
    val rows = remember(items) { toRows(items) }
    val empty = items.isEmpty() && streaming.isEmpty()
    val streamView = remember(streaming) { StreamView.of(streaming) }
    val showThinking = running && streamView is StreamView.Pending && approval == null && items.lastOrNull()?.kind != ItemKind.TOOL_CALL

    LaunchedEffect(items.size, streaming.length / 40, showThinking) {
        val n = listState.layoutInfo.totalItemsCount
        if (n > 0) listState.animateScrollToItem(n - 1)
    }

    val sub = if (app.llm.usingRemote) "خادم: ${app.prefs.openAiModel}" else when (val s = llmState) {
        is LlmState.Ready -> s.name
        is LlmState.Loading -> "جارٍ تحميل ${s.name}…"
        is LlmState.Error -> "خطأ في النموذج"
        LlmState.Empty -> "لا يوجد نموذج محمّل"
    }
    val subColor = when (llmState) {
        is LlmState.Ready -> Neon.Green
        is LlmState.Error -> Neon.Red
        is LlmState.Loading -> Neon.Amber
        LlmState.Empty -> if (app.llm.usingRemote) Neon.Green else Neon.TextDim
    }

    val gaze = remember { RobotGaze() }
    // robot body language for the agent's state: think / talk (answer streaming) / type (tool) + shake on error, nod on reply
    val cueAction = when {
        orbState == OrbState.TOOL || streamView is StreamView.Tool -> RobotAction.TYPE
        streamView is StreamView.Answer -> RobotAction.TALK
        orbState == OrbState.THINKING -> RobotAction.THINK
        else -> RobotAction.NONE
    }
    var shot by remember { mutableStateOf(RobotAction.NONE) }
    var shotKey by remember { mutableIntStateOf(0) }
    var prevOrb by remember { mutableStateOf(orbState) }
    LaunchedEffect(orbState) {
        if (orbState == OrbState.ERROR && prevOrb != OrbState.ERROR) { shot = RobotAction.SHAKE; shotKey++ }
        else if (orbState == OrbState.IDLE && (prevOrb == OrbState.THINKING || prevOrb == OrbState.TOOL)) { shot = RobotAction.NOD; shotKey++ }
        prevOrb = orbState
    }
    val robotAction = if (cueAction != RobotAction.NONE) cueAction else shot
    val lastAssistant = items.lastOrNull { it.kind == ItemKind.ASSISTANT }?.id ?: -1L
    CompositionLocalProvider(LocalRobotGaze provides gaze, LocalReplyNod provides (lastAssistant to (if (shot == RobotAction.NOD) shotKey else 0))) {
    Column(Modifier.fillMaxSize().robotGazeSource(gaze)) {
        // ---- header
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 12.dp, top = 6.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            AnimatedVisibility(!empty, enter = fadeIn() + scaleIn(), exit = fadeOut() + scaleOut()) {
                Row {
                    WakilRobot(
                        58.dp, accent = robotAccent(orbState),
                        action = robotAction, actionKey = shotKey,
                    )
                    Spacer(Modifier.width(8.dp))
                }
            }
            Column(Modifier.weight(1f)) {
                Text("وكيل", style = MaterialTheme.typography.headlineSmall, color = Neon.Text)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PulseDot(subColor, size = 6.dp, pulsing = llmState is LlmState.Ready || llmState is LlmState.Loading)
                    Spacer(Modifier.width(4.dp))
                    Text(sub, style = MaterialTheme.typography.labelMedium, color = Neon.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            CircleIconButton(Icons.Filled.History, "المحادثات", { haptic(view, HapticKind.TICK); showChats = true })
            Spacer(Modifier.width(6.dp))
            CircleIconButton(Icons.Filled.AddComment, "محادثة جديدة", { haptic(view, HapticKind.TICK); app.agent.newChat() }, enabled = items.isNotEmpty() && !running)
            Spacer(Modifier.width(6.dp))
            CircleIconButton(Icons.Filled.DeleteSweep, "مسح", { haptic(view, HapticKind.TICK); app.agent.clear() }, enabled = items.isNotEmpty() || running)
        }

        // ---- conversation
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth(), state = listState,
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (empty) item(key = "hero") { EmptyHero(orbState, robotAction, shotKey) { input = it } }
            items(rows, key = { it.key }) { r ->
                Box(Modifier.animateItem()) {
                    when (r) {
                        is Row_.Msg -> MessageRow(r.item)
                        is Row_.Tool -> ToolChip(r.call, r.result, running, approval?.tool)
                    }
                }
            }
            when (val sv = streamView) {
                is StreamView.Answer -> item(key = "stream") { AssistantCard(sv.text, streamingCursor = true) }
                // The model is writing a tool call: show a HUD chip instead of raw JSON.
                is StreamView.Tool -> item(key = "stream-tool") {
                    ToolChip(ChatItem(-1L, ItemKind.TOOL_CALL, sv.argsPreview, sv.tool.ifEmpty { "…" }), null, running, null, drafting = true)
                }
                StreamView.Pending -> {}
            }
            if (showThinking) item(key = "thinking") { ThinkingCard() }
        }

        if (showChats) ChatsDialog(app, running) { showChats = false }

        // ---- live plan checklist
        val plan by app.agent.plan.collectAsState()
        AnimatedVisibility(plan != null, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            plan?.let { PlanCard(it, running) }
        }

        // ---- input capsule
        val voiceCtx = androidx.compose.ui.platform.LocalContext.current
        val voiceLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
            androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()
        ) { r ->
            val said = r.data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            if (r.resultCode == android.app.Activity.RESULT_OK && !said.isNullOrBlank()) {
                haptic(view, HapticKind.CONFIRM, com.wakil.agent.audio.Sound.SENT)
                app.agent.send(said.trim(), fromVoice = true)
            }
        }
        val docCtx = androidx.compose.ui.platform.LocalContext.current
        val docScope = rememberCoroutineScope()
        val docPicker = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.OpenDocument()) { uri ->
            if (uri == null) return@rememberLauncherForActivityResult
            docScope.launch {
                val name = com.wakil.agent.extra.DocReader.nameOf(docCtx, uri)
                val r = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { runCatching { com.wakil.agent.extra.DocReader.read(docCtx, uri, 24_000) } }
                r.onSuccess { text ->
                    input = "📄 الملف: $name\n<<<\n$text\n>>>\n\n" + input.ifBlank { "لخّص هذا الملف بالعربي في نقاط." }
                }.onFailure { android.widget.Toast.makeText(docCtx, "تعذّر قراءة الملف: ${it.message}", android.widget.Toast.LENGTH_LONG).show() }
            }
        }
        val focusReq = remember { androidx.compose.ui.focus.FocusRequester() }
        val wantFocus by app.agent.focusInputRequest.collectAsState()
        LaunchedEffect(wantFocus) { if (wantFocus) { kotlinx.coroutines.delay(400); runCatching { focusReq.requestFocus() }; app.agent.focusInputRequest.value = false } }
        val wantVoice by app.agent.voiceChatRequest.collectAsState()
        var voiceChat by remember { mutableStateOf(false) }
        LaunchedEffect(wantVoice) { if (wantVoice) { voiceChat = true; app.agent.voiceChatRequest.value = false } }
        if (voiceChat) VoiceChatOverlay(app) { voiceChat = false }
        InputCapsule(
            value = input, onValueChange = { input = it }, running = running,
            onAttach = { docPicker.launch(arrayOf("*/*")) },
            onTalk = { haptic(view, HapticKind.TICK); voiceChat = true },
            focusRequester = focusReq,
            onMic = {
                haptic(view, HapticKind.TICK)
                try { voiceLauncher.launch(com.wakil.agent.VoiceActivity.recognizerIntent()) }
                catch (e: android.content.ActivityNotFoundException) {
                    android.widget.Toast.makeText(voiceCtx, com.wakil.agent.VoiceActivity.NO_RECOGNIZER, android.widget.Toast.LENGTH_LONG).show()
                }
            },
            onSend = { haptic(view, HapticKind.CONFIRM, com.wakil.agent.audio.Sound.SENT); app.agent.send(input.trim()); input = "" },
            onStop = { haptic(view, HapticKind.REJECT); app.agent.stop() },
        )
    }
    }
}

/** (id of the newest assistant message, nod counter): its avatar gives a tiny nod when a reply lands. */
private val LocalReplyNod = compositionLocalOf { -1L to 0 }

private fun robotAccent(s: OrbState) = when (s) { OrbState.ERROR -> Neon.Red; OrbState.APPROVAL -> Neon.Yellow; OrbState.TOOL -> Neon.Amber; else -> Neon.Cyan }

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EmptyHero(orbState: OrbState, action: RobotAction, actionKey: Int, onPick: (String) -> Unit) {
    val view = LocalView.current
    Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        WakilRobot(
            220.dp,
            mood = when (orbState) { OrbState.THINKING -> RobotMood.THINK; OrbState.TOOL -> RobotMood.TALK; else -> RobotMood.IDLE },
            accent = robotAccent(orbState), action = action, actionKey = actionKey,
        )
        Spacer(Modifier.height(10.dp))
        Text("بماذا أخدمك اليوم؟", style = MaterialTheme.typography.headlineMedium, color = Neon.Text)
        Spacer(Modifier.height(4.dp))
        Text(
            "وكيلك الذكي على جهازك:\nأوامر لينكس، التحكم بالشاشة، والتطبيقات.",
            style = MaterialTheme.typography.bodyMedium, color = Neon.TextDim,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(horizontal = 20.dp)
        )
        Spacer(Modifier.height(22.dp))
        FlowRow(
            Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            SUGGESTIONS.forEachIndexed { i, s ->
                val c = listOf(Neon.Cyan, Neon.Violet, Neon.Blue, Neon.Magenta)[i % 4]
                Row(
                    Modifier.clip(RoundedCornerShape(50)).background(c.copy(alpha = 0.08f))
                        .border(1.dp, Brush.horizontalGradient(listOf(c.copy(alpha = 0.8f), c.copy(alpha = 0.25f))), RoundedCornerShape(50))
                        .clickable { haptic(view, HapticKind.TICK); onPick(s) }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Filled.AutoAwesome, null, tint = c, modifier = Modifier.size(15.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(s, style = MaterialTheme.typography.labelLarge, color = Neon.Text)
                }
            }
        }
    }
}

@Composable
private fun MessageRow(item: ChatItem) {
    when (item.kind) {
        ItemKind.USER -> UserBubble(item.text)
        ItemKind.ASSISTANT -> { val n = LocalReplyNod.current; AssistantCard(item.text, nodKey = if (n.first == item.id) n.second else 0) }
        ItemKind.ERROR -> Row(
            Modifier.fillMaxWidth().glass(RoundedCornerShape(18.dp), Brush.linearGradient(listOf(Neon.Red, Neon.Red.copy(alpha = 0.3f))), Neon.Red.copy(alpha = 0.10f), glow = Neon.Red.copy(alpha = 0.5f), glowRadius = 8.dp)
                .padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(Icons.Filled.ErrorOutline, null, tint = Neon.Red, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            SelectionContainer { Text(item.text, color = Color(0xFFFFC2CC), style = MaterialTheme.typography.bodyMedium) }
        }
        ItemKind.INFO -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text(
                item.text, style = MaterialTheme.typography.labelMedium, color = Neon.TextDim,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.05f))
                    .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 6.dp)
            )
        }
        else -> AssistantCard(item.text)
    }
}

@Composable
private fun UserBubble(text: String) {
    // RTL: CenterStart = right side
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
        val shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 6.dp, bottomEnd = 22.dp)
        Box(
            Modifier.widthIn(max = 320.dp)
                .glass(shape, Neon.borderGradient, Neon.Cyan.copy(alpha = 0.10f), glow = Neon.Cyan.copy(alpha = 0.45f), glowRadius = 8.dp)
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            SelectionContainer { Text(text, color = Neon.Text, style = MaterialTheme.typography.bodyLarge) }
        }
    }
}

@Composable
private fun AssistantCard(text: String, streamingCursor: Boolean = false, nodKey: Int = 0) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Column(
            Modifier.fillMaxWidth(0.94f)
                .glass(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 22.dp, bottomEnd = 6.dp))
                .padding(horizontal = 14.dp, vertical = 11.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                WakilRobot(22.dp, detail = false, animated = false, action = RobotAction.NOD, actionKey = nodKey)
                Spacer(Modifier.width(5.dp))
                Text("وكيل", style = MaterialTheme.typography.labelMedium, color = Neon.Cyan)
                if (streamingCursor) {
                    Spacer(Modifier.width(6.dp))
                    Text("· يكتب", style = MaterialTheme.typography.labelSmall, color = Neon.TextDim)
                }
            }
            Spacer(Modifier.height(4.dp))
            if (streamingCursor) StreamingText(text)
            else SelectionContainer { Text(text, color = Neon.Text, style = MaterialTheme.typography.bodyLarge) }
        }
    }
}

@Composable
private fun StreamingText(text: String) {
    val inf = rememberInfiniteTransition(label = "cursor")
    val a by inf.animateFloat(1f, 0.15f, infiniteRepeatable(tween(520), RepeatMode.Reverse), label = "cursorA")
    val annotated = remember(text) { buildAnnotatedString { append(text); appendInlineContent("cursor", "▍") } }
    val inline = remember {
        mapOf("cursor" to InlineTextContent(Placeholder(9.sp, 18.sp, PlaceholderVerticalAlign.TextCenter)) {
            Box(
                Modifier.fillMaxSize().padding(start = 2.dp).graphicsLayer { alpha = a }
                    .drawBehind {
                        drawRect(Neon.Cyan.copy(alpha = 0.35f), topLeft = Offset(-2f, -2f), size = androidx.compose.ui.geometry.Size(size.width + 4f, size.height + 4f))
                        drawRect(Neon.Cyan)
                    }
            )
        })
    }
    Text(annotated, inlineContent = inline, color = Neon.Text, style = MaterialTheme.typography.bodyLarge)
}

@Composable
private fun ThinkingCard() {
    val inf = rememberInfiniteTransition(label = "think")
    val p by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1200, easing = LinearEasing)), label = "thinkP")
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Row(
            Modifier.glass(RoundedCornerShape(50), fill = Color.White.copy(alpha = 0.05f)).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("يفكّر", style = MaterialTheme.typography.labelLarge, color = Neon.Cyan)
            Spacer(Modifier.width(8.dp))
            Canvas(Modifier.size(34.dp, 10.dp)) {
                for (i in 0 until 3) {
                    val ph = ((p - i * 0.18f) % 1f + 1f) % 1f
                    val s = (kotlin.math.sin(ph * Math.PI).toFloat()).coerceAtLeast(0f)
                    drawCircle(Neon.Cyan.copy(alpha = 0.3f + 0.7f * s), radius = 2.5.dp.toPx() + 1.5.dp.toPx() * s, center = Offset(size.width * (0.17f + i * 0.33f), center.y))
                }
            }
        }
    }
}

/* ---------------------------------------------------------------- tool HUD chips */

private fun toolIcon(name: String): ImageVector = when (name) {
    "run_shell" -> Icons.Filled.Terminal
    "sys_shell" -> Icons.Filled.AdminPanelSettings
    "root_shell" -> Icons.Filled.Security
    "write_file" -> Icons.Filled.EditNote
    "read_file" -> Icons.Filled.Description
    "list_apps" -> Icons.Filled.Apps
    "open_app" -> Icons.AutoMirrored.Filled.Launch
    "read_screen" -> Icons.Filled.Visibility
    "tap_text", "tap_xy" -> Icons.Filled.TouchApp
    "type_text" -> Icons.Filled.Keyboard
    "scroll" -> Icons.Filled.SwapVert
    "back" -> Icons.AutoMirrored.Filled.ArrowBack
    "home" -> Icons.Filled.Home
    else -> Icons.Filled.Extension
}

private enum class ToolStatus(val label: String, val color: Color) {
    DRAFT("يجهّز الأمر", Neon.Cyan), RUNNING("قيد التنفيذ", Neon.Amber), WAITING("بانتظار إذنك", Neon.Yellow), DONE("تم", Neon.Green),
    FAILED("خطأ", Neon.Red), DENIED("مرفوض", Neon.Red), STOPPED("متوقف", Neon.TextDim)
}

@Composable
private fun ToolChip(call: ChatItem?, result: ChatItem?, agentRunning: Boolean, approvalTool: String?, drafting: Boolean = false) {
    val name = call?.title ?: result?.title ?: "?"
    val status = when {
        drafting -> ToolStatus.DRAFT
        result != null -> when {
            result.text.startsWith("DENIED") -> ToolStatus.DENIED
            result.text.startsWith("ERROR") -> ToolStatus.FAILED
            else -> ToolStatus.DONE
        }
        approvalTool == name && agentRunning -> ToolStatus.WAITING
        agentRunning -> ToolStatus.RUNNING
        else -> ToolStatus.STOPPED
    }
    var expanded by remember { mutableStateOf(false) }
    val c = status.color
    val active = status == ToolStatus.RUNNING || status == ToolStatus.WAITING || status == ToolStatus.DRAFT
    val inf = rememberInfiniteTransition(label = "chip")
    val spin by inf.animateFloat(0f, 360f, infiniteRepeatable(tween(1000, easing = LinearEasing)), label = "chipSpin")
    val scan by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "chipScan")
    val shape = RoundedCornerShape(18.dp)

    Column(
        Modifier.fillMaxWidth()
            .glass(shape, Brush.linearGradient(listOf(c.copy(alpha = 0.75f), c.copy(alpha = 0.15f), Color.White.copy(alpha = 0.08f))), Color(0x10FFFFFF),
                glow = if (active) c.copy(alpha = 0.5f) else Color.Transparent, glowRadius = 8.dp)
            .drawBehind {
                if (active) {
                    val x = size.width * scan
                    drawRect(Brush.horizontalGradient(listOf(Color.Transparent, c.copy(alpha = 0.10f), Color.Transparent), x - 120f, x + 120f))
                }
            }
            .clickable { expanded = !expanded }
            .animateContentSize()
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(c.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                Icon(toolIcon(name), null, tint = c, modifier = Modifier.size(17.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(name, fontFamily = JetMono, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Neon.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val preview = call?.text?.let { oneLine(it) } ?: ""
                if (preview.isNotEmpty()) Text(preview, fontFamily = JetMono, fontSize = 11.sp, color = Neon.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.width(8.dp))
            when (status) {
                ToolStatus.RUNNING, ToolStatus.WAITING, ToolStatus.DRAFT -> Canvas(Modifier.size(16.dp).rotate(spin)) {
                    drawArc(c, 0f, 270f, false, style = Stroke(2.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round))
                }
                else -> Icon(
                    when (status) { ToolStatus.DONE -> Icons.Filled.CheckCircle; ToolStatus.STOPPED -> Icons.Filled.PauseCircle; else -> Icons.Filled.Cancel },
                    null, tint = c, modifier = Modifier.size(16.dp)
                )
            }
            Spacer(Modifier.width(5.dp))
            Text(status.label, style = MaterialTheme.typography.labelSmall, color = c)
            Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = Neon.TextDim, modifier = Modifier.size(18.dp))
        }
        if (expanded) {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Column(Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, bottom = 10.dp)) {
                    if (call != null) CodePane("args", call.text, Neon.Cyan)
                    if (result != null) { Spacer(Modifier.height(6.dp)); CodePane("output", result.text, if (status == ToolStatus.DONE) Neon.TermGreen else Color(0xFFFF8A9A)) }
                }
            }
        } else if (result != null) {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Text(
                    result.text.take(300).trim(), style = MonoLtr, fontSize = 11.sp, lineHeight = 15.sp,
                    color = (if (status == ToolStatus.DONE) Neon.TermGreen else Color(0xFFFF8A9A)).copy(alpha = 0.8f),
                    maxLines = 3, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 10.dp)
                )
            }
        }
    }
}

private fun oneLine(s: String) = s.replace(Regex("\\s+"), " ").trim().take(120)

@Composable
private fun CodePane(label: String, text: String, color: Color) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xD9000000))
            .border(1.dp, color.copy(alpha = 0.2f), RoundedCornerShape(12.dp)).padding(10.dp)
    ) {
        Text("› $label", fontFamily = JetMono, fontSize = 10.sp, color = color.copy(alpha = 0.6f))
        SelectionContainer {
            Text(
                text, style = MonoLtr, fontSize = 11.5.sp, lineHeight = 16.sp, color = color,
                modifier = Modifier.heightIn(max = 360.dp).horizontalScroll(rememberScrollState())
            )
        }
    }
}

/* ---------------------------------------------------------------- input */

@Composable
private fun InputCapsule(
    value: String, onValueChange: (String) -> Unit, running: Boolean, onSend: () -> Unit, onStop: () -> Unit, onMic: () -> Unit = {},
    onAttach: () -> Unit = {}, onTalk: () -> Unit = {}, focusRequester: androidx.compose.ui.focus.FocusRequester? = null,
) {
    val canSend = value.isNotBlank()
    var focused by remember { mutableStateOf(false) }
    val edge by animateColorAsState(if (focused) Neon.Cyan else Color.White.copy(alpha = 0.18f), label = "capEdge")
    val shape = RoundedCornerShape(30.dp)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .glass(shape, Brush.linearGradient(listOf(edge, Neon.Violet.copy(alpha = 0.35f), edge.copy(alpha = 0.5f))), Color(0xB30A0F1A),
                glow = if (focused) Neon.Cyan.copy(alpha = 0.4f) else Color.Transparent, glowRadius = 10.dp)
            .padding(start = 6.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Voice input: Android speech recognizer, the reply is read aloud.
        Box(Modifier.size(38.dp).clip(CircleShape).clickable(enabled = !running, onClick = onMic), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Mic, "تكلّم", tint = if (running) Neon.TextFaint.copy(alpha = 0.5f) else Neon.Cyan, modifier = Modifier.size(22.dp))
        }
        // Hands-free voice conversation
        Box(Modifier.size(34.dp).clip(CircleShape).clickable(enabled = !running, onClick = onTalk), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.GraphicEq, "محادثة صوتية", tint = if (running) Neon.TextFaint.copy(alpha = 0.5f) else Neon.Violet, modifier = Modifier.size(20.dp))
        }
        // Attach a document (PDF, Word…) for the agent to read
        Box(Modifier.size(34.dp).clip(CircleShape).clickable(enabled = !running, onClick = onAttach), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.AttachFile, "إرفاق ملف", tint = if (running) Neon.TextFaint.copy(alpha = 0.5f) else Neon.TextDim, modifier = Modifier.size(20.dp))
        }
        Box(Modifier.weight(1f).padding(horizontal = 4.dp, vertical = 8.dp), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) Text("اكتب مهمتك…", style = MaterialTheme.typography.bodyLarge, color = Neon.TextFaint)
            BasicTextField(
                value = value, onValueChange = onValueChange, maxLines = 5,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = Neon.Text),
                cursorBrush = SolidColor(Neon.Cyan),
                modifier = Modifier.fillMaxWidth().then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier).onFocusChanged { focused = it.isFocused }
            )
        }
        if (running) SendOrb(Icons.Filled.Stop, "إيقاف", listOf(Neon.Red, Color(0xFFFF7A45)), pulsing = true, onClick = onStop)
        else SendOrb(Icons.AutoMirrored.Filled.Send, "إرسال", listOf(Neon.Cyan, Neon.Blue, Neon.Violet), pulsing = canSend, enabled = canSend, onClick = onSend)
    }
}


@Composable
private fun SendOrb(icon: ImageVector, desc: String, colors: List<Color>, pulsing: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    val inf = rememberInfiniteTransition(label = "send")
    val p by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(1500, easing = LinearOutSlowInEasing)), label = "sendP")
    val scale by animateFloatAsState(if (enabled) 1f else 0.9f, spring(dampingRatio = 0.5f), label = "sendS")
    Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
        if (pulsing && enabled) Canvas(Modifier.fillMaxSize()) {
            val r = size.minDimension / 2
            drawCircle(colors.first().copy(alpha = 0.5f * (1f - p)), radius = r * (0.75f + 0.45f * p), style = Stroke(2.dp.toPx()))
            drawCircle(colors.first().copy(alpha = 0.25f), radius = r)
        }
        Box(
            Modifier.size(42.dp).graphicsLayer { scaleX = scale; scaleY = scale }.clip(CircleShape)
                .background(if (enabled) Brush.linearGradient(colors) else Brush.linearGradient(listOf(Color(0xFF1C2433), Color(0xFF131A26))))
                .clickable(enabled = enabled, onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, desc, tint = if (enabled) Color(0xFF00121A) else Neon.TextFaint, modifier = Modifier.size(20.dp))
        }
    }
}



/** The agent's step-by-step plan, ticked off as it works. */
@Composable
fun PlanCard(plan: com.wakil.agent.agent.AgentPlan, running: Boolean) {
    var open by remember { mutableStateOf(true) }
    val done = plan.current.coerceAtMost(plan.steps.size)
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0xCC0B1120))
            .border(1.dp, Neon.Violet.copy(alpha = 0.45f), RoundedCornerShape(18.dp))
            .clickable { open = !open }
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Checklist, null, tint = Neon.Violet, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("خطة المهمة", color = Neon.Text, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Text("$done/${plan.steps.size}", color = Neon.Violet, fontFamily = JetMono, fontSize = 12.sp)
            Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = Neon.TextDim)
        }
        Spacer(Modifier.height(6.dp))
        androidx.compose.material3.LinearProgressIndicator(
            progress = { if (plan.steps.isEmpty()) 0f else done / plan.steps.size.toFloat() },
            modifier = Modifier.fillMaxWidth().height(3.dp).clip(CircleShape),
            color = Neon.Violet, trackColor = Color.White.copy(alpha = 0.08f),
        )
        if (open) {
            Spacer(Modifier.height(6.dp))
            plan.steps.forEachIndexed { i, step ->
                val st = when { i < done -> 0; i == done && running -> 1; else -> 2 }
                Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    when (st) {
                        0 -> Icon(Icons.Filled.CheckCircle, null, tint = Neon.Green, modifier = Modifier.size(16.dp))
                        1 -> PulseDot(Neon.Cyan, size = 10.dp)
                        else -> Icon(Icons.Filled.RadioButtonUnchecked, null, tint = Neon.TextFaint, modifier = Modifier.size(16.dp))
                    }
                    Spacer(Modifier.width(8.dp))
                    Text(step, style = MaterialTheme.typography.bodySmall,
                        color = when (st) { 0 -> Neon.TextDim; 1 -> Neon.Text; else -> Neon.TextFaint }, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}


/** Saved conversations: open one, delete one, or start a new one. */
@Composable
fun ChatsDialog(app: WakilApp, running: Boolean, onClose: () -> Unit) {
    val chats by app.agent.chats.collectAsState()
    val fmt = remember { java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US) }
    androidx.compose.ui.window.Dialog(onDismissRequest = onClose) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = 560.dp).clip(RoundedCornerShape(24.dp)).background(Color(0xF20B1120))
                .border(1.dp, Neon.Cyan.copy(alpha = 0.35f), RoundedCornerShape(24.dp)).padding(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.History, null, tint = Neon.Cyan)
                Spacer(Modifier.width(8.dp))
                Text("المحادثات", style = MaterialTheme.typography.titleMedium, color = Neon.Text, modifier = Modifier.weight(1f))
                Text("${chats.size}", color = Neon.TextDim, fontFamily = JetMono, fontSize = 12.sp)
            }
            Spacer(Modifier.height(10.dp))
            GhostButton("محادثة جديدة", { app.agent.newChat(); onClose() }, Modifier.fillMaxWidth(), enabled = !running, icon = Icons.Filled.AddComment)
            Spacer(Modifier.height(8.dp))
            if (chats.isEmpty()) Text("لا توجد محادثات محفوظة بعد.", color = Neon.TextDim, style = MaterialTheme.typography.bodySmall)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(chats, key = { it.id }) { c ->
                    val current = c.id == app.agent.currentChatId
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                            .background(if (current) Neon.Cyan.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.03f))
                            .clickable(enabled = !running) { app.agent.openChat(c.id); onClose() }
                            .padding(start = 12.dp, top = 8.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(c.title, color = Neon.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(fmt.format(java.util.Date(c.updated)) + if (current) " · الحالية" else "", color = Neon.TextDim, fontSize = 11.sp)
                        }
                        androidx.compose.material3.IconButton(onClick = { app.agent.deleteChat(c.id) }, enabled = !running || !current) {
                            Icon(Icons.Filled.Close, "حذف", tint = Neon.TextFaint)
                        }
                    }
                }
            }
        }
        }
    }
}


/** Full-screen hands-free conversation: the robot listens, the agent answers aloud, then it listens again. */
@Composable
private fun VoiceChatOverlay(app: WakilApp, onClose: () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var granted by remember { mutableStateOf(ctx.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) }
    val askMic = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok; if (!ok) onClose()
    }
    LaunchedEffect(Unit) { if (!granted) askMic.launch(android.Manifest.permission.RECORD_AUDIO) }
    if (!granted) return
    val loop = remember { com.wakil.agent.audio.VoiceLoop(ctx).apply {
        onGiveUp = { why -> android.widget.Toast.makeText(ctx, why, android.widget.Toast.LENGTH_LONG).show(); onClose() }
    } }
    DisposableEffect(Unit) {
        val wakeWasOn = com.wakil.agent.audio.WakeService.running
        if (wakeWasOn) com.wakil.agent.audio.WakeService.stop(ctx)
        if (loop.available()) loop.start()
        onDispose {
            loop.stop(); com.wakil.agent.audio.Speech.stop()
            if (wakeWasOn && app.prefs.wakeWord) com.wakil.agent.audio.WakeService.start(ctx)
        }
    }
    val phase by loop.phase.collectAsState()
    val heard by loop.partial.collectAsState()
    val lvl by loop.level.collectAsState()
    val items by app.agent.items.collectAsState()
    val lastReply = items.lastOrNull { it.kind == ItemKind.ASSISTANT }?.text.orEmpty()
    androidx.compose.ui.window.Dialog(onDismissRequest = onClose, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xF205070D), Color(0xF20B1530)))).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
        ) {
            if (!loop.available()) {
                Text(com.wakil.agent.VoiceActivity.NO_RECOGNIZER, color = Neon.Red, style = MaterialTheme.typography.bodyLarge)
            }
            val mood = when (phase) { com.wakil.agent.audio.VoicePhase.THINKING -> RobotMood.THINK; com.wakil.agent.audio.VoicePhase.SPEAKING -> RobotMood.TALK; else -> RobotMood.IDLE }
            Box(contentAlignment = Alignment.Center) {
                val ring by animateFloatAsState(if (phase == com.wakil.agent.audio.VoicePhase.LISTENING) 1f + lvl * 0.25f else 1f, label = "vring")
                Box(Modifier.size(240.dp).graphicsLayer { scaleX = ring; scaleY = ring }.clip(CircleShape)
                    .background(Brush.radialGradient(listOf(Neon.Cyan.copy(alpha = 0.22f), Color.Transparent))))
                WakilRobot(200.dp, mood = mood)
            }
            Spacer(Modifier.height(18.dp))
            Text(
                when (phase) {
                    com.wakil.agent.audio.VoicePhase.LISTENING -> "أسمعك… تكلّم"
                    com.wakil.agent.audio.VoicePhase.HEARD -> "فهمت…"
                    com.wakil.agent.audio.VoicePhase.THINKING -> "أفكّر وأنفّذ…"
                    com.wakil.agent.audio.VoicePhase.SPEAKING -> "أرد عليك…"
                    com.wakil.agent.audio.VoicePhase.OFF -> "متوقف"
                }, style = MaterialTheme.typography.titleLarge, color = Neon.Cyan
            )
            Spacer(Modifier.height(10.dp))
            if (heard.isNotBlank()) Text("«$heard»", style = MaterialTheme.typography.bodyLarge, color = Neon.Text, maxLines = 3)
            if (phase == com.wakil.agent.audio.VoicePhase.SPEAKING && lastReply.isNotBlank())
                Text(com.wakil.agent.audio.Speech.clean(lastReply).take(220), style = MaterialTheme.typography.bodyMedium, color = Neon.TextDim, maxLines = 5, modifier = Modifier.padding(top = 8.dp))
            Spacer(Modifier.height(28.dp))
            Text("قل «توقف» لإنهاء المحادثة", style = MaterialTheme.typography.bodySmall, color = Neon.TextFaint)
            Spacer(Modifier.height(10.dp))
            GhostButton("إنهاء المحادثة الصوتية", { app.agent.stop(); onClose() }, color = Neon.Red, icon = Icons.Filled.Close)
        }
    }
    LaunchedEffect(phase) {
        if (phase == com.wakil.agent.audio.VoicePhase.OFF && loop.available()) {
            kotlinx.coroutines.delay(800)
            if (loop.phase.value == com.wakil.agent.audio.VoicePhase.OFF) onClose() // user said «توقف»
        }
    }
}
