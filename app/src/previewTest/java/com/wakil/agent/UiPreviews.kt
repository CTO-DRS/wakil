package com.wakil.agent

import android.graphics.Bitmap
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.LayoutDirection
import androidx.test.core.app.ApplicationProvider
import com.wakil.agent.agent.ApprovalRequest
import com.wakil.agent.agent.ChatItem
import com.wakil.agent.agent.ItemKind
import com.wakil.agent.env.EnvState
import com.wakil.agent.llm.DownloadState
import com.wakil.agent.llm.LlmState
import com.wakil.agent.onboarding.OnboardingFlow
import com.wakil.agent.onboarding.PermStatus
import com.wakil.agent.onboarding.PermissionKind
import com.wakil.agent.ui.TerminalSession
import com.wakil.agent.ui.theme.WakilTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.unit.dp

/** Renders the main screens to PNG (out/v1.2-previews) for visual review. Not a functional test. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w400dp-h880dp-xxhdpi", application = android.app.Application::class)
class UiPreviews {
    @get:Rule val rule = createComposeRule()

    /** WakilApp built by hand: Robolectric leaves nativeLibraryDir null, which LinuxEnv needs. */
    private val app: WakilApp by lazy {
        val base = ApplicationProvider.getApplicationContext<android.app.Application>()
        base.applicationInfo.nativeLibraryDir = File(base.filesDir, "native").apply { mkdirs() }.path
        val a = WakilApp()
        val m = android.content.ContextWrapper::class.java.getDeclaredMethod("attachBaseContext", android.content.Context::class.java)
        m.isAccessible = true; m.invoke(a, base)
        a.onCreate(); a
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> flow(owner: Any, name: String): MutableStateFlow<T> {
        val f = owner.javaClass.getDeclaredField(name); f.isAccessible = true
        return f.get(owner) as MutableStateFlow<T>
    }

    private fun show(tab: Int, splash: Boolean = false, advanceMs: Long = 2400) {
        rule.mainClock.autoAdvance = false
        rule.setContent {
            WakilTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) { WakilRoot(app, tab, splash, onboarding = false) }
            }
        }
        rule.mainClock.advanceTimeBy(advanceMs)
    }

    /** Software-draws every window root (activity + dialogs) into one bitmap; no frame waits needed. */
    private fun save(name: String) {
        val dir = File(System.getProperty("wakil.previews.dir") ?: "build/previews").apply { mkdirs() }
        rule.mainClock.advanceTimeByFrame()
        val wmg = Class.forName("android.view.WindowManagerGlobal")
        val inst = wmg.getMethod("getInstance").invoke(null)
        val f = wmg.getDeclaredField("mViews"); f.isAccessible = true
        @Suppress("UNCHECKED_CAST") val views = (f.get(inst) as List<android.view.View>).filter { it.isShown && it.width > 0 }
        val main = views.first()
        val bmp = Bitmap.createBitmap(main.width, main.height, Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(bmp)
        views.forEachIndexed { i, v ->
            val loc = IntArray(2); v.getLocationOnScreen(loc)
            if (i > 0) c.drawColor(android.graphics.Color.argb(150, 0, 0, 0)) // dialog scrim
            c.save(); c.translate(loc[0].toFloat(), loc[1].toFloat())
            if (i > 0 && loc[0] == 0 && loc[1] == 0) c.translate((main.width - v.width) / 2f, (main.height - v.height) / 2f)
            v.draw(c); c.restore()
        }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private var id = 100L
    private fun item(kind: ItemKind, text: String, title: String = "") = ChatItem(id++, kind, text, title)

    private fun readyModel() { flow<LlmState>(app.llm, "_state").value = LlmState.Ready("qwen2.5-3b-instruct-q4_k_m.gguf", 4096) }

    @Test fun chat_empty() { show(0); save("01-chat-empty") }

    @Test fun chat_conversation() {
        readyModel()
        flow<List<ChatItem>>(app.agent, "_items").value = listOf(
            item(ItemKind.USER, "ثبّت بايثون واطبع إصدارها"),
            item(ItemKind.TOOL_CALL, "{\n  \"cmd\": \"apk add python3\"\n}", "run_shell"),
            item(ItemKind.TOOL_RESULT, "fetch https://dl-cdn.alpinelinux.org/alpine/v3.24/main/aarch64/APKINDEX.tar.gz\n(1/12) Installing libbz2 (1.0.8-r6)\n...\nOK: 58 MiB in 37 packages", "run_shell"),
            item(ItemKind.TOOL_CALL, "{\n  \"cmd\": \"python3 --version\"\n}", "run_shell"),
            item(ItemKind.TOOL_RESULT, "Python 3.12.8", "run_shell"),
            item(ItemKind.ASSISTANT, "تم تثبيت بايثون بنجاح، والإصدار المثبّت هو Python 3.12.8 ✅"),
            item(ItemKind.USER, "افتح الإعدادات واقرأ الشاشة"),
            item(ItemKind.TOOL_CALL, "{\n  \"name\": \"com.android.settings\"\n}", "open_app"),
            item(ItemKind.TOOL_RESULT, "ERROR: tool 'open_app' is not available right now", "open_app"),
            item(ItemKind.TOOL_CALL, "{}", "read_screen"),
        )
        flow<Boolean>(app.agent, "_running").value = true
        show(0); save("02-chat-conversation-tool-running")
    }

    @Test fun chat_streaming() {
        readyModel()
        flow<List<ChatItem>>(app.agent, "_items").value = listOf(
            item(ItemKind.USER, "Install nmap and scan my router"),
            item(ItemKind.INFO, "تم الإيقاف"),
            item(ItemKind.ERROR, "لا يوجد نموذج جاهز. حمّل نموذجاً من صفحة \"النماذج\" أو فعّل خادم OpenAI-compatible من الإعدادات."),
            item(ItemKind.USER, "اشرح لي ما هو nmap باختصار"),
        )
        flow<Boolean>(app.agent, "_running").value = true
        flow<String>(app.agent, "_streaming").value = "nmap أداة مفتوحة المصدر لفحص الشبكات: تكتشف الأجهزة المتصلة والمنافذ المفتوحة والخدمات التي تعمل عليها"
        show(0); save("03-chat-streaming")
    }

    @Test fun approval_dialog() {
        readyModel()
        flow<List<ChatItem>>(app.agent, "_items").value = listOf(
            item(ItemKind.USER, "احذف ملفات الكاش"),
            item(ItemKind.TOOL_CALL, "{\n  \"cmd\": \"rm -rf /root/.cache\"\n}", "run_shell"),
        )
        flow<Boolean>(app.agent, "_running").value = true
        flow<ApprovalRequest?>(app.agent, "_approval").value =
            ApprovalRequest("run_shell", "{\n  \"cmd\": \"rm -rf /root/.cache\"\n}", CompletableDeferred())
        show(0)
        save("04-approval-dialog")
    }

    @Test fun terminal_ready() {
        flow<EnvState>(app.env, "_state").value = EnvState.Ready
        TerminalSession.log.value = "\n/root# apk update\nfetch https://dl-cdn.alpinelinux.org/alpine/v3.24/main/aarch64/APKINDEX.tar.gz\nv3.24.4 [https://dl-cdn.alpinelinux.org/alpine/v3.24/main]\nOK: 24180 distinct packages available\n/root# python3 -c 'print(\"مرحبا\")'\nمرحبا\n/root# cat /nope\ncat: can't open '/nope': No such file or directory\n[exit 1]\n/root# apk add nmap\nWARNING: opening cache: No such file\n(1/4) Installing lua5.4-libs (5.4.7-r0)\nOK: 66 MiB in 41 packages"
        show(1); save("05-terminal-ready")
    }

    @Test fun terminal_installing() {
        flow<EnvState>(app.env, "_state").value = EnvState.Installing("تنزيل Alpine rootfs…", 0.42f)
        TerminalSession.log.value = ""
        show(1); save("06-terminal-installing")
    }

    @Test fun terminal_not_installed() {
        flow<EnvState>(app.env, "_state").value = EnvState.NotInstalled
        TerminalSession.log.value = ""
        show(1); save("06b-terminal-not-installed")
    }

    @Test fun models() {
        readyModel()
        val dir = File(app.filesDir, "models").apply { mkdirs() }
        File(dir, "qwen2.5-3b-instruct-q4_k_m.gguf").writeBytes(ByteArray(2048))
        File(dir, "qwen2.5-1.5b-instruct-q4_k_m.gguf").writeBytes(ByteArray(1024))
        app.models.refresh()
        flow<DownloadState?>(app.models, "_download").value =
            DownloadState("Qwen3-4B-Q4_K_M.gguf", 1_120_000_000L, 2_497_000_000L, running = true)
        show(2); save("07-models")
    }

    @Test @Config(qualifiers = "w400dp-h2300dp-xxhdpi") fun models_full() {
        readyModel()
        val dir = File(app.filesDir, "models").apply { mkdirs() }
        File(dir, "qwen2.5-3b-instruct-q4_k_m.gguf").writeBytes(ByteArray(2048))
        File(dir, "Qwen3-4B-Q4_K_M.gguf").writeBytes(ByteArray(1024))
        app.models.refresh()
        flow<DownloadState?>(app.models, "_download").value =
            DownloadState("Qwen3-4B-Q4_K_M.gguf", 2_497_000_000L, 2_497_000_000L, running = false, done = true)
        show(2); save("07b-models-full")
    }

    @Test fun settings() { show(4); save("08-settings") }

    @Test @Config(qualifiers = "w400dp-h4200dp-xxhdpi") fun settings_full() { show(4); save("08b-settings-full") }

    @Test fun launcher_icon() {
        val ctx = ApplicationProvider.getApplicationContext<android.app.Application>()
        val d = ctx.getDrawable(R.mipmap.ic_launcher)!!
        val px = 432
        val bmp = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(bmp)
        val path = android.graphics.Path().apply { addCircle(px / 2f, px / 2f, px / 2f, android.graphics.Path.Direction.CW) }
        c.clipPath(path)
        d.setBounds(0, 0, px, px); d.draw(c)
        val dir = File(System.getProperty("wakil.previews.dir") ?: "build/previews").apply { mkdirs() }
        File(dir, "09-launcher-icon.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /* ------------------------------------------------------------ v1.2 onboarding */

    private val allMissing = mapOf(
        PermissionKind.NOTIFICATIONS to PermStatus.MISSING, PermissionKind.ACCESSIBILITY to PermStatus.MISSING,
        PermissionKind.SHIZUKU to PermStatus.NOT_INSTALLED, PermissionKind.BATTERY to PermStatus.MISSING,
    )

    private fun onb(step: Int, page: Int = 0, statuses: Map<PermissionKind, PermStatus> = allMissing, celebrate: Boolean = false, advanceMs: Long = 1800) {
        rule.mainClock.autoAdvance = false
        rule.setContent {
            WakilTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    OnboardingFlow(app, onFinish = {}, startStep = step, startPage = page, statusOverride = statuses, startCelebrating = celebrate)
                }
            }
        }
        rule.mainClock.advanceTimeBy(advanceMs)
    }

    @Test fun onb_intro_a_materialize() { onb(0, advanceMs = 900); save("10-onb-intro-a-materialize") }
    @Test fun onb_intro_b_scan() { onb(0, advanceMs = 1500); save("10-onb-intro-b-scan") }
    @Test fun onb_intro_c_eyes() { onb(0, advanceMs = 2350); save("10-onb-intro-c-eyes-on") }
    @Test fun onb_intro_d_typing() { onb(0, advanceMs = 3150); save("10-onb-intro-d-typing") }
    @Test fun onb_intro_e_done() { onb(0, advanceMs = 5600); save("10-onb-intro-e-done") }
    @Test fun onb_feature_1() { onb(1, 0); save("11-onb-feature-1-private-ai") }
    @Test fun onb_feature_2() { onb(1, 1); save("11-onb-feature-2-linux") }
    @Test fun onb_feature_3() { onb(1, 2); save("11-onb-feature-3-apps") }
    @Test fun onb_perm_notifications() { onb(2); save("12-onb-perm-1-notifications") }
    @Test fun onb_perm_accessibility() { onb(3); save("12-onb-perm-2-accessibility") }
    @Test fun onb_perm_accessibility_granted() { onb(3, statuses = allMissing + (PermissionKind.ACCESSIBILITY to PermStatus.GRANTED)); save("12-onb-perm-2b-accessibility-granted") }
    @Test fun onb_perm_shizuku() { onb(4); save("12-onb-perm-3-shizuku-not-installed") }
    @Test fun onb_perm_shizuku_running() { onb(4, statuses = allMissing + (PermissionKind.SHIZUKU to PermStatus.NOT_RUNNING)); save("12-onb-perm-3b-shizuku-not-running") }
    @Test fun onb_perm_battery() { onb(5); save("12-onb-perm-4-battery") }
    @Test fun onb_ready() {
        flow<EnvState>(app.env, "_state").value = EnvState.NotInstalled
        onb(6, statuses = allMissing + (PermissionKind.NOTIFICATIONS to PermStatus.GRANTED) + (PermissionKind.ACCESSIBILITY to PermStatus.GRANTED))
        save("13-onb-ready")
    }
    @Test fun onb_ready_progress() {
        flow<EnvState>(app.env, "_state").value = EnvState.Installing("تنزيل Alpine rootfs…", 0.63f)
        flow<DownloadState?>(app.models, "_download").value = DownloadState("qwen2.5-3b-instruct-q4_k_m.gguf", 760_000_000L, 2_100_000_000L, running = true)
        onb(6, statuses = PermissionKind.entries.associateWith { PermStatus.GRANTED })
        save("13-onb-ready-b-progress")
    }
    @Test fun onb_ready_celebrate() {
        flow<EnvState>(app.env, "_state").value = EnvState.Ready
        readyModel()
        onb(6, statuses = PermissionKind.entries.associateWith { PermStatus.GRANTED }, celebrate = true, advanceMs = 900)
        save("13-onb-ready-c-celebrate")
    }

    @Test fun chat_streaming_tool() {
        readyModel()
        flow<List<ChatItem>>(app.agent, "_items").value = listOf(item(ItemKind.USER, "ثبّت git"))
        flow<Boolean>(app.agent, "_running").value = true
        flow<String>(app.agent, "_streaming").value = "{\"tool\": \"run_shell\", \"args\": {\"cmd\": \"apk add git"
        show(0); save("14-chat-streaming-tool-chip")
    }

    /* ------------------------------------------------------------ v1.3 */

    private fun guide(status: PermStatus, expanded: Set<Int>) {
        rule.mainClock.autoAdvance = false
        rule.setContent {
            WakilTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    com.wakil.agent.ui.ShizukuGuideScreen(app, onBack = {}, statusOverride = status, expanded = expanded)
                }
            }
        }
        rule.mainClock.advanceTimeBy(1500)
    }
    @Test fun guide_not_installed() { guide(PermStatus.NOT_INSTALLED, setOf(1)); save("15-shizuku-guide-a-not-installed") }
    @Test fun guide_not_running() { guide(PermStatus.NOT_RUNNING, setOf(3)); save("15-shizuku-guide-b-not-running") }
    @Test fun guide_no_permission() { guide(PermStatus.MISSING, setOf(4)); save("15-shizuku-guide-c-no-permission") }
    @Test fun guide_ready() { guide(PermStatus.GRANTED, emptySet()); save("15-shizuku-guide-d-ready") }
    @Test @Config(qualifiers = "w400dp-h5200dp-xxhdpi") fun guide_full() { guide(PermStatus.NOT_INSTALLED, (0..8).toSet()); save("15-shizuku-guide-e-full") }

    private fun robotOnly(content: @androidx.compose.runtime.Composable () -> Unit, ms: Long = 1500) {
        rule.mainClock.autoAdvance = false
        rule.setContent {
            WakilTheme {
                androidx.compose.foundation.layout.Box(
                    androidx.compose.ui.Modifier.fillMaxSize().then(androidx.compose.ui.Modifier.background(androidx.compose.ui.graphics.Color.Black)),
                    contentAlignment = androidx.compose.ui.Alignment.Center
                ) { content() }
            }
        }
        rule.mainClock.advanceTimeBy(ms)
    }
    @Test @Config(qualifiers = "w420dp-h420dp-xxhdpi") fun robot_closeup() {
        robotOnly({ com.wakil.agent.ui.components.WakilRobot(400.dp) }); save("20-robot-closeup")
    }
    @Test @Config(qualifiers = "w420dp-h420dp-xxhdpi") fun robot_closeup_think() {
        robotOnly({ com.wakil.agent.ui.components.WakilRobot(400.dp, mood = com.wakil.agent.ui.components.RobotMood.THINK) }); save("20-robot-closeup-think")
    }
    @Test @Config(qualifiers = "w420dp-h420dp-xxhdpi") fun robot_closeup_celebrate() {
        robotOnly({ com.wakil.agent.ui.components.WakilRobot(400.dp, mood = com.wakil.agent.ui.components.RobotMood.CELEBRATE) }); save("20-robot-closeup-celebrate")
    }
    @Test @Config(qualifiers = "w200dp-h200dp-xxhdpi") fun robot_avatar() {
        robotOnly({ com.wakil.agent.ui.components.WakilRobot(160.dp, detail = false) }); save("21-robot-avatar")
    }

    @Test fun splash() { show(0, splash = true, advanceMs = 700); save("00-splash") }

    @Test fun github_connect() { app.prefs.ghToken = ""; show(3); save("50-github-connect") }

    private fun editor(name: String, file: String, code: String, caretAfter: String) {
        val st = com.wakil.agent.ui.code.CodeEditorState(code, com.wakil.agent.ui.code.Lang.of(file))
        val i = code.indexOf(caretAfter) + caretAfter.length
        st.value = st.value.copy(selection = androidx.compose.ui.text.TextRange(i))
        rule.mainClock.autoAdvance = false
        rule.setContent {
            WakilTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black)) {
                        com.wakil.agent.ui.code.CodeEditor(st, androidx.compose.ui.Modifier.fillMaxSize())
                    }
                }
            }
        }
        rule.mainClock.advanceTimeBy(1200)
        save(name)
    }

    @Test fun editor_kotlin() = editor("51-editor-kotlin", "MainActivity.kt", """package com.wakil.myapp

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

// الشاشة الرئيسية
class MainActivity : Activity() {
    private var count = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val title = findViewById<TextView>(R.id.title)
        title.text = "ضغطت ${'$'}count مرة"
        val total = 42 + 0.5f
        tit
    }
}""", "        tit")

    @Test fun editor_dart() = editor("52-editor-dart", "main.dart", """import 'package:flutter/material.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'تطبيقي',
      home: Scaffold(body: Center(child: Text('مرحباً'))),
    );
  }
}
st""", "\nst")

    @Test fun editor_html() = editor("53-editor-html", "index.html", """<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تطبيقي</title>
  <style>
    .card { color: #00e5ff; padding: 24px; }
  </style>
</head>
<body>
  <!-- البطاقة -->
  <main class="card">
    <button id="btn">اضغطني</button>
  </main>
  <script>
    document.getElementById('btn').addEventListener('click', () => alert(1));
  </script>
</body>
</html>""", "<main class=\"card\">")
}
