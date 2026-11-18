package com.wakil.agent.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wakil.agent.WakilApp
import com.wakil.agent.github.*
import com.wakil.agent.ui.code.CodeEditor
import com.wakil.agent.ui.code.CodeEditorState
import com.wakil.agent.ui.code.Lang
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.Neon
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private sealed interface GhNav {
    data object Home : GhNav
    data class Repo(val repo: GhRepo, val tab: Int = 0, val path: String = "") : GhNav
    data class Edit(val repo: GhRepo, val path: String, val back: Repo) : GhNav
    data class Run(val repo: GhRepo, val run: GhRun, val back: Repo) : GhNav
}

private fun openUrl(ctx: android.content.Context, url: String) =
    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }

private fun ago(iso: String): String = runCatching {
    val t = java.time.Instant.parse(iso)
    val m = java.time.Duration.between(t, java.time.Instant.now()).toMinutes()
    when { m < 1 -> "الآن"; m < 60 -> "قبل $m د"; m < 1440 -> "قبل ${m / 60} س"; else -> "قبل ${m / 1440} يوم" }
}.getOrDefault("")

@Composable
fun GitHubScreen(app: WakilApp, onAskAgent: (String) -> Unit = {}) {
    val gh = app.github
    val user by gh.user.collectAsState()
    var connected by remember { mutableStateOf(gh.connected) }
    var nav by remember { mutableStateOf<GhNav>(GhNav.Home) }

    if (!connected) { ConnectView(app) { connected = true }; return }

    BackHandler(nav != GhNav.Home) {
        nav = when (val n = nav) {
            is GhNav.Repo -> if (n.path.isNotEmpty()) n.copy(path = n.path.substringBeforeLast('/', "")) else GhNav.Home
            is GhNav.Edit -> n.back
            is GhNav.Run -> n.back
            else -> GhNav.Home
        }
    }

    AnimatedContent(nav, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "gh",
        contentKey = { it::class }) { n ->
        when (n) {
            GhNav.Home -> HomeView(app, user, onAsk = onAskAgent, onOpen = { nav = GhNav.Repo(it) }, onLogout = { gh.logout(); clearGitHubCookies(); connected = false })
            is GhNav.Repo -> RepoView(app, n, onNav = { nav = it })
            is GhNav.Edit -> EditorView(app, n, onBack = { nav = n.back })
            is GhNav.Run -> RunView(app, n, onAsk = onAskAgent, onBack = { nav = n.back })
        }
    }
}

/* ------------------------------------------------------------------ connect */

@Composable
private fun ConnectView(app: WakilApp, onDone: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var webLogin by remember { mutableStateOf(false) }
    if (webLogin) {
        GhWebLogin(onToken = { t ->
            scope.launch {
                runCatching { app.github.connect(t) }.onSuccess { webLogin = false; onDone() }
                    .onFailure { err = it.message; webLogin = false }
            }
        }, onClose = { webLogin = false })
        return
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        ScreenHeader("GitHub", subtitle = "ابنِ تطبيقات APK في السحاب بدون كمبيوتر")
        Spacer(Modifier.height(12.dp))
        GlassCard(glow = Neon.Cyan.copy(alpha = 0.25f)) {
            HudTitle("تسجيل الدخول من داخل وكيل", icon = Icons.AutoMirrored.Filled.Login)
            Spacer(Modifier.height(8.dp))
            Text("سجّل دخولك إلى GitHub هنا، ثم اضغط Generate token، ووكيل يلتقط الرمز ويربط حسابك تلقائياً بدون نسخ ولصق.",
                color = Neon.TextDim, style = MaterialTheme.typography.bodyMedium, lineHeight = 22.sp)
            Spacer(Modifier.height(12.dp))
            GlowButton("تسجيل الدخول إلى GitHub", { err = null; webLogin = true }, icon = Icons.AutoMirrored.Filled.Login, modifier = Modifier.fillMaxWidth())
            err?.let { Spacer(Modifier.height(8.dp)); Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall) }
        }
        Spacer(Modifier.height(12.dp))
        Text("أو الطريقة اليدوية:", color = Neon.TextFaint, style = MaterialTheme.typography.labelMedium)
        Spacer(Modifier.height(8.dp))
        GlassCard(glow = Neon.Violet.copy(alpha = 0.25f)) {
            HudTitle("لصق رمز يدوياً", icon = Icons.Filled.Link, color = Neon.Violet)
            Spacer(Modifier.height(10.dp))
            Text(
                "١. اضغط «إنشاء رمز» وسجّل دخولك في GitHub.\n" +
                    "٢. الصلاحيات repo و workflow محددة مسبقاً، اختر مدة الصلاحية واضغط Generate token.\n" +
                    "٣. انسخ الرمز (يبدأ بـ ghp_) والصقه هنا.",
                color = Neon.TextDim, style = MaterialTheme.typography.bodyMedium, lineHeight = 22.sp
            )
            Spacer(Modifier.height(12.dp))
            GhostButton("إنشاء رمز في GitHub", { openUrl(ctx, GitHub.TOKEN_URL) }, icon = Icons.AutoMirrored.Filled.OpenInNew, color = Neon.Violet)
            Spacer(Modifier.height(12.dp))
            NeonTextField(token, { token = it; err = null }, "الرمز (Personal access token)", mono = true,
                visualTransformation = PasswordVisualTransformation())
            err?.let { Spacer(Modifier.height(8.dp)); Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall) }
            Spacer(Modifier.height(12.dp))
            GlowButton(if (busy) "جارٍ التحقق…" else "ربط الحساب", {
                busy = true
                scope.launch {
                    runCatching { app.github.connect(token) }
                        .onSuccess { onDone() }.onFailure { err = it.message ?: "تعذّر الاتصال" }
                    busy = false
                }
            }, enabled = token.length > 20 && !busy, icon = Icons.Filled.Check, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            Text("الرمز يُحفظ داخل وكيل فقط ولا يُرسل لأي جهة غير GitHub.", color = Neon.TextFaint, style = MaterialTheme.typography.labelSmall)
        }
        Spacer(Modifier.height(14.dp))
        GlassCard {
            HudTitle("ماذا تستطيع؟", icon = Icons.Filled.AutoAwesome)
            Spacer(Modifier.height(8.dp))
            listOf(
                "إنشاء مشاريع Kotlin و Java و Flutter و HTML/CSS/JS و Next.js بضغطة",
                "محرر كود بتلوين وإكمال تلقائي وتراجع وبحث",
                "كل حفظ يبني APK تلقائياً في GitHub Actions ويصلك إشعار",
                "تنزيل الـ APK وتثبيته مباشرة، والتحديثات تتثبت فوق القديمة",
                "إضافة البناء لأي مستودع موجود عندك",
            ).forEach { Text("• $it", color = Neon.Text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 3.dp)) }
        }
    }
}

/* ------------------------------------------------------------------ home */

@Composable
private fun HomeView(app: WakilApp, user: GhUser?, onAsk: (String) -> Unit, onOpen: (GhRepo) -> Unit, onLogout: () -> Unit) {
    var idea by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var repos by remember { mutableStateOf<List<GhRepo>?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var filter by remember { mutableStateOf("") }
    var showNew by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(reload) {
        err = null
        runCatching { app.github.refreshUser(); app.github.api.repos() }.onSuccess { repos = it }.onFailure { err = it.message }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
        ScreenHeader("GitHub", subtitle = user?.let { "@${it.login}" } ?: "…") {
            CircleIconButton(Icons.Filled.Refresh, "تحديث", { reload++ })
            Spacer(Modifier.width(6.dp))
            CircleIconButton(Icons.AutoMirrored.Filled.Logout, "خروج", onLogout, tint = Neon.Red)
        }
        GlassCard(glow = Neon.Magenta.copy(alpha = 0.22f), padding = PaddingValues(12.dp)) {
            HudTitle("دع الوكيل يبنيه لك", icon = Icons.Filled.AutoAwesome, color = Neon.Magenta)
            Spacer(Modifier.height(8.dp))
            NeonTextField(idea, { idea = it }, "صف التطبيق: مثلاً آلة حاسبة بتصميم نيون")
            Spacer(Modifier.height(8.dp))
            GlowButton("ابنِ التطبيق بالذكاء الاصطناعي", {
                onAsk(
                    "أنشئ تطبيق أندرويد حقيقياً على GitHub: $idea\n" +
                        "اختر القالب المناسب بـ gh_create، ثم اكتب الكود كاملاً بـ gh_write_files، ثم ابنِه بـ gh_build_wait، " +
                        "وإن فشل اقرأ الخطأ وأصلحه وأعد البناء حتى ينجح، ثم ثبّته بـ gh_install."
                ); idea = ""
            }, enabled = idea.isNotBlank(), icon = Icons.Filled.RocketLaunch, colors = listOf(Neon.Magenta, Neon.Violet, Neon.Cyan), modifier = Modifier.fillMaxWidth())
            if (!app.prefs.fullAccess) Text("نصيحة: فعّل «الوصول الكامل» من الإعدادات ليعمل الوكيل بدون أن يسألك عند كل خطوة.",
                color = Neon.TextFaint, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 6.dp))
        }
        Spacer(Modifier.height(10.dp))
        GhostButton("مشروع جديد من قالب", { showNew = true }, icon = Icons.Filled.Add, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        NeonTextField(filter, { filter = it }, "بحث في المستودعات")
        Spacer(Modifier.height(8.dp))
        err?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall) }
        val list = repos
        if (list == null && err == null) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Neon.Cyan, trackColor = Color.Transparent)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(list.orEmpty().filter { filter.isBlank() || it.name.contains(filter, true) }, key = { it.full }) { r ->
                GlassCard(Modifier.fillMaxWidth().clickable { onOpen(r) }, padding = PaddingValues(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (r.private) Icons.Filled.Lock else Icons.Filled.FolderOpen, null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(r.name, color = Neon.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        if (r.language.isNotEmpty()) Badge(r.language, Neon.Violet)
                    }
                    if (r.description.isNotEmpty()) Text(r.description, color = Neon.TextDim, style = MaterialTheme.typography.bodySmall, maxLines = 2, modifier = Modifier.padding(top = 4.dp))
                    Text(ago(r.updated), color = Neon.TextFaint, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
                }
            }
        }
    }
    if (showNew) NewProjectDialog(app, onDismiss = { showNew = false }, onCreated = { showNew = false; onOpen(it) })
}

@Composable
private fun NewProjectDialog(app: WakilApp, onDismiss: () -> Unit, onCreated: (GhRepo) -> Unit) {
    val scope = rememberCoroutineScope()
    var tpl by remember { mutableStateOf(Templates.all.first()) }
    var name by remember { mutableStateOf("my-app") }
    var appName by remember { mutableStateOf("تطبيقي") }
    var private by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val validName = Regex("^[A-Za-z0-9._-]{1,90}$").matches(name)
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = Color(0xFF0B1120),
        title = { Text("مشروع جديد", color = Neon.Text) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Templates.all.forEach { t ->
                    val on = t == tpl
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(14.dp))
                            .background(if (on) Neon.Cyan.copy(alpha = 0.12f) else Color.White.copy(alpha = 0.03f))
                            .border(1.dp, if (on) Neon.Cyan else Color.White.copy(alpha = 0.08f), RoundedCornerShape(14.dp))
                            .clickable { tpl = t }.padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(t.title, color = if (on) Neon.Cyan else Neon.Text, style = MaterialTheme.typography.titleSmall)
                            Text(t.subtitle, color = Neon.TextDim, style = MaterialTheme.typography.labelSmall)
                        }
                        if (on) Icon(Icons.Filled.CheckCircle, null, tint = Neon.Cyan)
                    }
                }
                Spacer(Modifier.height(8.dp))
                NeonTextField(name, { name = it.replace(' ', '-') }, "اسم المستودع (إنجليزي)", mono = true)
                if (!validName) Text("حروف إنجليزية وأرقام و - _ . فقط", color = Neon.Amber, style = MaterialTheme.typography.labelSmall)
                Spacer(Modifier.height(6.dp))
                NeonTextField(appName, { appName = it }, "اسم التطبيق على الجوال")
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("مستودع خاص", color = Neon.Text, modifier = Modifier.weight(1f))
                    NeonSwitch(private, { private = it })
                }
                err?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall) }
                if (busy) { Spacer(Modifier.height(8.dp)); LinearProgressIndicator(Modifier.fillMaxWidth(), color = Neon.Cyan) }
            }
        },
        confirmButton = {
            TextButton(enabled = validName && !busy, onClick = {
                busy = true; err = null
                scope.launch {
                    runCatching { app.github.createProject(tpl, name, appName, private) }
                        .onSuccess { onCreated(it) }.onFailure { err = it.message }
                    busy = false
                }
            }) { Text(if (busy) "جارٍ الإنشاء…" else "إنشاء وبناء", color = Neon.Cyan) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("إلغاء", color = Neon.TextDim) } }
    )
}

/* ------------------------------------------------------------------ repo */

@Composable
private fun RepoView(app: WakilApp, n: GhNav.Repo, onNav: (GhNav) -> Unit) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            CircleIconButton(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", {
                onNav(if (n.path.isNotEmpty()) n.copy(path = n.path.substringBeforeLast('/', "")) else GhNav.Home)
            })
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(n.repo.name, style = MaterialTheme.typography.titleLarge, color = Neon.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(n.repo.owner + " · " + n.repo.defaultBranch, style = MaterialTheme.typography.labelSmall, color = Neon.TextDim)
            }
            CircleIconButton(Icons.AutoMirrored.Filled.OpenInNew, "فتح", { openUrl(ctx, n.repo.htmlUrl) })
        }
        NeonSegmented(listOf(0 to "الملفات", 1 to "البناء ⚙"), n.tab, listOf(Neon.Cyan, Neon.Violet), onSelect = { onNav(n.copy(tab = it)) },
            modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        if (n.tab == 0) FilesTab(app, n, onNav) else BuildsTab(app, n, onNav)
    }
}

@Composable
private fun FilesTab(app: WakilApp, n: GhNav.Repo, onNav: (GhNav) -> Unit) {
    val scope = rememberCoroutineScope()
    var items by remember(n.path) { mutableStateOf<List<GhEntry>?>(null) }
    var err by remember(n.path) { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var newFile by remember { mutableStateOf(false) }
    var toDelete by remember { mutableStateOf<GhEntry?>(null) }
    LaunchedEffect(n.path, reload) {
        runCatching { app.github.api.list(n.repo.full, n.path) }.onSuccess { items = it; err = null }.onFailure { err = it.message }
    }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("/" + n.path, fontFamily = JetMono, fontSize = 12.sp, color = Neon.Cyan, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()))
            GhostButton("ملف جديد", { newFile = true }, icon = Icons.AutoMirrored.Filled.NoteAdd)
        }
        Spacer(Modifier.height(6.dp))
        err?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall) }
        if (items == null && err == null) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Neon.Cyan)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(items.orEmpty(), key = { it.path }) { e ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.035f))
                        .clickable {
                            if (e.isDir) onNav(n.copy(path = e.path)) else onNav(GhNav.Edit(n.repo, e.path, n))
                        }.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(if (e.isDir) Icons.Filled.Folder else Icons.AutoMirrored.Filled.InsertDriveFile, null,
                        tint = if (e.isDir) Neon.Amber else Neon.TextDim, modifier = Modifier.size(19.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(e.name, color = Neon.Text, fontFamily = JetMono, fontSize = 13.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (!e.isDir) {
                        Text(Lang.of(e.name).let { if (it == Lang.PLAIN) "" else it.label }, color = Neon.TextFaint, fontSize = 10.sp)
                        Icon(Icons.Filled.DeleteOutline, "حذف", tint = Neon.TextFaint, modifier = Modifier.padding(start = 8.dp).size(18.dp).clickable { toDelete = e })
                    }
                }
            }
        }
    }
    if (newFile) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { newFile = false }, containerColor = Color(0xFF0B1120),
            title = { Text("ملف جديد", color = Neon.Text) },
            text = { NeonTextField(name, { name = it.trim() }, "المسار، مثال: lib/home.dart", mono = true) },
            confirmButton = {
                TextButton(enabled = name.isNotBlank() && !name.contains(".."), onClick = {
                    newFile = false
                    val p = (if (n.path.isEmpty()) "" else n.path + "/") + name.trimStart('/')
                    onNav(GhNav.Edit(n.repo, "new:$p", n))
                }) { Text("إنشاء", color = Neon.Cyan) }
            },
            dismissButton = { TextButton(onClick = { newFile = false }) { Text("إلغاء", color = Neon.TextDim) } }
        )
    }
    toDelete?.let { e ->
        AlertDialog(
            onDismissRequest = { toDelete = null }, containerColor = Color(0xFF0B1120),
            title = { Text("حذف ${e.name}؟", color = Neon.Text) },
            text = { Text("سيُحذف الملف من المستودع بـ commit جديد.", color = Neon.TextDim) },
            confirmButton = {
                TextButton(onClick = {
                    toDelete = null
                    scope.launch {
                        runCatching { app.github.api.delete(n.repo.full, e.path, e.sha, "🗑 حذف ${e.path} (وكيل)") }
                            .onFailure { err = it.message }
                        reload++
                    }
                }) { Text("حذف", color = Neon.Red) }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("إلغاء", color = Neon.TextDim) } }
        )
    }
}

@Composable
private fun BuildsTab(app: WakilApp, n: GhNav.Repo, onNav: (GhNav) -> Unit) {
    val scope = rememberCoroutineScope()
    val view = LocalView.current
    var wf by remember { mutableStateOf<GhWorkflow?>(null) }
    var wfLoaded by remember { mutableStateOf(false) }
    var runs by remember { mutableStateOf<List<GhRun>?>(null) }
    var msg by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var detected by remember { mutableStateOf<Triple<BuildKind, String, String?>?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    val watched by app.github.watched.collectAsState()

    LaunchedEffect(tick) {
        runCatching { app.github.buildWorkflow(n.repo) }.onSuccess { wf = it; wfLoaded = true }.onFailure { msg = it.message; wfLoaded = true }
        if (wf == null && wfLoaded) detected = runCatching { app.github.detect(n.repo) }.getOrNull()
    }
    LaunchedEffect(tick, watched[n.repo.full]) {
        while (true) {
            runCatching { app.github.api.runs(n.repo.full) }.onSuccess { runs = it }.onFailure { msg = it.message }
            delay(if (runs.orEmpty().any { it.active }) 6000 else 20000)
        }
    }
    Column {
        GlassCard(glow = Neon.Violet.copy(alpha = 0.2f)) {
            when {
                !wfLoaded -> LinearProgressIndicator(Modifier.fillMaxWidth(), color = Neon.Violet)
                wf != null -> {
                    Text("سير العمل: ${wf!!.name}", color = Neon.TextDim, style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.height(8.dp))
                    GlowButton(if (busy) "جارٍ الإرسال…" else "ابنِ APK الآن", {
                        busy = true; msg = null
                        scope.launch {
                            runCatching { app.github.buildNow(n.repo, wf!!) }
                                .onSuccess { haptic(view, HapticKind.CONFIRM); msg = "🚀 بدأ البناء في السحاب، يصلك إشعار عند الانتهاء."; delay(4000); tick++ }
                                .onFailure { msg = it.message }
                            busy = false
                        }
                    }, enabled = !busy, icon = Icons.Filled.RocketLaunch, colors = listOf(Neon.Violet, Neon.Blue, Neon.Cyan), modifier = Modifier.fillMaxWidth())
                }
                else -> {
                    Text("لا يوجد بناء APK في هذا المستودع بعد.", color = Neon.Text)
                    val d = detected
                    if (d != null) {
                        Text("النوع المكتشف: " + when (d.first) { BuildKind.ANDROID -> "Android (Gradle)"; BuildKind.FLUTTER -> "Flutter"; BuildKind.WEB -> "ويب ← Capacitor (${d.second})" },
                            color = Neon.TextDim, style = MaterialTheme.typography.bodySmall)
                        d.third?.let { Text("⚠ $it", color = Neon.Amber, style = MaterialTheme.typography.bodySmall) }
                        Spacer(Modifier.height(8.dp))
                        GlowButton(if (busy) "جارٍ الإضافة…" else "أضف بناء APK تلقائي", {
                            busy = true
                            scope.launch {
                                runCatching { app.github.addBuild(n.repo, d.first, d.second) }
                                    .onSuccess { msg = "✓ أُضيف سير العمل وبدأ أول بناء."; delay(3000); tick++ }
                                    .onFailure { msg = it.message }
                                busy = false
                            }
                        }, enabled = !busy, icon = Icons.Filled.Add, modifier = Modifier.fillMaxWidth())
                    } else Text("لم أتعرف على نوع المشروع (أضف pubspec.yaml أو build.gradle أو index.html/package.json).", color = Neon.TextDim, style = MaterialTheme.typography.bodySmall)
                }
            }
            msg?.let { Spacer(Modifier.height(8.dp)); Text(it, color = if (it.startsWith("🚀") || it.startsWith("✓")) Neon.Green else Neon.Red, style = MaterialTheme.typography.bodySmall) }
        }
        Spacer(Modifier.height(10.dp))
        HudTitle("آخر عمليات البناء")
        Spacer(Modifier.height(6.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(runs.orEmpty(), key = { it.id }) { r -> RunRow(r) { onNav(GhNav.Run(n.repo, r, n)) } }
        }
    }
}

@Composable
private fun RunStatusIcon(r: GhRun) {
    val (c, icon) = when {
        r.active -> Neon.Amber to Icons.Filled.Autorenew
        r.ok -> Neon.Green to Icons.Filled.CheckCircle
        r.conclusion == "cancelled" -> Neon.TextDim to Icons.Filled.Block
        else -> Neon.Red to Icons.Filled.Error
    }
    if (r.active) PulseDot(c, Modifier.padding(4.dp)) else Icon(icon, null, tint = c, modifier = Modifier.size(20.dp))
}

@Composable
private fun RunRow(r: GhRun, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.04f)).clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RunStatusIcon(r)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(r.title.ifBlank { r.name }, color = Neon.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("#${r.number} · ${r.event} · ${ago(r.created)}", color = Neon.TextFaint, style = MaterialTheme.typography.labelSmall)
        }
        if (r.ok) Badge("APK", Neon.Green)
    }
}

/* ------------------------------------------------------------------ run detail */

@Composable
private fun RunView(app: WakilApp, n: GhNav.Run, onAsk: (String) -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var run by remember { mutableStateOf(n.run) }
    var jobs by remember { mutableStateOf<List<GhJob>>(emptyList()) }
    var log by remember { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var msg by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        while (true) {
            runCatching { run = app.github.api.run(n.repo.full, run.id); jobs = app.github.api.jobs(n.repo.full, run.id) }
            if (!run.active) break
            delay(5000)
        }
        if (!run.ok && run.conclusion.isNotEmpty() && run.conclusion != "cancelled") {
            jobs.firstOrNull { it.conclusion == "failure" }?.let { j ->
                log = runCatching { app.github.api.jobLogTail(n.repo.full, j.id, 80) }.getOrElse { "تعذّر جلب السجل: ${it.message}" }
            }
        }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 14.dp).verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            CircleIconButton(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", onBack)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("بناء #${run.number}", style = MaterialTheme.typography.titleLarge, color = Neon.Text)
                Text(run.title, style = MaterialTheme.typography.labelSmall, color = Neon.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            CircleIconButton(Icons.AutoMirrored.Filled.OpenInNew, "فتح", { openUrl(ctx, run.htmlUrl) })
        }
        GlassCard(glow = (if (run.ok) Neon.Green else if (run.active) Neon.Amber else Neon.Red).copy(alpha = 0.25f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                RunStatusIcon(run); Spacer(Modifier.width(8.dp))
                Text(
                    when { run.active -> "جارٍ البناء في السحاب…"; run.ok -> "نجح البناء ✓"; run.conclusion == "cancelled" -> "أُلغي"; else -> "فشل البناء" },
                    color = Neon.Text, style = MaterialTheme.typography.titleMedium
                )
            }
            if (run.ok) {
                Spacer(Modifier.height(10.dp))
                progress?.let { LinearProgressIndicator({ it }, Modifier.fillMaxWidth(), color = Neon.Green); Spacer(Modifier.height(6.dp)) }
                GlowButton(if (progress != null) "جارٍ التنزيل…" else "تنزيل وتثبيت APK", {
                    progress = 0f; msg = null
                    scope.launch {
                        msg = runCatching { app.github.installFromRun(n.repo, run.id) { p -> progress = p } }.getOrElse { it.message }
                        progress = null
                    }
                }, enabled = progress == null, icon = Icons.Filled.InstallMobile, colors = listOf(Neon.Green, Neon.Cyan, Neon.Blue), modifier = Modifier.fillMaxWidth())
            }
            Spacer(Modifier.height(8.dp))
            Row {
                if (run.active) GhostButton("إلغاء", { scope.launch { runCatching { app.github.api.cancel(n.repo.full, run.id) }.onFailure { msg = it.message } } }, color = Neon.Red)
                if (!run.active && !run.ok && run.conclusion == "failure") {
                    GhostButton("اطلب من الوكيل إصلاحه", {
                        onAsk("فشل بناء APK في المستودع ${n.repo.full} (بناء #${run.number}). استخدم gh_runs لقراءة الخطأ، ثم gh_tree و gh_read، " +
                            "وأصلح الملفات بـ gh_write_files، وأعد البناء بـ gh_build_wait حتى ينجح، ثم ثبّته بـ gh_install.")
                    }, icon = Icons.Filled.AutoFixHigh, color = Neon.Magenta)
                    Spacer(Modifier.width(8.dp))
                }
                if (!run.active && !run.ok) GhostButton("إعادة المحاولة", {
                    scope.launch { runCatching { app.github.api.rerun(n.repo.full, run.id) }.onSuccess { msg = "أُعيد التشغيل"; app.github.watchNext(n.repo) }.onFailure { msg = it.message } }
                }, icon = Icons.Filled.Replay)
            }
            msg?.let { Text(it, color = Neon.Amber, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        }
        Spacer(Modifier.height(10.dp))
        jobs.forEach { j ->
            GlassCard(Modifier.fillMaxWidth().padding(bottom = 8.dp), padding = PaddingValues(12.dp)) {
                Text(j.name, color = Neon.Text, style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(6.dp))
                j.steps.forEach { s ->
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                        val c = when { s.status != "completed" -> Neon.Amber; s.conclusion == "success" -> Neon.Green; s.conclusion == "skipped" -> Neon.TextFaint; else -> Neon.Red }
                        Box(Modifier.size(8.dp).clip(CircleShape).background(c))
                        Spacer(Modifier.width(8.dp))
                        Text(s.name, color = if (c == Neon.Red) Neon.Red else Neon.TextDim, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        log?.let {
            HudTitle("سجل الخطأ", color = Neon.Red)
            Spacer(Modifier.height(6.dp))
            SelectionContainer {
                Text(it, fontFamily = JetMono, fontSize = 11.sp, color = Neon.TermGreen,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFF05080F))
                        .horizontalScroll(rememberScrollState()).padding(10.dp))
            }
            Spacer(Modifier.height(6.dp))
            Text("انسخ السجل وأرسله للمساعد في المحادثة ليصلح الخطأ.", color = Neon.TextFaint, style = MaterialTheme.typography.labelSmall)
        }
        Spacer(Modifier.height(30.dp))
    }
}

/* ------------------------------------------------------------------ editor */

@Composable
private fun EditorView(app: WakilApp, n: GhNav.Edit, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val view = LocalView.current
    val isNew = n.path.startsWith("new:")
    val path = n.path.removePrefix("new:")
    val name = path.substringAfterLast('/')
    val lang = remember(path) { Lang.of(name) }
    var state by remember { mutableStateOf<CodeEditorState?>(if (isNew) CodeEditorState("", lang).also { it.original = "\u0000" } else null) }
    var sha by remember { mutableStateOf<String?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf<String?>(null) }
    var confirmLeave by remember { mutableStateOf(false) }
    LaunchedEffect(path) {
        if (!isNew) runCatching { app.github.api.read(n.repo.full, path) }.onSuccess { f ->
            sha = f.sha
            if (f.text == null) err = "ملف ثنائي (صورة أو غيره) لا يمكن تحريره هنا."
            else if (f.size > 900_000) err = "الملف كبير جداً للتحرير على الجوال."
            else state = CodeEditorState(f.text, lang)
        }.onFailure { err = it.message }
    }
    val st = state
    val dirty = st?.let { it.version >= 0 && it.dirty } == true
    BackHandler { if (dirty) confirmLeave = true else onBack() }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            CircleIconButton(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", { if (dirty) confirmLeave = true else onBack() })
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text((if (dirty) "● " else "") + name, color = Neon.Text, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(saved ?: lang.label, color = if (saved != null) Neon.Green else Neon.TextDim, style = MaterialTheme.typography.labelSmall, maxLines = 1)
            }
            GlowButton(if (saving) "…" else "حفظ وبناء", {
                val s = st ?: return@GlowButton
                saving = true; err = null
                scope.launch {
                    runCatching { app.github.api.write(n.repo.full, path, s.value.text, sha, "✏️ تعديل $path (وكيل)") }
                        .onSuccess { newSha ->
                            sha = newSha; s.original = s.value.text; s.version++
                            saved = "✓ حُفظ — البناء بدأ في السحاب"; haptic(view, HapticKind.CONFIRM)
                            app.github.watchNext(n.repo)
                        }.onFailure { err = it.message }
                    saving = false
                }
            }, enabled = dirty && !saving, icon = Icons.Filled.CloudUpload)
        }
        err?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) }
        if (st == null && err == null) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Neon.Cyan)
        if (st != null) CodeEditor(st, Modifier.weight(1f).fillMaxWidth())
    }
    if (confirmLeave) AlertDialog(
        onDismissRequest = { confirmLeave = false }, containerColor = Color(0xFF0B1120),
        title = { Text("تجاهل التعديلات؟", color = Neon.Text) },
        text = { Text("لم تحفظ التغييرات في $name.", color = Neon.TextDim) },
        confirmButton = { TextButton(onClick = { confirmLeave = false; onBack() }) { Text("تجاهل", color = Neon.Red) } },
        dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("متابعة التحرير", color = Neon.Cyan) } }
    )
}
