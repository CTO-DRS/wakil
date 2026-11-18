package com.wakil.agent.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.wakil.agent.WakilApp
import com.wakil.agent.audio.Sfx
import com.wakil.agent.audio.Sound
import com.wakil.agent.onboarding.PermStatus
import com.wakil.agent.onboarding.PermissionKind
import com.wakil.agent.onboarding.WakilPermissions
import com.wakil.agent.priv.ShizukuShell
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.theme.MonoLtr
import com.wakil.agent.ui.theme.Neon
import kotlinx.coroutines.delay

internal data class GuideLink(val id: String, val title: String, val url: String, val desc: String)
internal data class GuideItem(val text: String, val code: String? = null)
internal data class GuideSection(val title: String, val icon: ImageVector, val color: Color, val numbered: Boolean, val items: List<GuideItem>)

object ShizukuLinks {
    const val PLAY_MARKET = "market://details?id=moe.shizuku.privileged.api"

    fun open(ctx: Context, id: String, url: String) {
        fun start(u: String) = try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
        } catch (_: ActivityNotFoundException) { false } catch (_: SecurityException) { false }
        if (id == "play" && start(PLAY_MARKET)) return
        start(url)
    }
}

/**
 * Shizuku download + full step-by-step setup guide (Arabic, RTL). Reached from Settings → «دليل Shizuku»
 * and from the onboarding Shizuku step («كيف أفعّله؟»). [statusOverride]/[expanded] are preview hooks.
 */
@Composable
fun ShizukuGuideScreen(
    app: WakilApp,
    onBack: () -> Unit,
    statusOverride: PermStatus? = null,
    expanded: Set<Int>? = null,
) {
    val ctx = LocalContext.current
    var status by remember { mutableStateOf(statusOverride ?: WakilPermissions.status(ctx, PermissionKind.SHIZUKU)) }
    fun refresh() { if (statusOverride == null) status = WakilPermissions.status(ctx, PermissionKind.SHIZUKU) }
    val shz by ShizukuShell.status.collectAsState()
    LaunchedEffect(shz) { refresh() }
    LaunchedEffect(Unit) { while (true) { delay(2000); refresh() } }
    val lifecycle = LocalLifecycleOwner.current
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) refresh() }
        lifecycle.lifecycle.addObserver(obs)
        onDispose { lifecycle.lifecycle.removeObserver(obs) }
    }
    var wasReady by remember { mutableStateOf(status == PermStatus.GRANTED) }
    LaunchedEffect(status) { if (status == PermStatus.GRANTED && !wasReady) Sfx.play(Sound.GRANTED); wasReady = status == PermStatus.GRANTED }
    BackHandler(onBack = onBack)

    // open the section that matters for the current state
    val focus = when (status) {
        PermStatus.NOT_INSTALLED -> 1
        PermStatus.NOT_RUNNING -> 3
        PermStatus.MISSING -> 4
        PermStatus.GRANTED -> 8
    }
    val open = remember { mutableStateMapOf<Int, Boolean>().apply { (expanded ?: setOf(focus)).forEach { put(it, true) } } }

    Box(Modifier.fillMaxSize().background(Neon.Black)) {
        AuroraBackground(tint = Neon.Magenta)
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                CircleIconButton(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", onBack, size = 38.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("دليل Shizuku", style = MaterialTheme.typography.headlineSmall, color = Neon.Text)
                    Text("التنزيل · التشغيل · منح الإذن", style = MaterialTheme.typography.labelMedium, color = Neon.TextDim)
                }
                WakilRobot(46.dp, detail = false, accent = statusColor(status))
            }
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 14.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                StatusCard(app, status)
                DownloadCard()
                ShizukuGuideData.sections.forEachIndexed { i, s ->
                    SectionCard(i, s, open[i] == true) { open[i] = open[i] != true }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

private fun statusColor(s: PermStatus) = when (s) {
    PermStatus.GRANTED -> Neon.Green
    PermStatus.MISSING -> Neon.Amber
    PermStatus.NOT_RUNNING -> Neon.Violet
    PermStatus.NOT_INSTALLED -> Neon.Red
}

@Composable
private fun StatusCard(app: WakilApp, s: PermStatus) {
    val ctx = LocalContext.current
    val c = statusColor(s)
    val (title, body) = when (s) {
        PermStatus.NOT_INSTALLED -> "Shizuku غير مثبّت" to "ابدأ بتنزيله من GitHub (موصى به)، ثم اتبع الخطوات بالأسفل."
        PermStatus.NOT_RUNNING -> "مثبّت لكنه متوقف" to "شغّله عبر «تصحيح الأخطاء اللاسلكي» من داخل تطبيق Shizuku (الخطوة 4)."
        PermStatus.MISSING -> "يعمل — بانتظار إذن وكيل" to "خطوة أخيرة: اضغط «منح الإذن» واختر «السماح»."
        PermStatus.GRANTED -> "جاهز ✓" to "Shizuku يعمل ووكيل يملك الإذن. أداة sys_shell متاحة الآن."
    }
    GlassCard(
        Modifier.fillMaxWidth(),
        border = Brush.linearGradient(listOf(c.copy(alpha = 0.8f), Color.White.copy(alpha = 0.06f), c.copy(alpha = 0.4f))),
        glow = c.copy(alpha = 0.35f), padding = PaddingValues(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PulseDot(c, size = 9.dp, pulsing = s != PermStatus.GRANTED)
            Spacer(Modifier.width(6.dp))
            Column(Modifier.weight(1f)) {
                Text("الحالة الآن", style = MaterialTheme.typography.labelMedium, color = Neon.TextDim)
                Text(title, style = MaterialTheme.typography.titleLarge, color = c)
            }
            Icon(if (s == PermStatus.GRANTED) Icons.Filled.CheckCircle else Icons.Filled.AdminPanelSettings, null, tint = c, modifier = Modifier.size(30.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
        Spacer(Modifier.height(12.dp))
        when (s) {
            PermStatus.NOT_INSTALLED -> GlowButton("تنزيل من GitHub", {
                ShizukuGuideData.links.first().let { ShizukuLinks.open(ctx, it.id, it.url) }
            }, Modifier.fillMaxWidth().height(48.dp), icon = Icons.Filled.Download, colors = listOf(Neon.Red, Neon.Magenta, Neon.Violet))
            PermStatus.NOT_RUNNING -> GlowButton("فتح Shizuku", { WakilPermissions.openShizuku(ctx) },
                Modifier.fillMaxWidth().height(48.dp), icon = Icons.AutoMirrored.Filled.OpenInNew, colors = listOf(Neon.Violet, Neon.Blue, Neon.Cyan))
            PermStatus.MISSING -> GlowButton("منح الإذن", { app.prefs.shizukuEnabled = true; ShizukuShell.requestPermission() },
                Modifier.fillMaxWidth().height(48.dp), icon = Icons.Filled.Key, colors = listOf(Neon.Amber, Neon.Yellow, Neon.Green))
            PermStatus.GRANTED -> GhostButton("فتح Shizuku", { WakilPermissions.openShizuku(ctx) }, Modifier.fillMaxWidth(), color = Neon.Green, icon = Icons.AutoMirrored.Filled.OpenInNew)
        }
    }
}

@Composable
private fun DownloadCard() {
    val ctx = LocalContext.current
    GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(14.dp)) {
        HudTitle("تنزيل Shizuku", icon = Icons.Filled.Download, color = Neon.Cyan)
        Spacer(Modifier.height(10.dp))
        ShizukuGuideData.links.forEach { l ->
            val rec = l.id == "gh"
            val c = when (l.id) { "gh" -> Neon.Cyan; "play" -> Neon.Green; "repo" -> Neon.Violet; else -> Neon.Blue }
            val icon = when (l.id) { "gh" -> Icons.Filled.Download; "play" -> Icons.Filled.Shop; "repo" -> Icons.Filled.Code; else -> Icons.AutoMirrored.Filled.MenuBook }
            val shape = RoundedCornerShape(16.dp)
            Row(
                Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    .then(if (rec) Modifier.neonGlow(c, shape, 10.dp) else Modifier)
                    .clip(shape)
                    .background(if (rec) Brush.horizontalGradient(listOf(c.copy(alpha = 0.22f), Neon.Blue.copy(alpha = 0.14f))) else Brush.linearGradient(listOf(c.copy(alpha = 0.06f), c.copy(alpha = 0.06f))))
                    .border(if (rec) 1.5.dp else 1.dp, c.copy(alpha = if (rec) 0.9f else 0.35f), shape)
                    .clickable { Sfx.play(Sound.CONFIRM); ShizukuLinks.open(ctx, l.id, l.url) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(c.copy(alpha = 0.14f)).border(1.dp, c.copy(alpha = 0.6f), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(icon, null, tint = c, modifier = Modifier.size(19.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(l.title, style = MaterialTheme.typography.titleSmall, color = Neon.Text, fontWeight = FontWeight.SemiBold)
                        if (rec) { Spacer(Modifier.width(6.dp)); Badge("موصى به", Neon.Yellow) }
                    }
                    Text(l.desc, style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                }
                Icon(Icons.AutoMirrored.Filled.OpenInNew, null, tint = c.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Filled.Lightbulb, null, tint = Neon.Amber, modifier = Modifier.padding(top = 2.dp).size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text(ShizukuGuideData.WHY_GITHUB + " حمّل دائماً أحدث إصدار من صفحة الإصدارات.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
        }
    }
}

@Composable
private fun SectionCard(index: Int, s: GuideSection, open: Boolean, onToggle: () -> Unit) {
    val arrow by animateFloatAsState(if (open) 180f else 0f, label = "arrow$index")
    GlassCard(
        Modifier.fillMaxWidth(), padding = PaddingValues(0.dp),
        border = if (open) Brush.linearGradient(listOf(s.color.copy(alpha = 0.7f), Color.White.copy(alpha = 0.06f), s.color.copy(alpha = 0.3f))) else Neon.softBorder,
    ) {
        Row(
            Modifier.fillMaxWidth().clickable { Sfx.play(Sound.TOGGLE); onToggle() }.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(s.color.copy(alpha = 0.14f)).border(1.dp, s.color.copy(alpha = 0.7f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(s.icon, null, tint = s.color, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(10.dp))
            Text("${index + 1}", style = MaterialTheme.typography.titleMedium, color = s.color, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(6.dp))
            Text(s.title, style = MaterialTheme.typography.titleSmall, color = Neon.Text, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ExpandMore, null, tint = Neon.TextDim, modifier = Modifier.size(22.dp).rotate(arrow))
        }
        AnimatedVisibility(open, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            Column(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                s.items.forEachIndexed { j, it ->
                    Row(verticalAlignment = Alignment.Top) {
                        if (s.numbered) Box(
                            Modifier.padding(top = 1.dp).size(22.dp).clip(CircleShape).background(s.color.copy(alpha = 0.16f)).border(1.dp, s.color.copy(alpha = 0.6f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) { Text("${j + 1}", fontSize = 11.sp, color = s.color, fontWeight = FontWeight.Bold) }
                        else Box(Modifier.padding(top = 7.dp, start = 7.dp, end = 7.dp).size(7.dp).clip(CircleShape).background(s.color))
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(it.text, style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                            it.code?.let { code -> Spacer(Modifier.height(6.dp)); CodeBox(code, s.color) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CodeBox(code: String, accent: Color) {
    val clip = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(1600); copied = false } }
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xCC000000))
                .border(1.dp, accent.copy(alpha = 0.3f), RoundedCornerShape(12.dp)).padding(start = 10.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                code, style = MonoLtr, fontSize = 11.5.sp, lineHeight = 16.sp, color = Neon.TermGreen,
                modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()).padding(vertical = 6.dp), softWrap = false
            )
            Spacer(Modifier.width(4.dp))
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(accent.copy(alpha = if (copied) 0.3f else 0.14f))
                    .clickable { clip.setText(AnnotatedString(code)); copied = true; Sfx.play(Sound.CONFIRM) }
                    .padding(horizontal = 9.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy, null, tint = accent, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(if (copied) "تم النسخ" else "نسخ", fontSize = 11.sp, color = accent)
            }
        }
    }
}
