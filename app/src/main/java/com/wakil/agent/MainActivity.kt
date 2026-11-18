package com.wakil.agent

import android.Manifest
import android.graphics.Color as AColor
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.wakil.agent.agent.Approval
import com.wakil.agent.agent.ApprovalRequest
import com.wakil.agent.ui.ChatScreen
import com.wakil.agent.ui.ModelsScreen
import com.wakil.agent.ui.SettingsScreen
import com.wakil.agent.ui.TerminalScreen
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.rememberAgentOrbState
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.Neon
import com.wakil.agent.ui.theme.WakilTheme
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(AColor.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(AColor.TRANSPARENT),
        )
        // Runtime permissions are requested step by step in the onboarding flow (and from Settings).
        val app = application as WakilApp
        // Without this permission Android hides the progress notification of downloads and running tasks.
        if (Build.VERSION.SDK_INT >= 33 && app.prefs.onboardingDone &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7)
        if (app.prefs.bubbleOn && android.provider.Settings.canDrawOverlays(this)) com.wakil.agent.bubble.BubbleService.start(this)
        takeShared(intent)
        if (app.prefs.wakeWord && !com.wakil.agent.audio.OfflineVoice.ready()) app.prefs.wakeWord = false
        if (app.prefs.wakeWord && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED &&
            !com.wakil.agent.audio.WakeService.running) com.wakil.agent.audio.WakeService.start(this)
        setContent {
            WakilTheme {
                // Arabic-first UI: force RTL layout.
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    WakilRoot(app, initialTab = intent.getIntExtra("tab", 0))
                }
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        takeShared(intent)
    }

    /** Text shared or selected in another app ("اسأل وكيل") lands in the chat input. */
    private fun takeShared(i: android.content.Intent?) {
        val app = application as WakilApp
        if (i?.getBooleanExtra("voice_chat", false) == true) { app.agent.voiceChatRequest.value = true; i.removeExtra("voice_chat") }
        if (i?.getBooleanExtra("focus_input", false) == true) { app.agent.focusInputRequest.value = true; i.removeExtra("focus_input") }
        if (i?.action == com.wakil.agent.extra.Shortcuts.ACTION_RUN) {
            i.getStringExtra(com.wakil.agent.extra.Shortcuts.EXTRA_PROMPT)?.takeIf { it.isNotBlank() }?.let { p ->
                if (app.agent.running.value) app.agent.pendingInput.value = p else app.agent.send(p)
            }
            i.action = null
            return
        }
        val t = when (i?.action) {
            android.content.Intent.ACTION_SEND -> listOfNotNull(i.getStringExtra(android.content.Intent.EXTRA_SUBJECT), i.getStringExtra(android.content.Intent.EXTRA_TEXT)).joinToString("\n")
            android.content.Intent.ACTION_PROCESS_TEXT -> i.getCharSequenceExtra(android.content.Intent.EXTRA_PROCESS_TEXT)?.toString()
            else -> null
        }
        if (!t.isNullOrBlank()) (application as WakilApp).agent.pendingInput.value = t.trim()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WakilRoot(app: WakilApp, initialTab: Int = 0, splash: Boolean = true, onboarding: Boolean = !app.prefs.onboardingDone, shizukuGuide: Boolean = false) {
    val tabs = listOf(
        DockTab("المحادثة", Icons.AutoMirrored.Filled.Chat),
        DockTab("الطرفية", Icons.Filled.Terminal),
        DockTab("النماذج", Icons.Filled.Memory),
        DockTab("GitHub", Icons.Filled.Code),
        DockTab("الإعدادات", Icons.Filled.Settings),
    )
    var selected by rememberSaveable { mutableIntStateOf(initialTab) }
    val shared by app.agent.pendingInput.collectAsState()
    LaunchedEffect(shared) { if (shared != null) selected = 0 }
    var showOnboarding by rememberSaveable { mutableStateOf(onboarding) }
    var showGuide by rememberSaveable { mutableStateOf(shizukuGuide) }
    var showSplash by rememberSaveable { mutableStateOf(splash && !onboarding) }
    val approval by app.agent.approval.collectAsState()
    val orbState = rememberAgentOrbState(app)
    val imeVisible = WindowInsets.ime.getBottom(androidx.compose.ui.platform.LocalDensity.current) > 0

    val auroraTint = when (orbState) {
        OrbState.TOOL -> Neon.Amber
        OrbState.APPROVAL -> Neon.Yellow
        OrbState.ERROR -> Neon.Red
        OrbState.THINKING -> Neon.Magenta
        OrbState.IDLE -> Neon.Cyan
    }

    Box(Modifier.fillMaxSize().background(Neon.Black)) {
        AuroraBackground(tint = auroraTint)
        Box(
            Modifier.fillMaxSize()
                .statusBarsPadding()
                .windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars).only(WindowInsetsSides.Bottom))
                .padding(bottom = if (imeVisible) 0.dp else 84.dp)
        ) {
            AnimatedContent(
                targetState = selected,
                transitionSpec = {
                    (fadeIn(tween(260)) + scaleIn(tween(260), initialScale = 0.98f)) togetherWith fadeOut(tween(140))
                },
                label = "tabs"
            ) { tab ->
                when (tab) {
                    0 -> ChatScreen(app, orbState)
                    1 -> TerminalScreen(app)
                    2 -> ModelsScreen(app)
                    3 -> com.wakil.agent.ui.GitHubScreen(app, onAskAgent = { app.agent.send(it); selected = 0 })
                    else -> SettingsScreen(app, onReplayIntro = { showOnboarding = true }, onOpenShizukuGuide = { showGuide = true })
                }
            }
        }
        AnimatedVisibility(
            visible = !imeVisible,
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(horizontal = 14.dp, vertical = 8.dp)
        ) {
            GlassDock(tabs, selected, onSelect = { selected = it })
        }

        AnimatedVisibility(
            showOnboarding, enter = fadeIn(tween(400)),
            exit = fadeOut(tween(500)) + scaleOut(tween(500), targetScale = 1.06f)
        ) {
            com.wakil.agent.onboarding.OnboardingFlow(app, onOpenShizukuGuide = { showGuide = true }, onFinish = { tab ->
                app.prefs.onboardingDone = true
                selected = tab
                showOnboarding = false
            })
        }

        AnimatedVisibility(
            showGuide, enter = fadeIn(tween(250)) + slideInHorizontally(tween(320)) { -it / 4 },
            exit = fadeOut(tween(200)) + slideOutHorizontally(tween(260)) { -it / 4 }
        ) {
            com.wakil.agent.ui.ShizukuGuideScreen(app, onBack = { showGuide = false })
        }

        AnimatedVisibility(showSplash, enter = fadeIn(), exit = fadeOut(tween(450)) + scaleOut(tween(450), targetScale = 1.08f)) {
            Splash()
        }
    }
    LaunchedEffect(Unit) { if (showSplash) { delay(1500); showSplash = false } }

    approval?.let { ApprovalDialog(it, app) }
}

@Composable
private fun Splash() {
    val scale = remember { Animatable(0.35f) }
    val textAlpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        scale.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = 180f))
    }
    LaunchedEffect(Unit) { delay(350); textAlpha.animateTo(1f, tween(500)) }
    Box(Modifier.fillMaxSize().background(Neon.Black), contentAlignment = Alignment.Center) {
        AuroraBackground()
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            EnergyOrb(OrbState.THINKING, 200.dp, Modifier.graphicsLayer { scaleX = scale.value; scaleY = scale.value })
            Spacer(Modifier.height(18.dp))
            Text("وكيل", style = MaterialTheme.typography.displaySmall, color = Neon.Text, modifier = Modifier.graphicsLayer { alpha = textAlpha.value })
            Text(
                "W A K I L  ·  O N - D E V I C E   A G E N T", fontFamily = JetMono, fontSize = 10.sp, color = Neon.Cyan.copy(alpha = 0.7f),
                modifier = Modifier.graphicsLayer { alpha = textAlpha.value }
            )
        }
    }
}

@Composable
private fun ApprovalDialog(req: ApprovalRequest, app: WakilApp) {
    val view = LocalView.current
    LaunchedEffect(req) { haptic(view, HapticKind.ALERT) }
    Dialog(onDismissRequest = {}, properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false, usePlatformDefaultWidth = false)) {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            GlassCard(
                Modifier.padding(horizontal = 20.dp).fillMaxWidth().widthIn(max = 460.dp),
                border = androidx.compose.ui.graphics.Brush.linearGradient(listOf(Neon.Yellow, Neon.Amber.copy(alpha = 0.4f), Neon.Yellow.copy(alpha = 0.8f))),
                glow = Neon.Yellow.copy(alpha = 0.7f),
                padding = PaddingValues(20.dp),
                fill = Color(0xF00A0E16),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    EnergyOrb(OrbState.APPROVAL, 64.dp, detail = false)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("طلب إذن", style = MaterialTheme.typography.titleLarge, color = Neon.Yellow)
                        Text("يريد الوكيل تنفيذ هذا الإجراء:", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Badge(req.tool, Neon.Yellow)
                Spacer(Modifier.height(10.dp))
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Box(
                        Modifier.fillMaxWidth().heightIn(max = 300.dp).clip(RoundedCornerShape(14.dp))
                            .background(Color(0xCC000000)).border(1.dp, Neon.Yellow.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
                            .verticalScroll(rememberScrollState()).padding(12.dp)
                    ) {
                        SelectionContainer {
                            Text(
                                req.argsPreview, style = com.wakil.agent.ui.theme.MonoLtr, fontSize = 12.sp, color = Neon.TermGreen, lineHeight = 17.sp,
                                modifier = Modifier.horizontalScroll(rememberScrollState())
                            )
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                GlowButton("سماح مرة واحدة", {
                    haptic(view, HapticKind.CONFIRM); app.agent.answerApproval(Approval.ONCE)
                }, Modifier.fillMaxWidth(), icon = Icons.Filled.Verified)
                Spacer(Modifier.height(8.dp))
                GhostButton("سماح دائماً لهذه الأداة", {
                    haptic(view, HapticKind.CONFIRM); app.agent.answerApproval(Approval.ALWAYS)
                }, Modifier.fillMaxWidth(), color = Neon.Violet, icon = Icons.Filled.DoneAll)
                Spacer(Modifier.height(8.dp))
                GhostButton("رفض", {
                    haptic(view, HapticKind.REJECT); app.agent.answerApproval(Approval.DENY)
                }, Modifier.fillMaxWidth(), color = Neon.Red, icon = Icons.Filled.Block)
            }
        }
    }
}

