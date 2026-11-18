package com.wakil.agent.onboarding

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.wakil.agent.BuildConfig
import com.wakil.agent.WakilApp
import com.wakil.agent.env.EnvState
import com.wakil.agent.llm.LlmState
import com.wakil.agent.llm.ModelManager
import com.wakil.agent.priv.ShizukuShell
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.MonoLtr
import com.wakil.agent.ui.theme.Neon
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val STEP_INTRO = 0
private const val STEP_FEATURES = 1
private const val STEP_PERMS = 2

private data class Feature(val title: String, val body: String, val accent: Color, val mood: RobotMood)

private val FEATURES = listOf(
    Feature("ذكاء خاص على جهازك", "نموذج لغوي يعمل محلياً بالكامل عبر llama.cpp. محادثاتك وملفاتك لا تغادر هاتفك، ويعمل حتى بدون إنترنت.", Neon.Cyan, RobotMood.THINK),
    Feature("بيئة لينكس وطرفية كاملة", "توزيعة Alpine Linux داخل التطبيق: ثبّت الحزم، شغّل بايثون والسكربتات، ودع وكيل ينفّذ الأوامر نيابةً عنك.", Neon.Green, RobotMood.TALK),
    Feature("يتحكّم بالتطبيقات عنك", "يقرأ الشاشة، يفتح التطبيقات، ينقر ويكتب ويمرّر — وكل إجراء حسّاس ينتظر موافقتك أولاً.", Neon.Violet, RobotMood.HAPPY),
)

/**
 * First-run flow: robot intro → feature pager → one screen per permission → ready (model + Linux env).
 * [onFinish] receives the tab to open (0 chat, 2 models). Preview hooks: [startStep], [startPage], [statusOverride], [startCelebrating].
 */
@Composable
fun OnboardingFlow(
    app: WakilApp,
    onFinish: (tab: Int) -> Unit,
    onOpenShizukuGuide: () -> Unit = {},
    startStep: Int = STEP_INTRO,
    startPage: Int = 0,
    statusOverride: Map<PermissionKind, PermStatus>? = null,
    startCelebrating: Boolean = false,
) {
    val ctx = LocalContext.current
    val view = LocalView.current
    val perms = remember { WakilPermissions.steps() }
    val readyStep = STEP_PERMS + perms.size
    var step by rememberSaveable { mutableIntStateOf(startStep) }
    var forward by remember { mutableStateOf(true) }
    val statuses = remember { mutableStateMapOf<PermissionKind, PermStatus>() }
    fun refresh() {
        perms.forEach { statuses[it] = statusOverride?.get(it) ?: WakilPermissions.status(ctx, it) }
    }
    LaunchedEffect(Unit) { refresh() }
    val shizuku by ShizukuShell.status.collectAsState()
    LaunchedEffect(shizuku) { refresh() }
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) refresh() }
        lifecycle.lifecycle.addObserver(obs)
        onDispose { lifecycle.lifecycle.removeObserver(obs) }
    }
    // live polling while a permission page is visible (some grants don't trigger onResume, e.g. Shizuku dialog)
    LaunchedEffect(step) {
        while (step in STEP_PERMS until readyStep) { delay(1500); refresh() }
    }

    var notifAsked by rememberSaveable { mutableStateOf(false) }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        refresh()
        if (!granted && notifAsked) WakilPermissions.openAppNotificationSettings(ctx)
        notifAsked = true
    }

    fun go(to: Int) { forward = to > step; haptic(view, HapticKind.TICK, com.wakil.agent.audio.Sound.WHOOSH); step = to.coerceIn(0, readyStep) }
    androidx.activity.compose.BackHandler(enabled = step > STEP_INTRO) { go(step - 1) }

    val gaze = remember { RobotGaze() }
    Box(Modifier.fillMaxSize().background(Neon.Black).robotGazeSource(gaze)) {
      CompositionLocalProvider(LocalRobotGaze provides gaze) {
        val tint = when {
            step == STEP_FEATURES -> Neon.Cyan
            step in STEP_PERMS until readyStep -> perms[step - STEP_PERMS].color
            else -> Neon.Cyan
        }
        AuroraBackground(tint = tint)
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            if (step != STEP_INTRO) TopProgress(step, readyStep, onBack = { go(step - 1) }, onSkip = if (step < readyStep) ({ go(if (step < STEP_PERMS) STEP_PERMS else step + 1) }) else null)
            AnimatedContent(
                targetState = step, modifier = Modifier.weight(1f),
                transitionSpec = {
                    // RTL: "forward" content comes in from the left edge.
                    val dir = if (forward) -1 else 1
                    (slideInHorizontally(tween(420, easing = FastOutSlowInEasing)) { dir * it / 3 } + fadeIn(tween(320)))
                        .togetherWith(slideOutHorizontally(tween(320)) { -dir * it / 4 } + fadeOut(tween(220)))
                }, label = "onboarding"
            ) { s ->
                when {
                    s == STEP_INTRO -> IntroStep(onStart = { go(STEP_FEATURES) }, onSkip = { go(STEP_PERMS) })
                    s == STEP_FEATURES -> FeaturesStep(startPage, onDone = { go(STEP_PERMS) })
                    s < readyStep -> {
                        val kind = perms[s - STEP_PERMS]
                        PermissionStep(
                            kind, statuses[kind] ?: PermStatus.MISSING, index = s - STEP_PERMS, total = perms.size,
                            onGrant = {
                                when (kind) {
                                    PermissionKind.NOTIFICATIONS ->
                                        if (Build.VERSION.SDK_INT >= 33 && !notifAsked) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                        else WakilPermissions.openAppNotificationSettings(ctx)
                                    PermissionKind.ACCESSIBILITY -> WakilPermissions.openAccessibility(ctx)
                                    PermissionKind.BATTERY -> WakilPermissions.requestBatteryExemption(ctx)
                                    PermissionKind.SHIZUKU -> when (statuses[kind]) {
                                        PermStatus.NOT_INSTALLED -> WakilPermissions.openUrl(ctx, WakilPermissions.SHIZUKU_URL)
                                        PermStatus.NOT_RUNNING -> WakilPermissions.openShizuku(ctx)
                                        else -> { app.prefs.shizukuEnabled = true; ShizukuShell.requestPermission() }
                                    }
                                }
                            },
                            onNext = { go(s + 1) },
                            onHelp = if (kind == PermissionKind.SHIZUKU) onOpenShizukuGuide else null,
                        )
                    }
                    else -> ReadyStep(app, statuses, perms, startCelebrating, onFinish)
                }
            }
        }
      }
    }
}

/* ---------------------------------------------------------------- chrome */

@Composable
private fun TopProgress(step: Int, last: Int, onBack: () -> Unit, onSkip: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        CircleIconButton(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", onBack, size = 36.dp)
        Spacer(Modifier.width(12.dp))
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            for (i in 1..last) {
                val on = i <= step
                val c by animateColorAsState(if (on) Neon.Cyan else Color.White.copy(alpha = 0.10f), tween(400), label = "seg$i")
                Box(
                    Modifier.weight(1f).height(4.dp).clip(RoundedCornerShape(50))
                        .background(if (i == step) Brush.horizontalGradient(listOf(Neon.Violet, Neon.Cyan)) else Brush.linearGradient(listOf(c, c)))
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Box(Modifier.widthIn(min = 52.dp), contentAlignment = Alignment.CenterEnd) {
            if (onSkip != null) Text(
                "تخطي", style = MaterialTheme.typography.labelLarge, color = Neon.TextDim,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable(onClick = onSkip).padding(horizontal = 10.dp, vertical = 6.dp)
            )
        }
    }
}

/** Arabic typewriter with a glowing caret. Emits a light haptic tick every few characters. */
@Composable
private fun Typewriter(text: String, start: Boolean, style: androidx.compose.ui.text.TextStyle, color: Color, cps: Int = 18, onDone: () -> Unit = {}) {
    val view = LocalView.current
    var n by remember { mutableIntStateOf(0) }
    LaunchedEffect(start) {
        if (!start) return@LaunchedEffect
        while (n < text.length) {
            n++
            if (n % 3 == 0 && text[n - 1] != ' ') haptic(view, HapticKind.TICK, com.wakil.agent.audio.Sound.TOOL_TICK)
            delay(1000L / cps)
        }
        onDone()
    }
    val inf = rememberInfiniteTransition(label = "caret")
    val a by inf.animateFloat(1f, 0f, infiniteRepeatable(tween(480), RepeatMode.Reverse), label = "caretA")
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text.take(n), style = style, color = color, textAlign = TextAlign.Center)
        if (start && n < text.length) Box(Modifier.padding(start = 3.dp).size(3.dp, style.fontSize.value.dp).graphicsLayer { alpha = a }.background(Neon.Cyan))
    }
}

/* ---------------------------------------------------------------- intro */

@Composable
private fun IntroStep(onStart: () -> Unit, onSkip: () -> Unit) {
    val view = LocalView.current
    val materialize = remember { Animatable(0f) }
    val eyes = remember { Animatable(0f) }
    var typing by remember { mutableStateOf(false) }
    var typed by remember { mutableStateOf(false) }
    var showRest by remember { mutableStateOf(false) }
    var waveKey by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        delay(250)
        com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.POWER_ON)
        materialize.animateTo(1f, tween(1700, easing = FastOutSlowInEasing))
        eyes.animateTo(1f, tween(520, easing = LinearEasing))
        haptic(view, HapticKind.CONFIRM, com.wakil.agent.audio.Sound.ROBOT_TALK)
        delay(150); typing = true
    }
    LaunchedEffect(typed) { if (typed) { delay(200); showRest = true; delay(150); com.wakil.agent.audio.Sfx.welcome(); waveKey++ } }

    val bootLines = listOf("neural core", "linux runtime", "agent tools", "privacy shield")
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("WAKIL · v${BuildConfig.VERSION_NAME}", fontFamily = JetMono, fontSize = 10.sp, color = Neon.Cyan.copy(alpha = 0.6f), modifier = Modifier.weight(1f), textAlign = TextAlign.Right)
            Text(
                "تخطي", style = MaterialTheme.typography.labelLarge, color = Neon.TextDim,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable(onClick = onSkip).padding(horizontal = 10.dp, vertical = 6.dp)
            )
        }
        Spacer(Modifier.weight(0.25f))
        // materialize → talk while the greeting types → wave together with the welcome voice
        WakilRobot(
            290.dp, mood = if (typing && !typed) RobotMood.TALK else RobotMood.IDLE,
            materialize = materialize.value, eyesOn = eyes.value,
            action = if (waveKey > 0) RobotAction.WAVE else RobotAction.NONE, actionKey = waveKey,
        )
        // boot log (LTR, monospace)
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Column(Modifier.height(64.dp).padding(top = 4.dp), horizontalAlignment = Alignment.Start) {
                bootLines.forEachIndexed { i, l ->
                    val shown = materialize.value > 0.15f + i * 0.2f
                    val ok = eyes.value >= 1f || materialize.value > 0.35f + i * 0.2f
                    if (shown) Text(
                        "› ${l.padEnd(15, '.')} ${if (ok) "OK" else "··"}", style = MonoLtr, fontSize = 10.5.sp, lineHeight = 15.sp,
                        color = if (ok) Neon.TermGreen.copy(alpha = 0.75f) else Neon.TextFaint
                    )
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.height(48.dp), contentAlignment = Alignment.Center) {
            Typewriter("مرحباً، أنا وكيل", typing, MaterialTheme.typography.displaySmall.copy(fontSize = 32.sp), Neon.Text, onDone = { typed = true })
        }
        Spacer(Modifier.height(6.dp))
        AnimatedVisibility(showRest, enter = fadeIn(tween(600)) + slideInVertically(tween(600)) { it / 3 }) {
            Text(
                "مساعدك الذكي الذي يعمل بالكامل على هاتفك:\nيفهم طلبك، ينفّذه، ويحترم خصوصيتك.",
                style = MaterialTheme.typography.bodyLarge, color = Neon.TextDim, textAlign = TextAlign.Center
            )
        }
        Spacer(Modifier.weight(0.4f))
        AnimatedVisibility(showRest, enter = fadeIn(tween(500, 250)) + scaleIn(spring(dampingRatio = 0.6f), initialScale = 0.85f)) {
            GlowButton("لنبدأ", onStart, Modifier.fillMaxWidth().height(52.dp), icon = Icons.Filled.AutoAwesome)
        }
        Spacer(Modifier.height(20.dp))
    }
}

/* ---------------------------------------------------------------- features */

@Composable
private fun FeaturesStep(startPage: Int, onDone: () -> Unit) {
    val pager = rememberPagerState(initialPage = startPage) { FEATURES.size }
    val scope = rememberCoroutineScope()
    val view = LocalView.current
    val page = pager.currentPage
    val f = FEATURES[page]
    // robot "reacts" to each page with a springy hop
    val hop = remember { Animatable(1f) }
    var pointing by remember { mutableStateOf(true) }
    LaunchedEffect(page) {
        pointing = true
        launch { delay(2600); pointing = false }
        haptic(view, HapticKind.TICK, if (page == startPage) null else com.wakil.agent.audio.Sound.WHOOSH)
        hop.snapTo(0.86f); hop.animateTo(1f, spring(dampingRatio = 0.42f, stiffness = 260f))
    }
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
        WakilRobot(
            230.dp, Modifier.padding(top = 4.dp).graphicsLayer { scaleX = hop.value; scaleY = hop.value }, mood = f.mood, accent = f.accent,
            action = if (pointing) RobotAction.POINT else RobotAction.NONE,
            pointAt = if (page % 2 == 0) Offset(-0.32f, 0.95f) else Offset(0.32f, 0.95f),
        )
        HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth(), beyondViewportPageCount = 1) { p ->
            val fp = FEATURES[p]
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(fp.title, style = MaterialTheme.typography.headlineMedium, color = Neon.Text, textAlign = TextAlign.Center)
                Spacer(Modifier.height(8.dp))
                Text(fp.body, style = MaterialTheme.typography.bodyLarge, color = Neon.TextDim, textAlign = TextAlign.Center)
                Spacer(Modifier.height(18.dp))
                when (p) {
                    0 -> PrivateAiVisual(fp.accent)
                    1 -> TerminalVisual()
                    else -> AppControlVisual(fp.accent)
                }
            }
        }
        NeonDots(FEATURES.size, page, FEATURES.map { it.accent })
        Spacer(Modifier.height(16.dp))
        GlowButton(
            if (page == FEATURES.lastIndex) "متابعة إلى الأذونات" else "التالي",
            { if (page < FEATURES.lastIndex) scope.launch { pager.animateScrollToPage(page + 1) } else onDone() },
            Modifier.padding(horizontal = 24.dp).fillMaxWidth().height(52.dp),
            icon = if (page == FEATURES.lastIndex) Icons.Filled.Shield else null,
        )
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun NeonDots(count: Int, current: Int, colors: List<Color>) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        for (i in 0 until count) {
            val on = i == current
            val w by animateDpAsState(if (on) 28.dp else 8.dp, spring(dampingRatio = 0.6f, stiffness = 400f), label = "dotW$i")
            val c = colors[i % colors.size]
            Box(
                Modifier.size(w, 8.dp)
                    .then(if (on) Modifier.neonGlow(c, RoundedCornerShape(50), 8.dp) else Modifier)
                    .clip(RoundedCornerShape(50))
                    .background(if (on) Brush.horizontalGradient(listOf(c, Neon.Violet)) else Brush.linearGradient(listOf(Color.White.copy(alpha = 0.18f), Color.White.copy(alpha = 0.18f))))
            )
        }
    }
}

@Composable
private fun PrivateAiVisual(accent: Color) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf("100%" to "على جهازك", "0" to "بيانات تُرسَل", "GGUF" to "llama.cpp").forEachIndexed { i, (big, small) ->
            GlassCard(Modifier.weight(1f), padding = PaddingValues(vertical = 14.dp, horizontal = 6.dp),
                border = Brush.linearGradient(listOf(accent.copy(alpha = 0.7f), Color.White.copy(alpha = 0.06f)))) {
                Text(big, fontFamily = JetMono, fontWeight = FontWeight.Bold, fontSize = 20.sp, color = if (i == 1) Neon.Green else accent,
                    modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, maxLines = 1)
                Text(small, style = MaterialTheme.typography.labelMedium, color = Neon.TextDim, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, maxLines = 1)
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Badge("يعمل بدون إنترنت", Neon.Green); Badge("أو خادم OpenAI اختياري", Neon.Blue)
    }
}

@Composable
private fun TerminalVisual() {
    val lines = listOf("~ # apk add python3", "OK: 58 MiB in 37 packages", "~ # python3 -c 'print(6*7)'", "42")
    val clock = rememberHudClock()
    GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(0.dp), fill = Color(0xCC03070C),
        border = Brush.linearGradient(listOf(Neon.Green.copy(alpha = 0.6f), Color.White.copy(alpha = 0.06f)))) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(Modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.04f)).padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                listOf(Neon.Red, Neon.Amber, Neon.Green).forEach { Box(Modifier.padding(end = 6.dp).size(8.dp).clip(CircleShape).background(it.copy(alpha = 0.8f))) }
                Spacer(Modifier.width(6.dp))
                Text("alpine · proot", fontFamily = JetMono, fontSize = 10.sp, color = Neon.TextFaint)
            }
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                lines.forEach { l ->
                    Text(l, style = MonoLtr, fontSize = 12.sp, lineHeight = 18.sp, color = if (l.startsWith("~")) Neon.Text else Neon.TermGreen, maxLines = 1)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("~ # ", style = MonoLtr, fontSize = 12.sp, color = Neon.Text)
                    Box(Modifier.size(7.dp, 14.dp).graphicsLayer { alpha = if ((clock.value * 2f).toInt() % 2 == 0) 1f else 0.15f }.background(Neon.TermGreen))
                }
            }
        }
    }
}

@Composable
private fun AppControlVisual(accent: Color) {
    val clock = rememberHudClock()
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(96.dp, 150.dp)) {
            val t = clock.value
            val r = 16.dp.toPx()
            drawRoundRect(Color(0xFF0A1220), size = size, cornerRadius = CornerRadius(r))
            drawRoundRect(Brush.linearGradient(listOf(accent, Neon.Cyan.copy(alpha = 0.5f))), size = size, cornerRadius = CornerRadius(r), style = Stroke(1.5.dp.toPx()))
            val pad = 10.dp.toPx()
            val rowH = 14.dp.toPx()
            val target = ((t / 1.6f).toInt() % 4)
            for (i in 0 until 5) {
                val y = pad + 12.dp.toPx() + i * (rowH + 6.dp.toPx())
                val hl = i == target
                drawRoundRect((if (hl) accent.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.07f)), Offset(pad, y), Size(size.width - pad * 2, rowH), CornerRadius(4.dp.toPx()))
                drawCircle(Color.White.copy(alpha = 0.2f), rowH * 0.28f, Offset(size.width - pad - rowH * 0.5f, y + rowH / 2))
            }
            val ph = (t / 1.6f) % 1f
            val ty = pad + 12.dp.toPx() + target * (rowH + 6.dp.toPx()) + rowH / 2
            val tc = Offset(size.width * 0.42f, ty)
            drawCircle(accent.copy(alpha = 0.6f * (1f - ph)), radius = 4.dp.toPx() + 16.dp.toPx() * ph, center = tc, style = Stroke(2.dp.toPx()))
            drawCircle(Color.White.copy(alpha = 0.9f), radius = 4.dp.toPx(), center = tc)
        }
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(Icons.Filled.Visibility to "يقرأ عناصر الشاشة", Icons.Filled.TouchApp to "ينقر ويكتب ويمرّر", Icons.Filled.VerifiedUser to "ينتظر موافقتك").forEach { (ic, s) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(accent.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                        Icon(ic, null, tint = accent, modifier = Modifier.size(17.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(s, style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                }
            }
        }
    }
}

/* ---------------------------------------------------------------- permission step */

private fun statusText(kind: PermissionKind, s: PermStatus) = when (s) {
    PermStatus.GRANTED -> "ممنوح"
    PermStatus.NOT_INSTALLED -> "Shizuku غير مثبّت"
    PermStatus.NOT_RUNNING -> "Shizuku مثبّت لكنه غير مُشغَّل"
    PermStatus.MISSING -> if (kind == PermissionKind.SHIZUKU) "Shizuku يعمل — بانتظار الإذن" else "غير ممنوح بعد"
}

private fun grantLabel(kind: PermissionKind, s: PermStatus) = when {
    kind == PermissionKind.SHIZUKU && s == PermStatus.NOT_INSTALLED -> "تنزيل Shizuku"
    kind == PermissionKind.SHIZUKU && s == PermStatus.NOT_RUNNING -> "فتح Shizuku"
    kind == PermissionKind.ACCESSIBILITY || kind == PermissionKind.BATTERY -> "فتح الإعدادات"
    else -> "منح الإذن"
}

@Composable
private fun PermissionStep(kind: PermissionKind, status: PermStatus, index: Int, total: Int, onGrant: () -> Unit, onNext: () -> Unit, onHelp: (() -> Unit)? = null) {
    val ctx = LocalContext.current
    val view = LocalView.current
    val granted = status == PermStatus.GRANTED
    var wasGranted by remember { mutableStateOf(granted) }
    LaunchedEffect(granted) { if (granted && !wasGranted) haptic(view, HapticKind.CONFIRM, com.wakil.agent.audio.Sound.GRANTED); wasGranted = granted }
    val c = if (granted) Neon.Green else kind.color

    Column(Modifier.fillMaxSize().padding(horizontal = 22.dp)) {
        BoxWithConstraints(Modifier.weight(1f)) {
        Column(Modifier.fillMaxWidth().heightIn(min = maxHeight).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(contentAlignment = Alignment.BottomCenter) {
                WakilRobot(
                    180.dp, Modifier.padding(bottom = 4.dp), mood = if (granted) RobotMood.HAPPY else RobotMood.IDLE, accent = c,
                    action = if (granted) RobotAction.NONE else RobotAction.POINT, pointAt = Offset(0.18f, 2.6f),
                )
                // permission badge floats beside the head (the hands need the space below)
                Box(
                    Modifier.align(Alignment.TopEnd).padding(top = 22.dp).size(46.dp).neonGlow(c, CircleShape, 10.dp).clip(CircleShape)
                        .background(Color(0xE6070C16)).border(1.5.dp, c, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    AnimatedContent(granted, label = "permIcon") { g ->
                        Icon(if (g) Icons.Filled.Check else kind.icon, null, tint = c, modifier = Modifier.size(24.dp))
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("الإذن ${index + 1} من $total", style = MaterialTheme.typography.labelMedium, color = Neon.TextDim)
                if (kind.optional) { Spacer(Modifier.width(8.dp)); Badge("اختياري", Neon.Magenta) }
            }
            Spacer(Modifier.height(4.dp))
            Text(kind.title, style = MaterialTheme.typography.headlineMedium, color = Neon.Text, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(kind.why, style = MaterialTheme.typography.bodyMedium, color = Neon.TextDim, textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            GlassCard(
                Modifier.fillMaxWidth(),
                border = Brush.linearGradient(listOf(c.copy(alpha = 0.75f), Color.White.copy(alpha = 0.06f), c.copy(alpha = 0.35f))),
                glow = if (granted) Neon.Green.copy(alpha = 0.45f) else Color.Transparent,
                padding = PaddingValues(14.dp),
            ) {
                kind.bullets.forEach { b ->
                    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, tint = c.copy(alpha = 0.85f), modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(b, style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.copy(alpha = 0.08f))
                        .border(1.dp, c.copy(alpha = 0.3f), RoundedCornerShape(14.dp)).padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    PulseDot(if (granted) Neon.Green else Neon.Amber, size = 8.dp, pulsing = !granted)
                    Spacer(Modifier.width(4.dp))
                    Text("الحالة: ${statusText(kind, status)}", style = MaterialTheme.typography.bodySmall, color = Neon.Text)
                }
            }
            // contextual hints
            val hint: Pair<String, (@Composable () -> Unit)?>? = when {
                granted -> null
                kind == PermissionKind.ACCESSIBILITY && Build.VERSION.SDK_INT >= 33 ->
                    "إذا ظهر الخيار رمادياً: افتح «معلومات التطبيق»، ثم من القائمة العلوية اختر «السماح بالإعدادات المقيّدة»، وبعدها عد وفعّل «وكيل»." to {
                        GhostButton("معلومات التطبيق", { WakilPermissions.openAppDetails(ctx) }, color = Neon.Violet, icon = Icons.Filled.Info)
                    }
                kind == PermissionKind.ACCESSIBILITY -> "ابحث عن «وكيل» في قائمة الخدمات وفعّله، ثم عد إلى هنا." to null
                kind == PermissionKind.SHIZUKU && status == PermStatus.NOT_RUNNING ->
                    "شغّل خدمة Shizuku عبر «تصحيح الأخطاء اللاسلكي» من داخل تطبيقه، ثم عد إلى هنا." to null
                kind == PermissionKind.SHIZUKU && status == PermStatus.NOT_INSTALLED ->
                    "تطبيق Shizuku مجاني ومفتوح المصدر. يمكنك تخطي هذه الخطوة وتفعيله لاحقاً من الإعدادات." to null
                else -> null
            }
            if (hint != null) {
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Filled.Lightbulb, null, tint = Neon.Amber, modifier = Modifier.padding(top = 2.dp).size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(hint.first, style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                }
                hint.second?.let { Spacer(Modifier.height(8.dp)); it() }
            }
            if (onHelp != null) {
                Spacer(Modifier.height(10.dp))
                GhostButton("كيف أفعّله؟ · الدليل الكامل", onHelp, color = Neon.Magenta, icon = Icons.Filled.Lightbulb)
            }
            Spacer(Modifier.height(12.dp))
        }
        }
        if (granted) GlowButton("التالي", onNext, Modifier.fillMaxWidth().height(52.dp), icon = Icons.Filled.Check,
            colors = listOf(Neon.Green, Neon.Cyan, Neon.Blue))
        else {
            GlowButton(grantLabel(kind, status), { haptic(view, HapticKind.TICK); onGrant() }, Modifier.fillMaxWidth().height(52.dp),
                icon = if (status == PermStatus.NOT_INSTALLED) Icons.AutoMirrored.Filled.OpenInNew else kind.icon,
                colors = listOf(kind.color, Neon.Blue, Neon.Violet))
            Spacer(Modifier.height(4.dp))
            Text(
                "ليس الآن", style = MaterialTheme.typography.labelLarge, color = Neon.TextDim, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).clickable(onClick = onNext).padding(vertical = 10.dp)
            )
        }
        Spacer(Modifier.height(10.dp))
    }
}

/* ---------------------------------------------------------------- ready */

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReadyStep(
    app: WakilApp, statuses: Map<PermissionKind, PermStatus>, perms: List<PermissionKind>,
    startCelebrating: Boolean, onFinish: (Int) -> Unit,
) {
    val view = LocalView.current
    val files by app.models.files.collectAsState()
    val dl by app.models.download.collectAsState()
    val llm by app.llm.state.collectAsState()
    val env by app.env.state.collectAsState()
    var celebrating by remember { mutableStateOf(startCelebrating) }
    val scope = rememberCoroutineScope()
    val hasModel = files.isNotEmpty() || llm is LlmState.Ready || app.llm.usingRemote

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
                WakilRobot(170.dp, mood = if (celebrating) RobotMood.CELEBRATE else RobotMood.HAPPY)
                val allSet = hasModel && env is EnvState.Ready
                Text(if (allSet) "كل شيء جاهز!" else "كل شيء جاهز تقريباً", style = MaterialTheme.typography.headlineMedium, color = Neon.Text, textAlign = TextAlign.Center)
                Text(
                    if (allSet) "وكيل مستعد لتنفيذ مهمتك الأولى." else "خطوتان أخيرتان ليعمل وكيل بكامل قوته — ويمكنك إكمالهما لاحقاً.",
                    style = MaterialTheme.typography.bodyMedium, color = Neon.TextDim, textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(14.dp))

                // 1) model
                SetupCard(Icons.Filled.Memory, "النموذج الذكي", Neon.Cyan, done = hasModel) {
                    val d = dl
                    when {
                        hasModel -> Text(
                            if (app.llm.usingRemote) "يستخدم خادم OpenAI-compatible" else "نموذج متوفر: ${files.firstOrNull()?.name ?: (llm as? LlmState.Ready)?.name ?: ""}",
                            style = MaterialTheme.typography.bodySmall, color = Neon.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        d != null && d.running -> {
                            val p = if (d.total > 0) d.downloaded.toFloat() / d.total else 0f
                            Text("جارٍ التنزيل… ${(p * 100).toInt()}%", style = MaterialTheme.typography.bodySmall, color = Neon.Cyan)
                            Spacer(Modifier.height(6.dp)); NeonBar(p, Neon.Cyan)
                        }
                        else -> {
                            Text("لم يُنزَّل أي نموذج بعد. ننصح بنموذج Qwen2.5-3B لأجهزة بذاكرة 6 جيجابايت فأكثر.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                            Spacer(Modifier.height(8.dp))
                            GhostButton("تنزيل الموصى به · 2.1 جيجابايت", { haptic(view, HapticKind.CONFIRM); app.models.startDownload(ModelManager.PRESETS[0].url) },
                                Modifier.fillMaxWidth(), icon = Icons.Filled.Download)
                            Spacer(Modifier.height(8.dp))
                            GhostButton("اختيار نموذج آخر", { onFinish(2) }, Modifier.fillMaxWidth(), color = Neon.Violet, icon = Icons.Filled.Memory)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                // 2) linux env
                SetupCard(Icons.Filled.Terminal, "بيئة لينكس", Neon.Green, done = env is EnvState.Ready) {
                    when (val e = env) {
                        EnvState.Ready -> Text("Alpine Linux مثبّتة وجاهزة", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                        is EnvState.Installing -> {
                            Text("${e.step} ${(e.progress * 100).toInt()}%", style = MaterialTheme.typography.bodySmall, color = Neon.Green, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(6.dp)); NeonBar(e.progress, Neon.Green)
                        }
                        is EnvState.Error -> {
                            Text(e.message, style = MaterialTheme.typography.bodySmall, color = Neon.Red, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(8.dp))
                            GhostButton("إعادة المحاولة", { app.env.install() }, Modifier.fillMaxWidth(), color = Neon.Green, icon = Icons.Filled.Refresh)
                        }
                        EnvState.NotInstalled -> {
                            Text("تنزيل Alpine Linux صغير الحجم لتشغيل الأوامر والحزم.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                            Spacer(Modifier.height(8.dp))
                            GhostButton("إعداد البيئة الآن", { haptic(view, HapticKind.CONFIRM); app.env.install() }, Modifier.fillMaxWidth(), color = Neon.Green, icon = Icons.Filled.Bolt)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                // 3) permissions summary
                val granted = perms.count { statuses[it] == PermStatus.GRANTED }
                SetupCard(Icons.Filled.Shield, "الأذونات", Neon.Violet, done = granted == perms.size, trailing = "$granted / ${perms.size}") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        perms.forEach { k ->
                            val ok = statuses[k] == PermStatus.GRANTED
                            val bc = if (ok) Neon.Green else Neon.TextDim
                            Row(
                                Modifier.clip(RoundedCornerShape(50)).background(bc.copy(alpha = 0.12f))
                                    .border(1.dp, bc.copy(alpha = 0.45f), RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(if (ok) Icons.Filled.Check else Icons.Filled.Remove, null, tint = bc, modifier = Modifier.size(13.dp))
                                Spacer(Modifier.width(4.dp))
                                Text(k.short, style = MaterialTheme.typography.labelSmall, color = bc, maxLines = 1)
                            }
                        }
                    }
                    if (granted < perms.size) {
                        Spacer(Modifier.height(6.dp))
                        Text("يمكنك منح الباقي لاحقاً من «الإعدادات».", style = MaterialTheme.typography.labelSmall, color = Neon.TextFaint)
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
            GlowButton(
                "ادخل إلى وكيل", {
                    if (!celebrating) {
                        celebrating = true; haptic(view, HapticKind.CONFIRM, com.wakil.agent.audio.Sound.CELEBRATE)
                        scope.launch { delay(1400); onFinish(0) }
                    }
                }, Modifier.fillMaxWidth().height(54.dp), icon = Icons.Filled.RocketLaunch,
            )
            Spacer(Modifier.height(14.dp))
        }
        AnimatedVisibility(celebrating, enter = fadeIn(tween(300)) + scaleIn(spring(dampingRatio = 0.5f), initialScale = 0.6f), modifier = Modifier.align(Alignment.Center)) {
            Text(
                "أهلاً بك!", style = MaterialTheme.typography.displaySmall, color = Neon.Text,
                modifier = Modifier.clip(RoundedCornerShape(24.dp)).background(Color(0xCC05070D))
                    .border(1.dp, Neon.borderGradient, RoundedCornerShape(24.dp)).padding(horizontal = 28.dp, vertical = 12.dp)
            )
        }
    }
}

@Composable
private fun SetupCard(icon: ImageVector, title: String, accent: Color, done: Boolean, trailing: String? = null, content: @Composable ColumnScope.() -> Unit) {
    val c = if (done) Neon.Green else accent
    GlassCard(Modifier.fillMaxWidth(), border = Brush.linearGradient(listOf(c.copy(alpha = 0.7f), Color.White.copy(alpha = 0.06f))), padding = PaddingValues(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            HudTitle(title, Modifier.weight(1f), color = c, icon = icon)
            if (trailing != null) { Badge(trailing, c); Spacer(Modifier.width(6.dp)) }
            if (done) Icon(Icons.Filled.CheckCircle, null, tint = Neon.Green, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(8.dp))
        content()
    }
}

@Composable
private fun NeonBar(progress: Float, color: Color) {
    val p by animateFloatAsState(progress.coerceIn(0f, 1f), tween(400), label = "bar")
    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.08f))) {
        Box(Modifier.fillMaxWidth(p).fillMaxHeight().clip(RoundedCornerShape(50)).background(Brush.horizontalGradient(listOf(Neon.Violet, color))))
    }
}
