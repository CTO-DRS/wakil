package com.wakil.agent.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.DeveloperBoard
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wakil.agent.WakilApp
import com.wakil.agent.env.EnvState
import com.wakil.agent.env.PtySession
import com.wakil.agent.env.PtyText
import com.wakil.agent.service.AgentForegroundService
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.MonoLtr
import com.wakil.agent.ui.theme.Neon
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Terminal session state kept across tab switches. */
object TerminalSession {
    val log = MutableStateFlow("")
    val running = MutableStateFlow(false)
    var cwd = "/root"
    @Volatile var process: Process? = null
    private const val MARK = "\u0001WAKILCWD:"
    private const val APK_MARK = "\u0001WAKIL_APK:"
    /** Last APK a `wakil-apk build` produced (guest path); the screen shows an Install button for it. */
    val lastApk = MutableStateFlow<String?>(null)
    private const val MAX = 200_000

    private fun append(raw: String) {
        var s = raw
        if (s.contains(APK_MARK)) {
            s = s.lines().filter { l ->
                if (l.startsWith(APK_MARK)) { lastApk.value = l.removePrefix(APK_MARK).trim(); false } else true
            }.joinToString("\n")
        }
        val v = log.value + s
        log.value = if (v.length > MAX) v.takeLast(MAX) else v
    }

    fun run(app: WakilApp, cmd: String) {
        if (running.value || cmd.isBlank()) return
        if (cmd.trim() == "clear") { log.value = ""; return }
        append("\n${cwd}# $cmd\n")
        running.value = true
        app.appScope.launch {
            AgentForegroundService.acquire(app, "الطرفية: $cmd")
            try {
                val wrapped = "$cmd\n__rc=\$?; printf '\\n${MARK}%s\\n' \"\$(pwd)\"; exit \$__rc"
                val pending = StringBuilder()
                val r = app.env.run(wrapped, timeoutSec = 3600, limit = 400_000, cwd = cwd,
                    onStart = { process = it },
                    onOutput = { chunk ->
                        synchronized(pending) {
                            pending.append(chunk)
                            val idx = pending.indexOf(MARK)
                            if (idx < 0) {
                                // keep a short tail in case the marker is split across chunks
                                val safe = (pending.length - MARK.length).coerceAtLeast(0)
                                append(pending.substring(0, safe)); pending.delete(0, safe)
                            }
                        }
                    })
                synchronized(pending) {
                    val idx = pending.indexOf(MARK)
                    if (idx >= 0) {
                        append(pending.substring(0, idx).trimEnd('\n'))
                        val newCwd = pending.substring(idx + MARK.length).lineSequence().firstOrNull()?.trim()
                        if (!newCwd.isNullOrBlank()) cwd = newCwd
                    } else append(pending.toString())
                }
                if (r.timedOut) append("\n[انتهت المهلة]")
                else if (r.exitCode != 0) append("\n[exit ${r.exitCode}]")
                if (r.exitCode == -1 && !r.timedOut) append("\n" + r.output)
            } catch (e: Exception) {
                append("\nERROR: $e")
            } finally {
                // a marker split across output chunks is caught here
                val i = log.value.indexOf(APK_MARK)
                if (i >= 0) {
                    val end = log.value.indexOf('\n', i).let { if (it < 0) log.value.length else it }
                    lastApk.value = log.value.substring(i + APK_MARK.length, end).trim()
                    log.value = log.value.removeRange(i, end)
                }
                process = null
                running.value = false
                AgentForegroundService.release(app)
            }
        }
    }

    fun kill() { process?.destroy(); process?.destroyForcibly() }

    /** Sends a line to the program that is running now (python, a y/n prompt, a REPL…). */
    fun sendInput(line: String) {
        val p = process ?: return
        append(line + "\n")
        runCatching { p.outputStream.write((line + "\n").toByteArray()); p.outputStream.flush() }
    }

    /** Ctrl+D: closes the program's input (ends a REPL or `cat`). */
    fun endInput() { runCatching { process?.outputStream?.close() } }

    // command history (↑ / ↓)
    val history = mutableListOf<String>()
    private var hIdx = -1
    fun remember(cmd: String) { if (cmd.isNotBlank() && history.lastOrNull() != cmd) history += cmd; if (history.size > 200) history.removeAt(0); hIdx = -1 }
    fun prev(): String? { if (history.isEmpty()) return null; hIdx = if (hIdx < 0) history.lastIndex else (hIdx - 1).coerceAtLeast(0); return history[hIdx] }
    fun next(): String? { if (hIdx < 0) return null; hIdx++; if (hIdx > history.lastIndex) { hIdx = -1; return "" }; return history[hIdx] }
}


private val PROMPT_RE = Regex("^(/[^#\n]*)# (.*)$")
private val ERR_RE = Regex("(?i)(\\berror\\b|\\bfatal\\b|\\bfailed\\b|permission denied|not found|no such file|\\bERROR:)")
private val WARN_RE = Regex("(?i)\\bwarn(ing)?\\b")

private fun shortPath(p: String) = when {
    p == "/root" -> "~"
    p.startsWith("/root/") -> "~" + p.substring(5)
    else -> p
}

/** Colorizes the terminal log for display only (prompt lines, errors, warnings, stdout). */
private fun colorize(log: String): AnnotatedString = buildAnnotatedString {
    val lines = log.split('\n')
    lines.forEachIndexed { i, line ->
        if (i > 0) append('\n')
        val m = PROMPT_RE.matchEntire(line)
        when {
            m != null -> {
                withStyle(SpanStyle(color = Neon.Green, fontWeight = FontWeight.Bold)) { append("root@wakil") }
                withStyle(SpanStyle(color = Neon.TextDim)) { append(":") }
                withStyle(SpanStyle(color = Neon.Cyan, fontWeight = FontWeight.Bold)) { append(shortPath(m.groupValues[1])) }
                withStyle(SpanStyle(color = Neon.TextDim)) { append("# ") }
                withStyle(SpanStyle(color = Color.White, fontWeight = FontWeight.Bold)) { append(m.groupValues[2]) }
            }
            line.startsWith("[exit") || line.startsWith("ERROR") || line.startsWith("[انتهت") ->
                withStyle(SpanStyle(color = Neon.Red, fontWeight = FontWeight.Bold)) { append(line) }
            WARN_RE.containsMatchIn(line) -> withStyle(SpanStyle(color = Neon.Amber)) { append(line) }
            ERR_RE.containsMatchIn(line) -> withStyle(SpanStyle(color = Color(0xFFFF7C8E))) { append(line) }
            else -> withStyle(SpanStyle(color = Neon.TermGreen)) { append(line) }
        }
    }
}

@Composable
fun TerminalScreen(app: WakilApp) {
    val envState by app.env.state.collectAsState()
    val log by TerminalSession.log.collectAsState()
    val running by TerminalSession.running.collectAsState()
    // interactive PTY mode: a persistent login shell with a real terminal
    var ptyMode by remember { mutableStateOf(false) }
    val ptyRunning by PtySession.running.collectAsState()
    val ptyLog by PtySession.log.collectAsState()
    var termSize by remember { mutableStateOf(IntSize.Zero) }
    var ptyRows by remember { mutableStateOf(30) }
    var ptyCols by remember { mutableStateOf(100) }
    val measurer = rememberTextMeasurer()
    var field by remember { mutableStateOf(TextFieldValue("")) }
    val cmd = field.text
    val scroll = rememberScrollState()
    val view = LocalView.current
    LaunchedEffect(log.length) { scroll.scrollTo(scroll.maxValue) }
    LaunchedEffect(ptyLog.length) { scroll.scrollTo(scroll.maxValue) }
    // keep the PTY window size in sync with the on-screen box (full-screen apps redraw)
    LaunchedEffect(termSize) {
        if (termSize == IntSize.Zero) return@LaunchedEffect
        val cw = measurer.measure("M", TextStyle(fontFamily = JetMono, fontSize = 12.sp)).size.width.coerceAtLeast(1)
        val lh = measurer.measure("Mg", TextStyle(fontFamily = JetMono, fontSize = 12.sp, lineHeight = 17.sp)).size.height.coerceAtLeast(1)
        ptyRows = (termSize.height / lh).coerceIn(5, 60)
        ptyCols = (termSize.width / cw).coerceIn(20, 200)
        PtySession.resize(ptyRows, ptyCols)
    }
    // Correct usage: the producer re-runs and re-assigns `value` whenever `log` changes.
    // The lint rule misfires on this shape — known false positive (Google issuetracker 349411310).
    @Suppress("ProduceStateDoesNotAssignValue")
    val colored by produceState(AnnotatedString(""), log) {
        val rendered = withContext(Dispatchers.Default) { colorize(log) }
        value = rendered
    }
    val ready = envState == EnvState.Ready
    val ptyActive = ptyMode && ptyRunning
    fun startPty() {
        haptic(view, HapticKind.CONFIRM)
        PtySession.start(app, app.env, ptyRows, ptyCols)
    }
    fun submit() {
        if (ptyMode) {
            if (ptyRunning) { haptic(view, HapticKind.TICK); PtySession.send(field.text + "\n") }
            else if (ready) startPty()
            field = TextFieldValue(""); return
        }
        if (running) { haptic(view, HapticKind.TICK); TerminalSession.sendInput(cmd); field = TextFieldValue(""); return }
        if (cmd.isNotBlank()) haptic(view, HapticKind.CONFIRM)
        TerminalSession.remember(cmd.trim())
        TerminalSession.run(app, cmd); field = TextFieldValue("")
    }
    fun setField(t: String) { field = TextFieldValue(t, TextRange(t.length)) }

    Column(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
        ScreenHeader("الطرفية", subtitle = "Alpine Linux · proot")
        Spacer(Modifier.height(6.dp))
        EnvCard(app, envState, if (ptyActive) running || ptyRunning else running,
            onClear = { if (ptyMode) PtySession.clear() else TerminalSession.log.value = "" })
        Spacer(Modifier.height(8.dp))
        if (ready) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ModeChip("أوامر", !ptyMode, Neon.Green) { ptyMode = false }
                ModeChip("تفاعلية PTY", ptyMode, Neon.Cyan) {
                    ptyMode = true
                    if (!PtySession.running.value) startPty()
                }
                if (ptyMode && PtySession.available) {
                    Text(
                        if (ptyRunning) "shell حقيقي: vim و python و y/n تعمل" else "اضغط لبدء جلسة",
                        style = MaterialTheme.typography.labelSmall, color = Neon.TextDim, modifier = Modifier.weight(1f).align(Alignment.CenterVertically)
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))

        // Terminal output is always LTR.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            val shape = RoundedCornerShape(22.dp)
            Column(
                Modifier.weight(1f).fillMaxWidth().onSizeChanged { termSize = it }
                    .glass(shape, Brush.linearGradient(listOf(Neon.Green.copy(alpha = 0.55f), Neon.Cyan.copy(alpha = 0.15f), Neon.Green.copy(alpha = 0.3f))),
                        Color(0xE6000604), glow = Neon.Green.copy(alpha = 0.25f), glowRadius = 8.dp)
            ) {
                // window bar
                Row(Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.03f)).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    listOf(Neon.Red, Neon.Amber, Neon.Green).forEach { Box(Modifier.padding(end = 6.dp).size(9.dp).clip(CircleShape).background(it.copy(alpha = 0.85f))) }
                    Spacer(Modifier.width(8.dp))
                    Text(if (ptyActive) "wakil:~ · pty" else "root@wakil: ${shortPath(TerminalSession.cwd)}", fontFamily = JetMono, fontSize = 11.sp, color = Neon.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (ptyActive) Text("● PTY", fontFamily = JetMono, fontSize = 10.sp, color = Neon.Cyan)
                    else if (running) Text("● LIVE", fontFamily = JetMono, fontSize = 10.sp, color = Neon.Amber)
                }
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    val viewLog = if (ptyMode) ptyLog else log
                    val viewEmpty = if (ptyMode) "# الطرفية التفاعلية: جلسة shell كاملة داخل لينكس\n# مثال: python3 · vim · ssh · apk add …" else "# جرّب: apk update && apk add python3 nodejs npm git nmap"
                    SelectionContainer {
                        Text(
                            if (viewLog.isEmpty()) AnnotatedString(viewEmpty) else if (ptyMode) AnnotatedString(ptyLog) else colored,
                            color = if (viewLog.isEmpty()) Neon.TermGreen.copy(alpha = 0.45f) else Neon.TermGreen,
                            style = MonoLtr, fontSize = 12.sp, lineHeight = 17.sp,
                            modifier = Modifier.fillMaxSize().verticalScroll(scroll).horizontalScroll(rememberScrollState()).padding(12.dp)
                        )
                    }
                    Scanlines(Modifier.matchParentSize())
                }
                // prompt line (APK install shortcut — command mode only)
                val apk by TerminalSession.lastApk.collectAsState()
                if (!ptyMode) apk?.let { path ->
                    val ictx = androidx.compose.ui.platform.LocalContext.current
                    Row(
                        Modifier.fillMaxWidth().background(Neon.Green.copy(alpha = 0.08f)).padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("📦 ${path.substringAfterLast('/')}", fontFamily = JetMono, fontSize = 12.sp, color = Neon.Green, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        GlowButton("تثبيت", {
                            haptic(view, HapticKind.CONFIRM)
                            com.wakil.agent.env.ApkInstaller.install(ictx, app.env.hostFile(path))?.let {
                                android.widget.Toast.makeText(ictx, it, android.widget.Toast.LENGTH_LONG).show()
                            }
                        })
                        Spacer(Modifier.width(6.dp))
                        GhostButton("✕", { TerminalSession.lastApk.value = null })
                    }
                }
                QuickKeys(
                    running = if (ptyMode) ptyRunning else running, enabled = ready,
                    onKey = { k ->
                        haptic(view, HapticKind.TICK)
                        when (k) {
                            "^C" -> if (ptyMode) PtySession.sendKey("^C") else TerminalSession.kill()
                            "^D" -> if (ptyMode) PtySession.sendKey("^D") else TerminalSession.endInput()
                            "↑" -> if (ptyMode) PtySession.sendKey("↑") else TerminalSession.prev()?.let { setField(it) }
                            "↓" -> if (ptyMode) PtySession.sendKey("↓") else TerminalSession.next()?.let { setField(it) }
                            "Tab", "Esc" -> if (ptyMode) PtySession.sendKey(k) else setField(cmd + PtyText.keySeq(k))
                            else -> setField(cmd + k)
                        }
                    }
                )
                PromptInput(
                    field, { field = it }, ready, if (ptyMode) ptyRunning else running,
                    prompt = if (ptyMode) "wakil:~#" else if (running) "›" else "root@wakil:${shortPath(TerminalSession.cwd)}#",
                    onSubmit = { submit() },
                    onKill = { haptic(view, HapticKind.REJECT); if (ptyMode) PtySession.kill() else TerminalSession.kill() }
                )
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

/** Extra keys a phone keyboard lacks: Ctrl+C, Ctrl+D, history and common symbols. */
@Composable
private fun QuickKeys(running: Boolean, enabled: Boolean, onKey: (String) -> Unit) {
    val keys = listOf("^C", "^D", "↑", "↓", "Tab", "Esc", "|", "/", "-", "~", "&&", ">", "\"")
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        keys.forEach { k ->
            val ctrl = k.startsWith("^")
            val on = enabled && (!ctrl || running)
            Box(
                Modifier.clip(RoundedCornerShape(10.dp))
                    .background(if (ctrl) Neon.Red.copy(alpha = if (on) 0.14f else 0.05f) else Color.White.copy(alpha = 0.05f))
                    .border(1.dp, (if (ctrl) Neon.Red else Neon.Green).copy(alpha = if (on) 0.35f else 0.1f), RoundedCornerShape(10.dp))
                    .then(if (on) Modifier.clickable { onKey(k) } else Modifier)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) { Text(k, fontFamily = JetMono, fontSize = 12.sp, color = if (on) (if (ctrl) Neon.Red else Neon.Green) else Neon.TextFaint) }
        }
    }
}

/** Mode selector for the terminal: plain command mode or a real interactive PTY shell. */
@Composable
private fun ModeChip(label: String, selected: Boolean, accent: Color, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(12.dp))
            .background(if (selected) accent.copy(alpha = 0.16f) else Color.White.copy(alpha = 0.05f))
            .border(1.dp, accent.copy(alpha = if (selected) 0.5f else 0.15f), RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 7.dp)
    ) {
        Text(label, fontSize = 13.sp, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, color = if (selected) accent else Neon.TextDim)
    }
}

@Composable
private fun EnvCard(app: WakilApp, envState: EnvState, running: Boolean, onClear: () -> Unit) {
    when (val s = envState) {
        EnvState.NotInstalled, is EnvState.Error -> GlassCard(Modifier.fillMaxWidth(), glow = Neon.Cyan.copy(alpha = 0.3f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.DeveloperBoard, null, tint = Neon.Cyan, modifier = Modifier.size(28.dp))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("بيئة لينكس (Alpine) غير مهيأة بعد.", style = MaterialTheme.typography.titleSmall, color = Neon.Text)
                    Text("سيتم تنزيل نحو 4 ميغابايت ثم فكّها. بعدها يمكنك تثبيت الحزم بـ \u2066apk add\u2069.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                }
            }
            if (s is EnvState.Error) Text("خطأ: ${s.message}", color = Neon.Red, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
            Spacer(Modifier.height(12.dp))
            GlowButton("تهيئة البيئة", { app.env.install() }, Modifier.fillMaxWidth(), icon = Icons.Filled.RocketLaunch)
        }
        is EnvState.Installing -> GlassCard(Modifier.fillMaxWidth(), glow = Neon.Cyan.copy(alpha = 0.35f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val pr = if (s.progress >= 0) s.progress.coerceIn(0f, 1f) else null
                ProgressRing(pr, size = 58.dp, stroke = 4.dp) {
                    Text(if (pr != null) "${(pr * 100).toInt()}%" else "…", fontFamily = JetMono, fontSize = 12.sp, color = Neon.Cyan)
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text("جارٍ تهيئة البيئة", style = MaterialTheme.typography.titleSmall, color = Neon.Text)
                    Text(s.step, style = MaterialTheme.typography.bodySmall, color = Neon.TextDim, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        EnvState.Ready -> Row(
            Modifier.fillMaxWidth().glass(RoundedCornerShape(20.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            PulseDot(Neon.Green, size = 8.dp)
            Spacer(Modifier.width(6.dp))
            Column(Modifier.weight(1f)) {
                Text("بيئة Alpine Linux جاهزة", style = MaterialTheme.typography.titleSmall, color = Neon.Text)
                Text("أنت root (وهمي عبر proot)", style = MaterialTheme.typography.labelSmall, color = Neon.TextDim)
            }
            if (running) { Badge("يعمل", Neon.Amber); Spacer(Modifier.width(8.dp)) }
            GhostButton("مسح", onClear, icon = Icons.Filled.CleaningServices)
        }
    }
}

@Composable
private fun Scanlines(modifier: Modifier) {
    // static scanlines (drawn once) + a slowly moving bright band (draw-phase animation)
    Canvas(modifier) {
        val gap = 3.dp.toPx()
        var y = 0f
        while (y < size.height) { drawLine(Color.Black.copy(alpha = 0.22f), Offset(0f, y), Offset(size.width, y), 1f); y += gap }
    }
    val inf = rememberInfiniteTransition(label = "scan")
    val p by inf.animateFloat(-0.2f, 1.2f, infiniteRepeatable(tween(5200, easing = LinearEasing)), label = "scanP")
    Canvas(modifier) {
        val y = size.height * p
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Neon.Green.copy(alpha = 0.06f), Color.Transparent), y - 60f, y + 60f))
    }
}

@Composable
private fun PromptInput(
    value: TextFieldValue, onChange: (TextFieldValue) -> Unit, enabled: Boolean, running: Boolean,
    prompt: String, onSubmit: () -> Unit, onKill: () -> Unit,
) {
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    var focused by remember { mutableStateOf(false) }
    val inf = rememberInfiniteTransition(label = "blk")
    val blink by inf.animateFloat(1f, 0f, infiniteRepeatable(tween(530, easing = { if (it < 0.5f) 0f else 1f }), RepeatMode.Restart), label = "blkA")
    Row(
        Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.035f))
            .drawBehind { drawLine(Neon.Green.copy(alpha = 0.25f), Offset(0f, 0f), Offset(size.width, 0f), 1f) }
            .padding(start = 12.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(prompt, fontFamily = JetMono, fontSize = 13.sp, color = Neon.Green, fontWeight = FontWeight.Bold, maxLines = 1)
        Spacer(Modifier.width(6.dp))
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            if (value.text.isEmpty() && !focused) Text(if (!enabled) "—" else if (running) "إدخال للبرنامج…" else "command", fontFamily = JetMono, fontSize = 13.sp, color = Neon.TextFaint)
            BasicTextField(
                value = value, onValueChange = onChange, enabled = enabled, singleLine = true,
                textStyle = TextStyle(fontFamily = JetMono, fontSize = 13.sp, color = Color.White),
                cursorBrush = SolidColor(Color.Transparent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSubmit() }),
                onTextLayout = { layout = it },
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }
                    .drawBehind {
                        // blinking block cursor
                        val l = layout ?: return@drawBehind
                        if (!focused || !enabled) return@drawBehind
                        val off = value.selection.start.coerceIn(0, value.text.length)
                        val r = l.getCursorRect(off)
                        val w = 8.dp.toPx()
                        drawRect(Neon.Green.copy(alpha = 0.85f * blink), topLeft = Offset(r.left, r.top), size = androidx.compose.ui.geometry.Size(w, r.height))
                    }
            )
        }
        Spacer(Modifier.width(6.dp))
        if (running) {
            if (value.text.isNotEmpty()) { CircleIconButton(Icons.Filled.PlayArrow, "إرسال للبرنامج", onSubmit, tint = Neon.Amber, size = 38.dp); Spacer(Modifier.width(4.dp)) }
            CircleIconButton(Icons.Filled.Stop, "إيقاف", onKill, tint = Neon.Red, size = 38.dp)
        }
        else CircleIconButton(Icons.Filled.PlayArrow, "تشغيل", onSubmit, tint = Neon.Green, enabled = enabled && value.text.isNotBlank(), size = 38.dp)
    }
}

