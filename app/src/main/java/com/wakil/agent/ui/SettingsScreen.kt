package com.wakil.agent.ui

import kotlinx.coroutines.launch
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.AddToHomeScreen
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import com.wakil.agent.BuildConfig
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.Neon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.wakil.agent.Prefs
import com.wakil.agent.ToolPolicy
import com.wakil.agent.WakilApp
import com.wakil.agent.access.WakilAccessibilityService
import com.wakil.agent.priv.RootShell
import com.wakil.agent.priv.ShizukuShell
import com.wakil.agent.priv.ShizukuStatus
import com.wakil.agent.onboarding.PermStatus
import com.wakil.agent.onboarding.PermissionKind
import com.wakil.agent.onboarding.WakilPermissions
import androidx.compose.foundation.clickable
import androidx.compose.material3.Icon
import androidx.compose.ui.text.style.TextOverflow

@Composable
private fun Section(title: String, icon: ImageVector, accent: Color = Neon.Cyan, content: @Composable ColumnScope.() -> Unit) {
    GlassCard(Modifier.fillMaxWidth()) {
        HudTitle(title, icon = icon, color = accent)
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = if (enabled) Neon.Text else Neon.TextFaint)
        Spacer(Modifier.width(10.dp))
        NeonSwitch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

/** Status line with a pulsing green/amber/red dot. */
@Composable
private fun StatusRow(text: String, color: Color, pulsing: Boolean = true) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(color.copy(alpha = 0.07f))
            .border(1.dp, color.copy(alpha = 0.25f), RoundedCornerShape(14.dp)).padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        PulseDot(color, size = 8.dp, pulsing = pulsing)
        Spacer(Modifier.width(4.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = Neon.Text)
    }
}

@Composable
private fun IntField(label: String, value: Int, onChange: (Int) -> Unit) {
    var t by remember(value) { mutableStateOf(value.toString()) }
    NeonTextField(
        value = t, onValueChange = { t = it; it.toIntOrNull()?.let(onChange) },
        label = label, mono = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
    )
}

private val TOOL_LABELS = mapOf(
    "run_shell" to "تشغيل أوامر لينكس", "write_file" to "كتابة ملف", "read_file" to "قراءة ملف",
    "list_apps" to "عرض التطبيقات", "open_app" to "فتح تطبيق", "read_screen" to "قراءة الشاشة",
    "tap_text" to "نقر على نص", "tap_xy" to "نقر بإحداثيات", "type_text" to "كتابة نص",
    "scroll" to "تمرير", "back" to "رجوع", "home" to "الشاشة الرئيسية",
    "sys_shell" to "أوامر النظام (Shizuku)", "root_shell" to "أوامر root (su)",
    "install_apk" to "تثبيت APK", "gh_repos" to "GitHub: المستودعات", "gh_read" to "GitHub: قراءة",
    "gh_write" to "GitHub: تعديل ملف", "gh_build" to "GitHub: بناء APK", "gh_runs" to "GitHub: حالة البناء",
    "gh_install" to "GitHub: تثبيت APK", "gh_tree" to "GitHub: كل الملفات", "gh_create" to "GitHub: إنشاء مشروع",
    "gh_write_files" to "GitHub: تعديل عدة ملفات", "gh_build_wait" to "GitHub: بناء وانتظار النتيجة",
    "web_search" to "البحث في الإنترنت", "web_fetch" to "قراءة صفحة ويب", "plan" to "خطة المهمة",
    "memory_save" to "حفظ في الذاكرة", "memory_delete" to "حذف من الذاكرة", "device_info" to "معلومات الجهاز",
    "clipboard_get" to "قراءة الحافظة", "clipboard_set" to "نسخ للحافظة", "notify" to "إرسال إشعار",
    "phone_files" to "ملفات الهاتف", "schedule_task" to "جدولة مهمة", "list_tasks" to "عرض المهام المجدولة", "cancel_task" to "إلغاء مهمة مجدولة",
)

@Composable
fun SettingsScreen(app: WakilApp, onReplayIntro: () -> Unit = {}, onOpenShizukuGuide: () -> Unit = {}) {
    val p = app.prefs
    val ctx = LocalContext.current
    var tick by remember { mutableIntStateOf(0) } // forces recomposition after pref changes
    val shizuku by ShizukuShell.status.collectAsState()
    var a11yOn by remember { mutableStateOf(WakilAccessibilityService.instance != null) }
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            if (e == Lifecycle.Event.ON_RESUME) {
                if (p.bubbleOn && Settings.canDrawOverlays(ctx) && !com.wakil.agent.bubble.BubbleService.running) com.wakil.agent.bubble.BubbleService.start(ctx)
                ShizukuShell.refresh(); a11yOn = WakilAccessibilityService.instance != null; tick++ }
        }
        lifecycle.lifecycle.addObserver(obs)
        onDispose { lifecycle.lifecycle.removeObserver(obs) }
    }
    key(tick) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ScreenHeader("الإعدادات", subtitle = "الأذونات · المحرّك · البيئة")

            PermissionsPanel(tick)

            Section("التحكم بالشاشة (خدمة الوصول)", Icons.Filled.Accessibility) {
                StatusRow(if (a11yOn) "مفعّلة ✓" else "غير مفعّلة — لازمة لقراءة الشاشة والنقر (إن لم يتوفر Shizuku).", if (a11yOn) Neon.Green else Neon.Red)
                GlowButton("فتح إعدادات الوصول", { ctx.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) },
                    Modifier.fillMaxWidth(), icon = Icons.AutoMirrored.Filled.OpenInNew)
            }

            Section("الأصوات", Icons.AutoMirrored.Filled.VolumeUp, Neon.Cyan) {
                SwitchRow("الأصوات (نقرات وأصوات الروبوت)", p.soundsEnabled) { p.soundsEnabled = it; tick++ }
                var vol by remember { mutableStateOf(p.soundVolume) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("مستوى الصوت", style = MaterialTheme.typography.bodyMedium, color = if (p.soundsEnabled) Neon.Text else Neon.TextFaint, modifier = Modifier.weight(1f))
                    Badge("${(vol * 100).toInt()}%", Neon.Cyan)
                }
                Slider(
                    value = vol, onValueChange = { vol = it; p.soundVolume = it }, valueRange = 0f..1f, enabled = p.soundsEnabled,
                    onValueChangeFinished = { com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.CONFIRM) },
                    colors = SliderDefaults.colors(thumbColor = Neon.Cyan, activeTrackColor = Neon.Cyan, inactiveTrackColor = Color.White.copy(alpha = 0.12f))
                )
                SwitchRow("صوت الترحيب", p.welcomeVoice, enabled = p.soundsEnabled) { p.welcomeVoice = it; tick++ }
                Text("لا تُشغَّل الأصوات عندما يكون الهاتف على الصامت أو الاهتزاز.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GhostButton("تجربة الأصوات", { com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.POWER_ON) }, Modifier.weight(1f), enabled = p.soundsEnabled, icon = Icons.Filled.GraphicEq)
                    GhostButton("سماع الترحيب", { com.wakil.agent.audio.Sfx.welcome() }, Modifier.weight(1f), enabled = p.soundsEnabled && p.welcomeVoice, color = Neon.Violet, icon = Icons.Filled.RecordVoiceOver)
                }
            }

            Section("المساعد الصوتي والفقاعة", Icons.Filled.RecordVoiceOver, Neon.Blue) {
                SwitchRow("قراءة كل الردود بصوت", p.speakReplies) { p.speakReplies = it; tick++; if (!it) com.wakil.agent.audio.Speech.stop() }
                Text("زر الميكروفون في المحادثة يسمعك، والرد على الطلب الصوتي يُقرأ دائماً.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                GhostButton("تجربة الصوت", { com.wakil.agent.audio.Speech.speak("أهلاً، أنا وكيل. جاهز لخدمتك.") }, Modifier.fillMaxWidth(), icon = Icons.Filled.GraphicEq)
                val canOverlay = Settings.canDrawOverlays(ctx)
                SwitchRow("الفقاعة العائمة فوق التطبيقات", p.bubbleOn && canOverlay && com.wakil.agent.bubble.BubbleService.running) { on ->
                    if (on && !Settings.canDrawOverlays(ctx)) {
                        p.bubbleOn = true
                        ctx.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    } else {
                        p.bubbleOn = on
                        if (on) com.wakil.agent.bubble.BubbleService.start(ctx) else com.wakil.agent.bubble.BubbleService.stop(ctx)
                    }
                    tick++
                }
                Text(if (canOverlay) "اسحب الفقاعة لأي مكان، واضغطها لتكتب أو تتكلّم من داخل أي تطبيق."
                     else "تحتاج إذن «الظهور فوق التطبيقات». فعّل المفتاح وسيفتح لك الإعداد.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                SwitchRow("حفظ المحادثات بعد إغلاق التطبيق", p.saveChats) { p.saveChats = it; tick++ }
                WakeWordRow(app) { tick++ }
            }

            OfflineVoiceSection(app)

            ThemeSection(app)
            ShortcutsSection(app)
            BackupSection(app)

            Section("الوضع المميّز (Shizuku)", Icons.Filled.AdminPanelSettings, Neon.Violet) {
                GlowButton("دليل Shizuku · التنزيل والتفعيل", onOpenShizukuGuide, Modifier.fillMaxWidth(), icon = Icons.AutoMirrored.Filled.MenuBook,
                    colors = listOf(Neon.Magenta, Neon.Violet, Neon.Blue))
                SwitchRow("تفعيل Shizuku (أداة sys_shell)", p.shizukuEnabled) { p.shizukuEnabled = it; if (it) ShizukuShell.requestPermission(); tick++ }
                val st = when (shizuku) {
                    ShizukuStatus.NOT_RUNNING -> "Shizuku غير مثبت أو غير مُشغَّل"
                    ShizukuStatus.NO_PERMISSION -> "Shizuku يعمل لكن لم يُمنح الإذن"
                    ShizukuStatus.UNSUPPORTED -> "إصدار Shizuku قديم جداً (حدّثه)"
                    ShizukuStatus.READY -> "جاهز ✓ (uid ${ShizukuShell.serverUid()}${if (ShizukuShell.serverUid() == 0) " = root" else " = adb shell"})"
                }
                StatusRow("الحالة: $st", when (shizuku) {
                    ShizukuStatus.READY -> Neon.Green
                    ShizukuStatus.NO_PERMISSION -> Neon.Amber
                    else -> Neon.Red
                })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GhostButton("طلب الإذن", { ShizukuShell.requestPermission() }, Modifier.weight(1f), enabled = shizuku == ShizukuStatus.NO_PERMISSION, color = Neon.Violet, icon = Icons.Filled.Key)
                    GhostButton("تحديث", { ShizukuShell.refresh() }, Modifier.weight(1f), icon = Icons.Filled.Refresh)
                }
                SwitchRow("تفضيل Shizuku لإجراءات الشاشة", p.preferShizukuForScreen) { p.preferShizukuForScreen = it; tick++ }
            }

            Section("Root حقيقي (su)", Icons.Filled.Security, Neon.Magenta) {
                val su = RootShell.suPath()
                StatusRow(if (su != null) "تم العثور على su: $su" else "لا يوجد su — الجهاز غير مروّت؛ أداة root_shell معطّلة.", if (su != null) Neon.Green else Neon.Red, pulsing = su != null)
                SwitchRow("تفعيل أداة root_shell", p.rootEnabled && su != null, enabled = su != null) { p.rootEnabled = it; tick++ }
            }

            Section("شخصية الوكيل وتعليماتك", Icons.Filled.Tune, Neon.Cyan) {
                var instr by remember { mutableStateOf(p.customInstructions) }
                Text("تعليمات دائمة يتبعها الوكيل في كل محادثة، مثل: «نادني أبو فلان، ردودك قصيرة، اكتب الكود بـ Kotlin».",
                    style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                androidx.compose.material3.OutlinedTextField(
                    value = instr, onValueChange = { instr = it.take(2000); p.customInstructions = instr },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp), placeholder = { Text("اكتب تعليماتك هنا…", color = Neon.TextFaint) },
                    colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                        focusedTextColor = Neon.Text, unfocusedTextColor = Neon.Text,
                        focusedBorderColor = Neon.Cyan, unfocusedBorderColor = Color.White.copy(alpha = 0.15f), cursorColor = Neon.Cyan),
                )
            }

            Section("ملفات الهاتف", Icons.Filled.FolderOpen, Neon.Green) {
                val ok = com.wakil.agent.extra.PhoneFiles.hasAccess()
                StatusRow(if (ok) "الوكيل يستطيع قراءة وتنظيم ملفاتك (التنزيلات، الصور، المستندات) ✓" else "غير مفعّل: اسمح بـ«الوصول إلى كل الملفات» ليتمكن الوكيل من ملفات الهاتف.",
                    if (ok) Neon.Green else Neon.Amber, pulsing = ok)
                if (!ok && android.os.Build.VERSION.SDK_INT >= 30) GlowButton("منح الوصول إلى كل الملفات", {
                    runCatching { ctx.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, android.net.Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                        .onFailure { ctx.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }, Modifier.fillMaxWidth(), icon = Icons.Filled.FolderOpen)
                Text("مشاركة سريعة: من أي تطبيق اختر «مشاركة» ثم «اسأل وكيل»، أو حدّد نصاً واختر «اسأل وكيل». وأضف زر «وكيل» لشريط الإعدادات السريعة لتكلّمه بضغطة.",
                    style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
            }

            MemoryAndTasksSection(app)

            Section("الوصول الكامل", Icons.Filled.Bolt, Neon.Red) {
                var askFull by remember { mutableStateOf(false) }
                Text(
                    "يعمل الوكيل وحده من البداية للنهاية: ينفّذ كل الأدوات بدون سؤال (أوامر، ملفات، الشاشة، GitHub، التثبيت)، " +
                        "ويحصل على 80 خطوة على الأقل ليبني ويختبر ويصلح الأخطاء بنفسه.",
                    color = Neon.TextDim, style = MaterialTheme.typography.bodySmall
                )
                SwitchRow("منح الوكيل الوصول الكامل", p.fullAccess) { on -> if (on) askFull = true else { p.fullAccess = false; tick++ } }
                if (askFull) androidx.compose.material3.AlertDialog(
                    onDismissRequest = { askFull = false }, containerColor = Color(0xFF0B1120),
                    title = { Text("تفعيل الوصول الكامل؟", color = Neon.Text) },
                    text = { Text("لن يطلب الوكيل إذنك قبل أي إجراء، بما فيها حذف الملفات والنقر في التطبيقات الأخرى وتعديل مستودعاتك. يمكنك إيقافه بزر الإيقاف في المحادثة أو من هنا في أي وقت.", color = Neon.TextDim) },
                    confirmButton = { androidx.compose.material3.TextButton(onClick = { p.fullAccess = true; askFull = false; tick++ }) { Text("تفعيل", color = Neon.Red) } },
                    dismissButton = { androidx.compose.material3.TextButton(onClick = { askFull = false }) { Text("إلغاء", color = Neon.TextDim) } }
                )
            }

            Section("أذونات الأدوات", Icons.Filled.Shield, Neon.Amber) {
                if (p.fullAccess) Text("الوصول الكامل مفعّل: كل الأدوات مسموحة.", color = Neon.Red, style = MaterialTheme.typography.bodySmall)
                val opts = listOf(ToolPolicy.ALLOW to "سماح", ToolPolicy.ASK to "سؤال", ToolPolicy.DENY to "منع")
                Prefs.DEFAULT_POLICY.keys.forEach { tool ->
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(TOOL_LABELS[tool] ?: tool, style = MaterialTheme.typography.bodyMedium, color = Neon.Text, modifier = Modifier.weight(1f))
                            Text(tool, fontFamily = JetMono, fontSize = 11.sp, color = Neon.TextFaint)
                        }
                        NeonSegmented(opts, p.policy(tool), listOf(Neon.Green, Neon.Amber, Neon.Red), onSelect = { pol -> p.setPolicy(tool, pol); tick++ }, modifier = Modifier.fillMaxWidth())
                    }
                }
            }

            Section("المحرّك", Icons.Filled.Hub, Neon.Blue) {
                val modes = listOf("local" to "محلي", "hybrid" to "ذكي", "openai" to "سحابي")
                NeonSegmented(modes, p.backend, listOf(Neon.Green, Neon.Cyan, Neon.Violet), onSelect = { m -> p.backend = m; tick++ }, modifier = Modifier.fillMaxWidth())
                Text(when (p.backend) {
                    "hybrid" -> "ذكي: المهام اليومية على الجوال، والبرمجة والمهام الكبيرة أو المتعثرة تذهب للنموذج السحابي (يحتاج مفتاح API)."
                    "openai" -> "كل شيء عبر الخادم السحابي."
                    else -> "كل شيء على الجوال، بدون إنترنت."
                }, style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                var base by remember { mutableStateOf(p.openAiBaseUrl) }
                NeonTextField(base, { base = it; p.openAiBaseUrl = it.trim() }, "Base URL (مثل https://api.openai.com/v1)", mono = true)
                var key by remember { mutableStateOf(p.openAiKey) }
                NeonTextField(key, { key = it; p.openAiKey = it.trim() }, "API Key", mono = true, visualTransformation = PasswordVisualTransformation())
                var model by remember { mutableStateOf(p.openAiModel) }
                NeonTextField(model, { model = it; p.openAiModel = it.trim() }, "اسم النموذج", mono = true)
            }

            Section("النموذج المحلي والوكيل", Icons.Filled.Tune) {
                IntField("حجم السياق (n_ctx) — يُطبَّق عند إعادة التحميل", p.nCtx) { p.nCtx = it.coerceIn(512, 32768) }
                IntField("عدد الخيوط (0 = تلقائي: ${com.wakil.agent.llm.CpuInfo.bestThreads()} أنوية قوية)", p.nThreads) { p.nThreads = it.coerceIn(0, 8) }
                IntField("طبقات النموذج على المعالج الرسومي GPU (0 = إيقاف، 999 = أقصى تسريع — يعمل عند إعادة تحميل النموذج)", p.gpuLayers) { p.gpuLayers = it.coerceIn(0, 999) }
                SwitchRow("التوليد التخميني السريع (يُطبَّق عند إعادة التحميل)", p.fastLookup) { p.fastLookup = it; tick++ }
                IntField("أقصى عدد رموز للرد", p.maxNewTokens) { p.maxNewTokens = it.coerceIn(64, 4096) }
                IntField("أقصى عدد خطوات للوكيل", p.maxSteps) { p.maxSteps = it.coerceIn(1, 100) }
                IntField("مهلة أوامر الشل (ثوانٍ)", p.shellTimeoutSec) { p.shellTimeoutSec = it.coerceIn(5, 3600) }
                IntField("حد طول المخرجات (حروف)", p.outputLimit) { p.outputLimit = it.coerceIn(500, 50000) }
                var temp by remember { mutableStateOf(p.temperature) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("الحرارة", style = MaterialTheme.typography.bodyMedium, color = Neon.Text, modifier = Modifier.weight(1f))
                    Badge("%.2f".format(temp), Neon.Cyan)
                }
                Slider(
                    value = temp, onValueChange = { temp = it; p.temperature = it }, valueRange = 0f..1.2f,
                    colors = SliderDefaults.colors(thumbColor = Neon.Cyan, activeTrackColor = Neon.Cyan, inactiveTrackColor = Color.White.copy(alpha = 0.12f))
                )
                SwitchRow("تحميل آخر نموذج تلقائياً عند الفتح", p.autoLoadModel) { p.autoLoadModel = it; tick++ }
            }

            Section("بيئة لينكس", Icons.Filled.Terminal, Neon.Green) {
                var url by remember { mutableStateOf(p.rootfsUrl) }
                NeonTextField(url, { url = it; p.rootfsUrl = it.trim() }, "رابط rootfs (Alpine aarch64)", mono = true)
                SwitchRow("PROOT_NO_SECCOMP (فعّله إن فشل proot)", p.prootNoSeccomp) { p.prootNoSeccomp = it; tick++ }
                GhostButton("حذف البيئة وإعادة ضبطها", { app.env.reset() }, Modifier.fillMaxWidth(), color = Neon.Red, icon = Icons.Filled.RestartAlt)
            }
            GhostButton("إعادة عرض المقدمة والأذونات", onReplayIntro, Modifier.fillMaxWidth(), color = Neon.Violet, icon = Icons.Filled.Replay)
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                WakilRobot(64.dp, detail = false, animated = false)
                Text("وكيل ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelLarge, color = Neon.Cyan)
                Text(app.agent.tools.statusLine(), style = MaterialTheme.typography.labelSmall, color = Neon.TextFaint, textAlign = TextAlign.Center)
            }
        }
    }
}


/** Live overview of every permission Wakil uses, each row tappable to fix it. Re-read on resume (via [tick]). */
@Composable
private fun PermissionsPanel(tick: Int) {
    val ctx = LocalContext.current
    val kinds = remember { WakilPermissions.steps() }
    val st = remember(tick) { kinds.associateWith { WakilPermissions.status(ctx, it) } }
    val granted = st.values.count { it == PermStatus.GRANTED }
    Section("حالة الأذونات", Icons.Filled.VerifiedUser, if (granted == kinds.size) Neon.Green else Neon.Cyan) {
        kinds.forEach { k ->
            val s = st[k] ?: PermStatus.MISSING
            val ok = s == PermStatus.GRANTED
            val c = if (ok) Neon.Green else if (k.optional) Neon.TextDim else Neon.Amber
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(c.copy(alpha = 0.06f))
                    .border(1.dp, c.copy(alpha = 0.22f), RoundedCornerShape(14.dp))
                    .clickable(enabled = !ok) {
                        when (k) {
                            PermissionKind.NOTIFICATIONS -> WakilPermissions.openAppNotificationSettings(ctx)
                            PermissionKind.ACCESSIBILITY -> WakilPermissions.openAccessibility(ctx)
                            PermissionKind.BATTERY -> WakilPermissions.requestBatteryExemption(ctx)
                            PermissionKind.SHIZUKU -> when (s) {
                                PermStatus.NOT_INSTALLED -> WakilPermissions.openUrl(ctx, WakilPermissions.SHIZUKU_URL)
                                PermStatus.NOT_RUNNING -> WakilPermissions.openShizuku(ctx)
                                else -> ShizukuShell.requestPermission()
                            }
                        }
                    }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(k.icon, null, tint = c, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text(k.title, style = MaterialTheme.typography.bodyMedium, color = Neon.Text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    when (s) {
                        PermStatus.GRANTED -> "ممنوح"
                        PermStatus.NOT_INSTALLED -> "غير مثبّت"
                        PermStatus.NOT_RUNNING -> "متوقف"
                        PermStatus.MISSING -> if (k.optional) "اختياري" else "مطلوب"
                    }, style = MaterialTheme.typography.labelMedium, color = c
                )
                Spacer(Modifier.width(6.dp))
                Icon(if (ok) Icons.Filled.CheckCircle else Icons.Filled.ChevronLeft, null, tint = c, modifier = Modifier.size(18.dp))
            }
        }
    }
}


@Composable
private fun MemoryAndTasksSection(app: WakilApp) {
    val notes by app.memory.notes.collectAsState()
    val tasks by app.scheduler.tasks.collectAsState()
    val ctx = LocalContext.current
    val fmt = remember { java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US) }
    Section("ذاكرة الوكيل", Icons.Filled.Psychology, Neon.Violet) {
        Text("يحفظ الوكيل هنا ما يتعلّمه عنك وعن مشاريعك ويتذكّره في كل محادثة. قل له «تذكّر أن…».",
            style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
        if (notes.isEmpty()) StatusRow("لا توجد ذكريات بعد", Neon.TextDim, pulsing = false)
        notes.takeLast(30).reversed().forEach { n ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("#${n.id}  ${n.text}", style = MaterialTheme.typography.bodyMedium, color = Neon.Text, modifier = Modifier.weight(1f))
                androidx.compose.material3.IconButton(onClick = { app.memory.remove(n.id) }) {
                    Icon(Icons.Filled.Close, "حذف", tint = Neon.TextFaint)
                }
            }
        }
        if (notes.isNotEmpty()) GhostButton("مسح الذاكرة كلها", { app.memory.clear() }, Modifier.fillMaxWidth(), color = Neon.Red, icon = Icons.Filled.DeleteSweep)
    }
    Section("المهام المجدولة", Icons.Filled.Alarm, Neon.Amber) {
        Text("اطلب من الوكيل مثلاً: «كل يوم الساعة 8 صباحاً لخّص لي أخبار التقنية» أو «كل ما أشبك الشاحن اعرض لي حالة البطارية» وسينفّذها وحده ويرسل النتيجة إشعاراً.",
            style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
        if (tasks.isEmpty()) StatusRow("لا توجد مهام مجدولة", Neon.TextDim, pulsing = false)
        tasks.forEach { t ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(t.title, style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                    val rep = when {
                        t.repeat == "daily" -> "يومياً"
                        t.repeat == "hourly" -> "كل ساعة"
                        t.repeat.startsWith("every:") -> "كل ${t.repeat.removePrefix("every:")} دقيقة"
                        t.repeat.startsWith("on:") -> com.wakil.agent.extra.Scheduler.eventLabel(t.repeat)
                        else -> "مرة واحدة"
                    }
                    Text(if (t.repeat.startsWith("on:")) "⚡ $rep" else "${fmt.format(java.util.Date(t.nextAt))} · $rep", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                }
                androidx.compose.material3.IconButton(onClick = { app.scheduler.cancel(t.id) }) {
                    Icon(Icons.Filled.Close, "إلغاء", tint = Neon.TextFaint)
                }
            }
        }
        if (!app.scheduler.canExact() && android.os.Build.VERSION.SDK_INT >= 31) {
            Text("للتوقيت الدقيق اسمح لوكيل بـ«المنبّهات والتذكيرات».", style = MaterialTheme.typography.bodySmall, color = Neon.Amber)
            GhostButton("فتح الإذن", {
                runCatching { ctx.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, android.net.Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }, Modifier.fillMaxWidth(), color = Neon.Amber, icon = Icons.AutoMirrored.Filled.OpenInNew)
        }
    }
}


@Composable
private fun WakeWordRow(app: WakilApp, onChange: () -> Unit) {
    val ctx = LocalContext.current
    // The pref is the truth: the service sets `running` a moment after it starts, which used to show "off" while it listened.
    var on by remember { mutableStateOf(app.prefs.wakeWord) }
    val ask = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) { app.prefs.wakeWord = true; com.wakil.agent.audio.WakeService.start(ctx); on = true; onChange() }
    }
    SwitchRow("كلمة التنبيه «يا وكيل» (تجريبي)", on) { v ->
        if (v && !com.wakil.agent.audio.OfflineVoice.ready()) {
            android.widget.Toast.makeText(ctx, "نزّل أولاً «كاشف الكلام» ونموذج Whisper من قسم «الصوت بدون إنترنت»؛ كلمة التنبيه تعمل عليه فقط.", android.widget.Toast.LENGTH_LONG).show()
        } else if (v) {
            if (ctx.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) ask.launch(android.Manifest.permission.RECORD_AUDIO)
            else { app.prefs.wakeWord = true; com.wakil.agent.audio.WakeService.start(ctx); on = true }
        } else { app.prefs.wakeWord = false; com.wakil.agent.audio.WakeService.stop(ctx); on = false }
        onChange()
    }
    Text("قل «يا وكيل» ثم طلبك، مثل «يا وكيل افتح يوتيوب». يعمل بدون إنترنت على حزمة Whisper (بلا صفير)، ويستهلك بعض البطارية في الخلفية.",
        style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
}

@Composable
private fun ThemeSection(app: WakilApp) {
    Section("الثيم والألوان", Icons.Filled.Palette, Neon.Magenta) {
        com.wakil.agent.ui.theme.Palettes.all.forEach { pal ->
            val sel = Neon.palette.id == pal.id
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                    .background(if (sel) pal.cyan.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.03f))
                    .border(1.dp, if (sel) pal.cyan else Color.White.copy(alpha = 0.08f), RoundedCornerShape(14.dp))
                    .clickable { Neon.palette = pal; app.prefs.theme = pal.id; com.wakil.agent.audio.Sfx.play(com.wakil.agent.audio.Sound.TOGGLE) }
                    .padding(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                listOf(pal.cyan, pal.blue, pal.violet, pal.magenta).forEach { c ->
                    Box(Modifier.padding(end = 4.dp).size(18.dp).clip(androidx.compose.foundation.shape.CircleShape).background(c))
                }
                Spacer(Modifier.width(8.dp))
                androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                    Text(pal.name, style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                    pal.source?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Neon.TextFaint) }
                }
                if (sel) Icon(Icons.Filled.Check, null, tint = pal.cyan)
            }
        }
    }
}

@Composable
private fun ShortcutsSection(app: WakilApp) {
    val items by app.shortcuts.items.collectAsState()
    val ctx = LocalContext.current
    var title by remember { mutableStateOf("") }
    var prompt by remember { mutableStateOf("") }
    Section("الاختصارات", Icons.Filled.Bolt, Neon.Amber) {
        Text("احفظ مهمة تكررها وشغّلها بضغطة، أو ثبّتها كأيقونة على الشاشة الرئيسية. أول 4 تظهر عند الضغط المطوّل على أيقونة وكيل.",
            style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
        items.forEach { sc ->
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.03f))
                    .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(14.dp)).padding(10.dp)
            ) {
                Text(sc.title, style = MaterialTheme.typography.titleSmall, color = Neon.Text)
                Text(sc.prompt, style = MaterialTheme.typography.bodySmall, color = Neon.TextDim, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    GhostButton("تشغيل", { ctx.startActivity(com.wakil.agent.extra.Shortcuts.runIntent(ctx, sc.prompt)) }, Modifier.weight(1f), color = Neon.Green, icon = Icons.Filled.PlayArrow)
                    GhostButton("للشاشة", {
                        if (!app.shortcuts.pin(sc)) android.widget.Toast.makeText(ctx, "الشاشة الرئيسية لا تدعم تثبيت الاختصارات", android.widget.Toast.LENGTH_LONG).show()
                    }, Modifier.weight(1f), icon = Icons.AutoMirrored.Filled.AddToHomeScreen)
                    androidx.compose.material3.IconButton(onClick = { app.shortcuts.remove(sc.id) }) { Icon(Icons.Filled.Close, "حذف", tint = Neon.TextFaint) }
                }
            }
        }
        NeonTextField(title, { title = it }, "اسم الاختصار")
        NeonTextField(prompt, { prompt = it }, "المهمة (مثال: شغّل وضع عدم الإزعاج وافتح سبوتيفاي)")
        GlowButton("حفظ الاختصار", { if (prompt.isNotBlank()) { app.shortcuts.add(title, prompt); title = ""; prompt = "" } },
            Modifier.fillMaxWidth(), enabled = prompt.isNotBlank(), icon = Icons.Filled.Add)
    }
}

@Composable
private fun BackupSection(app: WakilApp) {
    val ctx = LocalContext.current
    var msg by remember { mutableStateOf<String?>(null) }
    val stamp = remember { java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date()) }
    val exporter = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if (uri != null) msg = runCatching { "تم حفظ النسخة (${com.wakil.agent.extra.Backup.export(ctx, uri)} ملف) ✓" }.getOrElse { "فشل الحفظ: ${it.message}" }
    }
    var restored by remember { mutableStateOf(false) }
    val importer = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) runCatching { com.wakil.agent.extra.Backup.import(ctx, uri) }
            .onSuccess { n -> msg = "تمت الاستعادة ($n ملف). أعد تشغيل وكيل لتطبيقها."; restored = true }
            .onFailure { msg = "فشلت الاستعادة: ${it.message}" }
    }
    Section("النسخ الاحتياطي", Icons.Filled.Backup, Neon.Green) {
        Text("صدّر محادثاتك وذاكرة الوكيل والمهام والاختصارات والإعدادات في ملف واحد، واسترجعها بعد إعادة التثبيت أو على جوال آخر. رمز GitHub لا يُصدَّر.",
            style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GlowButton("تصدير", { exporter.launch("wakil-backup-$stamp.zip") }, Modifier.weight(1f), icon = Icons.Filled.Upload)
            GhostButton("استيراد", { importer.launch(arrayOf("application/zip", "application/octet-stream", "*/*")) }, Modifier.weight(1f), icon = Icons.Filled.Download)
        }
        msg?.let { StatusRow(it, if (it.contains("فشل")) Neon.Red else Neon.Green, pulsing = false) }
        if (restored) GhostButton("إعادة التشغيل الآن", {
            val i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            val pi = android.app.PendingIntent.getActivity(ctx, 77, i, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_CANCEL_CURRENT)
            ctx.getSystemService(android.app.AlarmManager::class.java).set(android.app.AlarmManager.RTC, System.currentTimeMillis() + 400, pi)
            Runtime.getRuntime().exit(0)
        }, Modifier.fillMaxWidth(), color = Neon.Amber, icon = Icons.Filled.RestartAlt)
    }
}


@Composable
private fun OfflineVoiceSection(app: WakilApp) {
    val p = app.prefs
    val ov = com.wakil.agent.audio.OfflineVoice
    val prog by ov.progress.collectAsState()
    val ver by ov.version.collectAsState()
    var r by remember { mutableIntStateOf(0) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    key(ver, r) {
        val vadOk = ov.installed(ov.PACKS[0])
        val asrOk = ov.installedOf(com.wakil.agent.audio.PackKind.ASR).isNotEmpty()
        val ttsOk = ov.installedOf(com.wakil.agent.audio.PackKind.TTS).isNotEmpty()
        Section("الصوت بدون إنترنت (sherpa-onnx)", Icons.Filled.GraphicEq, Neon.Violet) {
            Text("وكيل يسمعك ويتكلم داخل جوالك بالكامل: بدون Google وبدون صفير، ويشتغل بدون نت. نزّل كاشف الكلام + نموذج تعرّف + صوت عربي.",
                style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
            ov.PACKS.forEach { pk ->
                val ok = ov.installed(pk)
                val mine = prog?.id == pk.id
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(if (ok) Neon.Green.copy(alpha = 0.06f) else Color.White.copy(alpha = 0.03f))
                        .border(1.dp, if (ok) Neon.Green.copy(alpha = 0.35f) else Color.White.copy(alpha = 0.08f), RoundedCornerShape(14.dp)).padding(10.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(pk.title, style = MaterialTheme.typography.titleSmall, color = Neon.Text, modifier = Modifier.weight(1f))
                        Badge(if (ok) "مثبّت ✓" else "${pk.downloadMb} م.ب", if (ok) Neon.Green else Neon.TextDim)
                    }
                    Text(pk.note, style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                    if (mine) {
                        val pr = prog!!
                        if (pr.error != null) Text("فشل: ${pr.error}", style = MaterialTheme.typography.bodySmall, color = Neon.Red)
                        else {
                            val frac = if (pr.total > 0) (pr.done.toFloat() / pr.total).coerceIn(0f, 1f) else 0f
                            Text("${pr.stage}… ${if (pr.total > 0) "${(frac * 100).toInt()}%" else ""}", style = MaterialTheme.typography.bodySmall, color = Neon.Cyan)
                            androidx.compose.material3.LinearProgressIndicator(progress = { frac }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp), color = Neon.Cyan, trackColor = Color.White.copy(alpha = 0.1f))
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        when {
                            mine && prog?.error == null -> GhostButton("إلغاء", { ov.cancel() }, Modifier.weight(1f), color = Neon.Red, icon = Icons.Filled.Close)
                            ok -> {
                                if (pk.kind == com.wakil.agent.audio.PackKind.TTS) GhostButton("اسمع", {
                                    kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch { runCatching { ov.speak(pk.id, "أهلاً، أنا وكيل. أتكلّم الآن من داخل جوالك بدون إنترنت.", p.ttsSpeed) } }
                                }, Modifier.weight(1f), color = Neon.Violet, icon = Icons.Filled.PlayArrow)
                                GhostButton("حذف", { ov.remove(pk) }, Modifier.weight(1f), color = Neon.Red, icon = Icons.Filled.Delete)
                            }
                            else -> GlowButton("تنزيل", { ov.install(pk, app.models.connections) }, Modifier.fillMaxWidth(), enabled = prog == null || prog?.error != null, icon = Icons.Filled.Download)
                        }
                    }
                }
            }
            if (asrOk) {
                Text("نموذج التعرّف", style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ov.installedOf(com.wakil.agent.audio.PackKind.ASR).forEach { pk ->
                        val sel = p.asrPack == pk.id || (ov.pack(p.asrPack)?.let { ov.installed(it) } != true && pk == ov.installedOf(com.wakil.agent.audio.PackKind.ASR).first())
                        GhostButton(pk.title.substringBefore(" ("), { p.asrPack = pk.id; r++ }, Modifier.weight(1f), color = if (sel) Neon.Green else Neon.TextDim, icon = if (sel) Icons.Filled.Check else null)
                    }
                }
            }
            if (ttsOk) {
                Text("الصوت", style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ov.installedOf(com.wakil.agent.audio.PackKind.TTS).forEach { pk ->
                        val sel = p.ttsPack == pk.id || (ov.pack(p.ttsPack)?.let { ov.installed(it) } != true && pk == ov.installedOf(com.wakil.agent.audio.PackKind.TTS).first())
                        GhostButton(pk.title.substringBefore(" ("), { p.ttsPack = pk.id; r++ }, Modifier.weight(1f), color = if (sel) Neon.Green else Neon.TextDim, icon = if (sel) Icons.Filled.Check else null)
                    }
                }
                var sp by remember { mutableStateOf(p.ttsSpeed) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("سرعة الكلام", style = MaterialTheme.typography.bodyMedium, color = Neon.Text, modifier = Modifier.weight(1f))
                    Badge("${"%.1f".format(sp)}x", Neon.Violet)
                }
                Slider(value = sp, onValueChange = { sp = it; p.ttsSpeed = it }, valueRange = 0.7f..1.5f,
                    colors = SliderDefaults.colors(thumbColor = Neon.Violet, activeTrackColor = Neon.Violet, inactiveTrackColor = Color.White.copy(alpha = 0.12f)))
            }
            SwitchRow("استخدم التعرّف المحلي على الكلام", p.offlineAsr && vadOk && asrOk, enabled = vadOk && asrOk) { p.offlineAsr = it; r++ }
            SwitchRow("استخدم الصوت العربي المحلي للردود", p.offlineTts && ttsOk, enabled = ttsOk) { p.offlineTts = it; r++ }
            Text("يُستخدم في المحادثة الصوتية وفي «يا وكيل». الأفضل: Whisper Small + صوت كريم.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
        }
    }
}
