package com.wakil.agent.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wakil.agent.WakilApp
import com.wakil.agent.llm.ExtModels
import com.wakil.agent.llm.ExtModel
import com.wakil.agent.llm.Gguf
import com.wakil.agent.llm.GgufMeta
import com.wakil.agent.llm.Library
import com.wakil.agent.llm.LlmState
import com.wakil.agent.llm.ModelManager
import com.wakil.agent.ui.components.*
import com.wakil.agent.ui.theme.JetMono
import com.wakil.agent.ui.theme.Neon
import kotlinx.coroutines.launch
import java.util.Locale

private fun fmtBytes(b: Long): String = when {
    b < 0 -> "?"
    b >= 1L shl 30 -> String.format(Locale.US, "%.2f GB", b / (1024.0 * 1024 * 1024))
    b >= 1L shl 20 -> String.format(Locale.US, "%.1f MB", b / (1024.0 * 1024))
    else -> "${b / 1024} KB"
}

/** Rough RAM estimate shown as a badge (UI hint only). */
private fun ramHint(sizeLabel: String): String? {
    val gb = sizeLabel.substringBefore(" ").toDoubleOrNull() ?: return null
    val est = Math.round(gb * 1.4 * 2) / 2.0
    return "ذاكرة ≈ \u2066${if (est % 1.0 == 0.0) est.toInt().toString() else est.toString()} GB\u2069"
}

/** 40960 → "40K", 8192 → "8K", anything else stays as-is. */
private fun fmtCtx(v: Int): String = if (v >= 1024 && v % 1024 == 0) "${v / 1024}K" else v.toString()

/**
 * Real facts probed from the GGUF header (v3.4): quantization, architecture, layers, training
 * context and parameter count — plus two pre-flight warnings: a memory estimate that exceeds the
 * phone's RAM, and a configured context larger than the model's training context.
 */
@Composable
private fun ModelFacts(m: GgufMeta?, name: String, fileSize: Long, nCtx: Int, deviceRamBytes: Long) {
    if (m == null) return
    val quant = remember(name) { m.quant.ifBlank { Gguf.filenameQuant(name) } }
    val badges = buildList {
        if (quant.isNotBlank()) add(quant to Neon.Cyan)
        if (m.architecture.isNotBlank()) add(m.architecture to Neon.Violet)
        Gguf.paramsLabel(m.params, m.sizeLabel)?.let { add(it to Neon.Blue) }
        if (m.layers > 0) add("${m.layers} طبقة" to Neon.TextDim)
        if (m.trainCtx > 0) add("سياق تدريبي ${fmtCtx(m.trainCtx)}" to Neon.TextDim)
    }
    val est = if (m.estimable) Gguf.ramEstimateBytes(fileSize.coerceAtLeast(0), m, nCtx) else 0L
    val over = m.estimable && deviceRamBytes > 0 && est > deviceRamBytes
    val ctxWarn = m.trainCtx > 0 && nCtx > m.trainCtx
    if (badges.isEmpty() && !over && !ctxWarn) return
    Spacer(Modifier.height(6.dp))
    if (badges.isNotEmpty()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        badges.forEach { (t, c) -> Badge(t, c) }
    }
    if (over) {
        Spacer(Modifier.height(4.dp))
        Text(
            "تحذير: قد لا يتسع في الذاكرة — تقدير الاستخدام ≈ ${fmtBytes(est)} (الأوزان + ذاكرة السياق) مقابل ${(deviceRamBytes / (1024.0 * 1024 * 1024)).toInt()} GB رام للهاتف. جرّب سياقاً أصغر أو نموذجاً أخف.",
            style = MaterialTheme.typography.bodySmall, color = Neon.Red
        )
    } else if (ctxWarn) {
        Spacer(Modifier.height(4.dp))
        Text(
            "السياق المضبوط (${fmtCtx(nCtx)}) أكبر من سياق النموذج التدريبي (${fmtCtx(m.trainCtx)}) — سيُقص عند التحميل ويستهلك راماً إضافياً بلا فائدة.",
            style = MaterialTheme.typography.bodySmall, color = Neon.Yellow
        )
    }
}

private val PICK_MIMES = arrayOf("application/octet-stream", "*/*")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ModelsScreen(app: WakilApp) {
    val files by app.models.files.collectAsState()
    val extModels by app.models.ext.collectAsState()
    val meta by app.models.meta.collectAsState()
    val libTree by app.models.libTree.collectAsState()
    val lib by app.models.lib.collectAsState()
    val move by app.models.move.collectAsState()
    val dl by app.models.download.collectAsState()
    val llmState by app.llm.state.collectAsState()
    val mctx = androidx.compose.ui.platform.LocalContext.current
    // Pick the preset that fits this phone's RAM.
    val ramGb = remember {
        val mi = android.app.ActivityManager.MemoryInfo()
        (mctx.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager).getMemoryInfo(mi)
        mi.totalMem / 1_073_741_824.0
    }
    val bestUrl = remember(ramGb) { ModelManager.PRESETS[ModelManager.recommendedIndex(ramGb)].url }
    var url by remember { mutableStateOf(bestUrl) }
    var confirmData by remember { mutableStateOf<String?>(null) }
    fun requestDownload(u: String) {
        val cm = mctx.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        if (cm.isActiveNetworkMetered) confirmData = u else app.models.startDownload(u)
    }
    confirmData?.let { u ->
        val size = ModelManager.PRESETS.firstOrNull { it.url == u }?.sizeLabel
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmData = null },
            containerColor = Color(0xFF0B1220),
            title = { Text("أنت على بيانات الجوال", color = Neon.Text) },
            text = { Text("حجم النموذج ${size ?: "كبير"}. يُفضّل الاتصال بشبكة Wi-Fi. هل تريد المتابعة؟", color = Neon.TextDim) },
            confirmButton = { androidx.compose.material3.TextButton({ app.models.startDownload(u); confirmData = null }) { Text("تنزيل الآن", color = Neon.Cyan) } },
            dismissButton = { androidx.compose.material3.TextButton({ confirmData = null }) { Text("انتظر الـ Wi-Fi", color = Neon.TextDim) } },
        )
    }
    val scope = rememberCoroutineScope()
    val view = LocalView.current
    val deviceRam = remember {
        val am = mctx.getSystemService(android.app.ActivityManager::class.java)
        val mi = android.app.ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi); mi.totalMem
    }
    val nCtx = remember { app.prefs.nCtx }
    var importError by remember { mutableStateOf<String?>(null) }
    var moveError by remember { mutableStateOf<String?>(null) }
    var scanning by remember { mutableStateOf(false) }
    // مجلد المكتبة المخصص: يُختار مرة واحدة ويُمنح إذناً دائماً (v3.5)
    val treePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) app.models.pickLibraryTree(uri)
    }
    // الاستيراد الفوري: النموذج يبقى في مكانه على ذاكرة الهاتف ويُشغّل مباشرة دون نسخ (v3.3)
    val instantPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            val err = app.models.importInstant(uri)
            if (err != null) importError = err
            else app.llm.load(uri.toString())
        }
    }
    // نسخ الملف إلى ذاكرة التطبيق: أبطأ لكن يعمل مع النماذج المقسّمة وأي مزوّد ملفات
    val copyPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) app.models.import(uri)
    }
    importError?.let { e ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { importError = null },
            containerColor = Color(0xFF0B1220),
            title = { Text("تعذّر الاستيراد الفوري", color = Neon.Text) },
            text = { Text(e, color = Neon.TextDim) },
            confirmButton = { androidx.compose.material3.TextButton({ importError = null }) { Text("حسناً", color = Neon.Cyan) } },
        )
    }
    moveError?.let { e ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { moveError = null },
            containerColor = Color(0xFF0B1220),
            title = { Text("تعذّر النقل إلى المكتبة", color = Neon.Text) },
            text = { Text(e, color = Neon.TextDim) },
            confirmButton = { androidx.compose.material3.TextButton({ moveError = null }) { Text("حسناً", color = Neon.Cyan) } },
        )
    }

    // download speed (UI-side, from successive progress samples)
    var speed by remember { mutableDoubleStateOf(0.0) }
    var lastSample by remember { mutableStateOf<Pair<Long, Long>?>(null) }
    LaunchedEffect(dl?.downloaded, dl?.running) {
        val d = dl
        if (d == null || !d.running) { speed = 0.0; lastSample = null; return@LaunchedEffect }
        val now = System.nanoTime()
        val prev = lastSample
        if (prev != null && now > prev.first) {
            val inst = (d.downloaded - prev.second) / ((now - prev.first) / 1e9)
            if (inst >= 0 && (now - prev.first) > 250_000_000L) {
                speed = if (speed == 0.0) inst else speed * 0.7 + inst * 0.3
                lastSample = now to d.downloaded
            }
        } else lastSample = now to d.downloaded
    }

    LazyColumn(
        Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { ScreenHeader("النماذج", subtitle = "نماذج GGUF محلية · llama.cpp") }
        item { ActiveModelCard(llmState); if (llmState is LlmState.Ready && !app.llm.usingRemote) BenchCard(app, (llmState as LlmState.Ready).name) }
        item {
            GlassCard(Modifier.fillMaxWidth()) {
                HudTitle("تنزيل نموذج", icon = Icons.Filled.CloudDownload)
                Text("ذاكرة جوالك نحو ${"%.0f".format(ramGb)} غيغابايت، اخترت لك النموذج الأنسب.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim, modifier = Modifier.padding(top = 4.dp))
                Spacer(Modifier.height(12.dp))
                var filter by remember { mutableStateOf("الكل") }
                val filters = listOf("الكل", "يناسب جوالي", "جديد", "سريع", "برمجة", "استدلال")
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    filters.forEach { f ->
                        val on = filter == f
                        Text(f, color = if (on) Neon.Black else Neon.TextDim, style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(if (on) Neon.Cyan else Color.White.copy(alpha = 0.06f))
                                .clickable { filter = f }.padding(horizontal = 12.dp, vertical = 6.dp))
                    }
                }
                ModelManager.PRESETS.filter { p ->
                    when (filter) {
                        "يناسب جوالي" -> p.ramGb <= ramGb + 0.5
                        "الكل" -> true
                        else -> p.tags.contains(filter)
                    }
                }.forEach { p ->
                    val sel = url == p.url
                    val edge by animateColorAsState(if (sel) Neon.Cyan else Color.White.copy(alpha = 0.10f), label = "preset")
                    val shape = RoundedCornerShape(18.dp)
                    val (name, tag) = p.title.split(" — ", limit = 2).let { it[0] to it.getOrNull(1) }
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 8.dp)
                            .then(if (sel) Modifier.neonGlow(Neon.Cyan.copy(alpha = 0.6f), shape, 8.dp) else Modifier)
                            .clip(shape).background(if (sel) Neon.Cyan.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.025f))
                            .border(1.dp, edge, shape)
                            .clickable { haptic(view, HapticKind.TICK); url = p.url }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            Modifier.size(20.dp).clip(CircleShape).border(1.5.dp, if (sel) Neon.Cyan else Neon.TextFaint, CircleShape),
                            contentAlignment = Alignment.Center
                        ) { if (sel) Box(Modifier.size(10.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Neon.Cyan, Neon.Violet)))) }
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(name, style = MaterialTheme.typography.titleSmall, color = Neon.Text, maxLines = 2)
                            if (tag != null) Text(tag, style = MaterialTheme.typography.labelMedium, color = if (sel) Neon.Cyan else Neon.TextDim)
                            Spacer(Modifier.height(6.dp))
                            if (p.note.isNotBlank()) Text(p.note, style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                            Spacer(Modifier.height(4.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Badge(p.sizeLabel, Neon.Cyan)
                                Badge("رام \u2066${p.ramGb} GB\u2069+", if (p.ramGb <= ramGb + 0.5) Neon.Violet else Neon.Red)
                                if (p.url == bestUrl) Badge("الأنسب لجوالك ✓", Neon.Green)
                                p.tags.take(3).forEach { Badge(it, Neon.Amber) }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                NeonTextField(url, { url = it }, "رابط GGUF", mono = true)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GlowButton("تنزيل", { haptic(view, HapticKind.CONFIRM); requestDownload(url.trim()) }, Modifier.weight(1f), enabled = dl?.running != true, icon = Icons.Filled.Download)
                    GlowButton("استيراد فوري", { haptic(view, HapticKind.CONFIRM); instantPicker.launch(PICK_MIMES) }, Modifier.weight(1.2f), icon = Icons.Filled.FlashOn, colors = listOf(Neon.Violet, Neon.Blue, Neon.Cyan))
                }
                Spacer(Modifier.height(8.dp))
                GhostButton("نسخ إلى التطبيق بدلاً من ذلك", { copyPicker.launch(PICK_MIMES) }, Modifier.fillMaxWidth(), icon = Icons.Filled.ContentCopy)
                Spacer(Modifier.height(6.dp))
                Text(
                    "«استيراد فوري» يشغّل ملف GGUF من ذاكرة الهاتف من مكانه مباشرة — ثوانٍ بدل دقائق، بدون مضاعفة المساحة. «نسخ إلى التطبيق» يضع نسخة داخل الوكيل (مطلوب للنماذج المقسّمة إلى أجزاء).",
                    style = MaterialTheme.typography.bodySmall, color = Neon.TextDim
                )
                dl?.let { d ->
                    Spacer(Modifier.height(14.dp))
                    DownloadPanel(d.fileName, d.downloaded, d.total, d.running, d.error, d.done, if (d.fast) d.speed else speed, d.connections, d.paused,
                        onPause = { app.models.pauseDownload() }, onResume = { app.models.resumeDownload() }) { app.models.cancelDownload() }
                }
                Spacer(Modifier.height(12.dp))
                SpeedSettings(app)
            }
        }
        item { HfSearchCard(app) { u -> url = u; requestDownload(u) } }
        item { HudTitle("من ذاكرة الهاتف", Modifier.padding(top = 4.dp), color = Neon.Violet, icon = Icons.Filled.SdStorage) }
        if (extModels.isEmpty()) item {
            Text(
                "لا توجد نماذج مستوردة بعد — «استيراد فوري» يُشغّل ملفات ⁠.gguf⁠ من مدير الملفات (مجلد التنزيلات مثلاً) دون نسخها.",
                style = MaterialTheme.typography.bodyMedium, color = Neon.TextDim, modifier = Modifier.padding(horizontal = 8.dp)
            )
        }
        items(extModels, key = { it.uri }) { m ->
            val active = (llmState as? LlmState.Ready)?.name == m.name
            val loading = (llmState as? LlmState.Loading)?.name == m.name
            GlassCard(
                Modifier.fillMaxWidth(),
                border = if (active) Neon.borderGradient else Neon.softBorder,
                glow = if (active) Neon.Violet.copy(alpha = 0.5f) else Color.Transparent,
                padding = PaddingValues(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                            .background(Brush.linearGradient(listOf(Neon.Violet.copy(alpha = 0.25f), Neon.Cyan.copy(alpha = 0.25f)))),
                        contentAlignment = Alignment.Center
                    ) {
                        if (loading) ProgressRing(null, size = 30.dp, stroke = 3.dp)
                        else Icon(Icons.Filled.SdStorage, null, tint = if (active) Neon.Violet else Neon.TextDim, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(m.name, fontFamily = JetMono, fontSize = 12.5.sp, color = Neon.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (m.size >= 0) Badge(fmtBytes(m.size), Neon.Violet)
                            Badge("بدون نسخ", Neon.Cyan)
                            if (active) Badge("نشط", Neon.Green)
                        }
                    }
                }
                ModelFacts(meta[m.uri], m.name, m.size, nCtx, deviceRam)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GlowButton(
                        "تشغيل", { haptic(view, HapticKind.CONFIRM); scope.launch { app.llm.load(m.uri) } }, Modifier.weight(1f),
                        enabled = llmState !is LlmState.Loading, icon = Icons.Filled.Bolt
                    )
                    GhostButton("إزالة المرجع", { haptic(view, HapticKind.REJECT); app.models.removeExt(m.uri) }, Modifier.weight(1f), color = Neon.Red, icon = Icons.Filled.LinkOff)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "النموذج يُقرأ من مكانه في ذاكرة الهاتف — الإزالة تحذف المرجع فقط وملفك الأصلي يبقى كما هو.",
                    style = MaterialTheme.typography.bodySmall, color = Neon.TextFaint
                )
            }
        }
        item { HudTitle("مكتبة النماذج — مجلد مخصص", Modifier.padding(top = 4.dp), color = Neon.Blue, icon = Icons.Filled.LibraryBooks) }
        item {
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(14.dp)) {
                if (libTree == null) {
                    Text(
                        "اجمع نماذجك في مجلد واحد تختاره — الذاكرة الداخلية أو بطاقة SD. الوكيل يمسح المجلد ويشغّل أي ملف GGUF فيه من مكانه دون نسخ، ويعيد الفحص عند كل فتح.",
                        style = MaterialTheme.typography.bodySmall, color = Neon.TextDim
                    )
                    Spacer(Modifier.height(10.dp))
                    GlowButton(
                        "اختيار مجلد المكتبة", { haptic(view, HapticKind.CONFIRM); treePicker.launch(null) },
                        Modifier.fillMaxWidth(), icon = Icons.Filled.CreateNewFolder, colors = listOf(Neon.Blue, Neon.Cyan)
                    )
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.FolderOpen, null, tint = Neon.Blue, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text("المجلد مُختار", style = MaterialTheme.typography.titleSmall, color = Neon.Text)
                            Text(if (scanning) "جارٍ فحص المجلد…" else Library.summary(lib), style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
                        }
                        GhostButton("تحديث", { haptic(view, HapticKind.CONFIRM); scope.launch { scanning = true; app.models.scanLibrary(); scanning = false } }, enabled = !scanning, icon = Icons.Filled.Refresh)
                        Spacer(Modifier.width(6.dp))
                        GhostButton("إزالة", { haptic(view, HapticKind.REJECT); app.models.clearLibrary() }, color = Neon.Red, icon = Icons.Filled.FolderOff)
                    }
                    if (lib.isEmpty() && !scanning) {
                        Spacer(Modifier.height(8.dp))
                        Text("المجلد لا يحتوي ملفات GGUF بعد — ضع نماذجك فيه ثم اضغط «تحديث».", style = MaterialTheme.typography.bodySmall, color = Neon.Yellow)
                    }
                }
            }
        }
        items(lib, key = { it.docId }) { m ->
            val ref = remember(libTree, m.docId) { app.models.libRef(m) }
            val active = ref != null && (llmState as? LlmState.Ready)?.name == m.name
            val loading = ref != null && (llmState as? LlmState.Loading)?.name == m.name
            GlassCard(
                Modifier.fillMaxWidth(),
                border = if (active) Neon.borderGradient else Neon.softBorder,
                glow = if (active) Neon.Blue.copy(alpha = 0.5f) else Color.Transparent,
                padding = PaddingValues(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                            .background(Brush.linearGradient(listOf(Neon.Blue.copy(alpha = 0.25f), Neon.Green.copy(alpha = 0.2f)))),
                        contentAlignment = Alignment.Center
                    ) {
                        if (loading) ProgressRing(null, size = 30.dp, stroke = 3.dp)
                        else Icon(Icons.Filled.LibraryBooks, null, tint = if (active) Neon.Blue else Neon.TextDim, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(m.name, fontFamily = JetMono, fontSize = 12.5.sp, color = Neon.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (m.size > 0) Badge(fmtBytes(m.size), Neon.Blue)
                            Badge("مجلد مخصص", Neon.Green)
                            if (active) Badge("نشط", Neon.Green)
                        }
                    }
                }
                ModelFacts(if (ref == null) null else meta[ref], m.name, m.size, nCtx, deviceRam)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GlowButton(
                        "تشغيل", { haptic(view, HapticKind.CONFIRM); ref?.let { scope.launch { app.llm.load(it) } } }, Modifier.weight(1f),
                        enabled = ref != null && llmState !is LlmState.Loading, icon = Icons.Filled.Bolt
                    )
                    GhostButton("إزالة المرجع", { haptic(view, HapticKind.REJECT); app.models.forgetLib(m.docId) }, Modifier.weight(1f), color = Neon.Red, icon = Icons.Filled.LinkOff)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "يُقرأ النموذج من مجلد المكتبة مباشرة — الإزالة تحذف القائمة فقط وملفك يبقى في مكانه.",
                    style = MaterialTheme.typography.bodySmall, color = Neon.TextFaint
                )
            }
        }
        item { HudTitle("الملفات المحفوظة", Modifier.padding(top = 4.dp)) }
        if (files.isEmpty()) item {
            Text("لا توجد نماذج محفوظة داخل التطبيق.", style = MaterialTheme.typography.bodyMedium, color = Neon.TextDim, modifier = Modifier.padding(horizontal = 8.dp))
        }
        items(files, key = { it.path }) { f ->
            val active = (llmState as? LlmState.Ready)?.name == f.name
            val loading = (llmState as? LlmState.Loading)?.name == f.name
            val split = remember(f.name) { ExtModels.splitParts(f.name) }
            GlassCard(
                Modifier.fillMaxWidth(),
                border = if (active) Neon.borderGradient else Neon.softBorder,
                glow = if (active) Neon.Cyan.copy(alpha = 0.55f) else Color.Transparent,
                padding = PaddingValues(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                            .background(Brush.linearGradient(listOf(Neon.Cyan.copy(alpha = 0.25f), Neon.Violet.copy(alpha = 0.25f)))),
                        contentAlignment = Alignment.Center
                    ) {
                        if (loading) ProgressRing(null, size = 30.dp, stroke = 3.dp)
                        else Icon(Icons.Filled.Memory, null, tint = if (active) Neon.Cyan else Neon.TextDim, modifier = Modifier.size(22.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(f.name, fontFamily = JetMono, fontSize = 12.5.sp, color = Neon.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(4.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Badge(fmtBytes(f.length()), Neon.Cyan)
                            if (active) Badge("نشط", Neon.Green)
                            app.prefs.benchFor(f.name)?.let { Badge(it, Neon.Amber) }
                        }
                        split?.let { (p, t) ->
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "نموذج مقسّم: الجزء $p من $t — انسخ كل الأجزاء إلى التطبيق (بنفس الأسماء الأصلية) ثم حمّل الجزء الأول.",
                                style = MaterialTheme.typography.bodySmall, color = Neon.Yellow
                            )
                        }
                    }
                }
                ModelFacts(meta[f.path], f.name, f.length(), nCtx, deviceRam)
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GlowButton(
                        "تحميل", { haptic(view, HapticKind.CONFIRM); scope.launch { app.llm.load(f.path) } }, Modifier.weight(1f),
                        enabled = llmState !is LlmState.Loading, icon = Icons.Filled.Bolt
                    )
                    if (libTree != null) GhostButton(
                        "نقل", { haptic(view, HapticKind.CONFIRM); scope.launch { val e = app.models.moveToLibrary(f); if (e != null) moveError = e } },
                        Modifier.weight(1f), enabled = move?.running != true, icon = Icons.Filled.DriveFileMove
                    )
                    GhostButton("حذف", { haptic(view, HapticKind.REJECT); app.models.delete(f) }, Modifier.weight(1f), color = Neon.Red, icon = Icons.Filled.DeleteOutline)
                }
                move?.takeIf { it.running && it.name == f.name }?.let { mv ->
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ProgressRing(null, size = 18.dp, stroke = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("جارٍ النقل إلى المكتبة… ${fmtBytes(mv.moved)} / ${fmtBytes(mv.total)}", style = MaterialTheme.typography.bodySmall, color = Neon.Blue)
                    }
                }
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().glass(RoundedCornerShape(18.dp), fill = Neon.Violet.copy(alpha = 0.06f)).padding(12.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(Icons.Filled.Lightbulb, null, tint = Neon.Yellow, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    "نصيحة: «استيراد فوري» يوفّر المساحة لأن النموذج يبقى في مكانه. النموذج يحتاج رام أكبر من حجم ملفه بقليل؛ إن كان بطيئاً جرّب نموذجاً أصغر أو قلّل حجم السياق من الإعدادات.",
                    style = MaterialTheme.typography.bodySmall, color = Neon.TextDim
                )
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun ActiveModelCard(llmState: LlmState) {
    val (color, title, sub) = when (val s = llmState) {
        is LlmState.Ready -> Triple(Neon.Green, s.name, "المحمّل الآن · سياق ${s.nCtx}")
        is LlmState.Loading -> Triple(Neon.Amber, s.name, "جارٍ التحميل في الذاكرة…")
        is LlmState.Error -> Triple(Neon.Red, "خطأ", s.message)
        LlmState.Empty -> Triple(Neon.TextDim, "لا يوجد نموذج محمّل", "اختر نموذجاً من الأسفل أو نزّل واحداً")
    }
    GlassCard(
        Modifier.fillMaxWidth(),
        border = Brush.linearGradient(listOf(color.copy(alpha = 0.8f), Color.White.copy(alpha = 0.08f), color.copy(alpha = 0.3f))),
        glow = if (llmState is LlmState.Empty) Color.Transparent else color.copy(alpha = 0.4f),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            when (llmState) {
                is LlmState.Loading -> ProgressRing(null, size = 52.dp, stroke = 4.dp, color = Neon.Amber)
                else -> EnergyOrb(
                    when (llmState) { is LlmState.Ready -> OrbState.IDLE; is LlmState.Error -> OrbState.ERROR; else -> OrbState.IDLE },
                    52.dp, detail = false
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PulseDot(color, size = 7.dp, pulsing = llmState !is LlmState.Empty)
                    Spacer(Modifier.width(4.dp))
                    Text(sub, style = MaterialTheme.typography.labelMedium, color = color, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text(title, fontFamily = if (llmState is LlmState.Ready || llmState is LlmState.Loading) JetMono else null,
                    style = MaterialTheme.typography.titleSmall, color = Neon.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun DownloadPanel(
    fileName: String, downloaded: Long, total: Long, running: Boolean, error: String?, done: Boolean, speed: Double,
    connections: Int = 0, paused: Boolean = false, onPause: () -> Unit = {}, onResume: () -> Unit = {}, onCancel: () -> Unit,
) {
    val frac = if (total > 0) (downloaded.toFloat() / total).coerceIn(0f, 1f) else null
    val color = when { error != null -> Neon.Red; done -> Neon.Green; else -> Neon.Cyan }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0x66000000))
            .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(18.dp)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ProgressRing(if (done) 1f else if (running) frac else frac ?: 0f, size = 72.dp, stroke = 5.dp, color = color) {
            if (done) Icon(Icons.Filled.Check, null, tint = color, modifier = Modifier.size(26.dp))
            else Text(if (frac != null) "${(frac * 100).toInt()}%" else "…", fontFamily = JetMono, fontSize = 15.sp, color = color)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(fileName, fontFamily = JetMono, fontSize = 12.sp, color = Neon.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${fmtBytes(downloaded)} / ${fmtBytes(total)}", fontFamily = JetMono, fontSize = 11.sp, color = Neon.TextDim)
            if (running) {
                val eta = if (speed > 1 && total > 0) ((total - downloaded) / speed).toLong() else -1L
                Text(
                    (if (speed > 0) "\u2066${fmtBytes(speed.toLong())}/s\u2069" else "…") +
                        (if (eta >= 0) " · متبقٍ ${if (eta >= 3600) "${eta / 3600} س ${(eta % 3600) / 60} د" else if (eta >= 60) "${eta / 60} د ${eta % 60} ث" else "$eta ث"}" else "") +
                        (if (connections > 0) " · $connections اتصال" else ""),
                    fontSize = 11.sp, color = Neon.Cyan)
            }
            if (paused && error == null) Text("متوقف مؤقتاً", color = Neon.Amber, style = MaterialTheme.typography.labelLarge)
            error?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall, maxLines = 3, overflow = TextOverflow.Ellipsis) }
            if (done) Text("اكتمل التنزيل", color = Neon.Green, style = MaterialTheme.typography.labelLarge)
            if (running || paused) {
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (running && connections > 0) GhostButton("إيقاف مؤقت", onPause, color = Neon.Amber, icon = Icons.Filled.Pause)
                    if (paused && !running) GhostButton("استئناف", onResume, color = Neon.Green, icon = Icons.Filled.PlayArrow)
                    GhostButton("إلغاء", onCancel, color = Neon.Red, icon = Icons.Filled.Close)
                }
            }
        }
    }
}


@Composable
private fun SpeedSettings(app: WakilApp) {
    var conn by remember { mutableIntStateOf(app.models.connections) }
    var mirror by remember { mutableStateOf(app.models.useMirror) }
    var think by remember { mutableStateOf(app.prefs.thinking) }
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.03f))
            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(18.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Speed, null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("التنزيل السريع", style = MaterialTheme.typography.titleSmall, color = Neon.Text, modifier = Modifier.weight(1f))
            Badge("$conn اتصال", Neon.Cyan)
        }
        Text("يقسم الملف ويُنزّله من عدة اتصالات معاً، ويكمل من حيث توقف إن انقطع النت.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
        androidx.compose.material3.Slider(
            value = conn.toFloat(), onValueChange = { conn = it.toInt(); app.models.connections = conn }, valueRange = 1f..16f, steps = 14,
            colors = androidx.compose.material3.SliderDefaults.colors(thumbColor = Neon.Cyan, activeTrackColor = Neon.Cyan, inactiveTrackColor = Color.White.copy(alpha = 0.12f))
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("خادم بديل (hf-mirror)", style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                Text("جرّبه إن كان Hugging Face بطيئاً عندك.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
            }
            androidx.compose.material3.Switch(mirror, { mirror = it; app.models.useMirror = it },
                colors = androidx.compose.material3.SwitchDefaults.colors(checkedThumbColor = Neon.Black, checkedTrackColor = Neon.Cyan))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("وضع التفكير العميق", style = MaterialTheme.typography.bodyMedium, color = Neon.Text)
                Text("نماذج Qwen3 وQwen3.5 تفكّر قبل الرد: أذكى لكن أبطأ.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim)
            }
            androidx.compose.material3.Switch(think, { think = it; app.prefs.thinking = it },
                colors = androidx.compose.material3.SwitchDefaults.colors(checkedThumbColor = Neon.Black, checkedTrackColor = Neon.Violet))
        }
    }
}

/** Search Hugging Face for any GGUF model — filter by size bucket and model family (v3.5) — and pick a file. */
@Composable
private fun HfSearchCard(app: WakilApp, onPick: (String) -> Unit) {
    var q by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var repos by remember { mutableStateOf<List<com.wakil.agent.llm.HfRepo>>(emptyList()) }
    var openRepo by remember { mutableStateOf<String?>(null) }
    var files by remember { mutableStateOf<List<com.wakil.agent.llm.HfFile>>(emptyList()) }
    var sizeLabel by remember { mutableStateOf(com.wakil.agent.llm.HfSearch.SIZE_BUCKETS.first().first) }
    var maxBytes by remember { mutableStateOf(Long.MAX_VALUE) }
    var fam by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    GlassCard(Modifier.fillMaxWidth()) {
        HudTitle("ابحث في Hugging Face", icon = Icons.Filled.TravelExplore)
        Text("آلاف النماذج بصيغة GGUF. رشّح النتائج بالحجم الذي يتسع لجوالك وبعائلة النموذج.", style = MaterialTheme.typography.bodySmall, color = Neon.TextDim, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(10.dp))
        NeonTextField(q, { q = it }, "اسم النموذج مثل qwen أو gemma أو llama", mono = true)
        Spacer(Modifier.height(8.dp))
        // filter chips: size bucket
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            com.wakil.agent.llm.HfSearch.SIZE_BUCKETS.forEach { (label, bytes) ->
                androidx.compose.material3.FilterChip(
                    selected = sizeLabel == label,
                    onClick = { sizeLabel = label; maxBytes = bytes },
                    label = { Text(label, fontSize = 11.sp, color = if (sizeLabel == label) Neon.Cyan else Neon.TextDim) },
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        // filter chips: model family
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            com.wakil.agent.llm.HfSearch.FAMILIES.forEach { (label, key) ->
                androidx.compose.material3.FilterChip(
                    selected = fam == key,
                    onClick = { fam = key },
                    label = { Text(label, fontSize = 11.sp, color = if (fam == key) Neon.Violet else Neon.TextDim) },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        GlowButton(if (busy) "جارٍ البحث…" else "بحث", {
            if (q.isBlank()) return@GlowButton
            busy = true; err = null; openRepo = null
            scope.launch {
                runCatching { com.wakil.agent.llm.HfSearch.search(q, maxBytes, fam) }
                    .onSuccess { repos = it; if (it.isEmpty()) err = "لا توجد نتائج بهذه الفلاتر — جرّب توسيع الحجم أو العائلة" }
                    .onFailure { err = "تعذّر البحث: ${it.message}" }
                busy = false
            }
        }, Modifier.fillMaxWidth(), enabled = !busy, icon = Icons.Filled.Search)
        err?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        repos.take(12).forEach { r ->
            val open = openRepo == r.id
            Column(
                Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(14.dp))
                    .background(if (open) Neon.Cyan.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.03f))
                    .clickable {
                        if (open) { openRepo = null; return@clickable }
                        openRepo = r.id; files = emptyList()
                        scope.launch { runCatching { com.wakil.agent.llm.HfSearch.files(r.id) }.onSuccess { files = it }.onFailure { err = "تعذّر فتح المستودع" } }
                    }.padding(10.dp)
            ) {
                Text(r.id, fontFamily = JetMono, fontSize = 12.sp, color = Neon.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(3.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (r.arch.isNotBlank()) Badge(r.arch, Neon.Violet)
                    if (r.minBytes > 0) Badge("أصغر نموذج ${fmtBytes(r.minBytes)}", Neon.Cyan)
                    Text("⬇ ${r.downloads}  ♥ ${r.likes}", fontSize = 11.sp, color = Neon.TextDim)
                }
                if (open) {
                    if (files.isEmpty()) Text("جارٍ جلب الملفات…", fontSize = 11.sp, color = Neon.TextDim)
                    files.take(10).forEach { f ->
                        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(f.path.substringAfterLast('/'), fontFamily = JetMono, fontSize = 11.sp, color = Neon.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(fmtBytes(f.size), fontSize = 10.sp, color = Neon.TextDim)
                            }
                            GhostButton("تنزيل", { onPick(com.wakil.agent.llm.HfSearch.fileUrl(r.id, f.path)) }, icon = Icons.Filled.Download)
                        }
                    }
                }
            }
        }
    }
}


@Composable
private fun BenchCard(app: WakilApp, model: String) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var result by remember(model) { mutableStateOf(app.prefs.benchFor(model)) }
    var err by remember { mutableStateOf<String?>(null) }
    Row(
        Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(18.dp)).background(Neon.Amber.copy(alpha = 0.06f))
            .border(1.dp, Neon.Amber.copy(alpha = 0.25f), RoundedCornerShape(18.dp)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Speed, null, tint = Neon.Amber, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("اختبار سرعة النموذج", style = MaterialTheme.typography.titleSmall, color = Neon.Text)
            Text(err ?: result?.let { "النتيجة: $it" } ?: "يقيس كم كلمة (توكن) يكتب في الثانية على جوالك.",
                style = MaterialTheme.typography.bodySmall, color = if (err != null) Neon.Red else Neon.TextDim)
        }
        GhostButton(if (busy) "جارٍ…" else "ابدأ", {
            if (busy || app.agent.running.value) return@GhostButton
            busy = true; err = null
            scope.launch {
                runCatching { app.llm.benchmark() }
                    .onSuccess { b ->
                        val v = "${"%.1f".format(b.genTps)} توكن/ث"
                        result = "$v · قراءة ${"%.0f".format(b.promptTps)} توكن/ث · محرك ${com.wakil.agent.llm.LlamaNative.variant} · ${app.prefs.effectiveThreads} خيوط" + (app.llm.lookupRate()?.let { " · قبول التخمين ${(it * 100).toInt()}%" } ?: ""); app.prefs.setBench(model, v)
                    }
                    .onFailure { err = it.message }
                busy = false
            }
        }, enabled = !busy, color = Neon.Amber, icon = Icons.Filled.PlayArrow)
    }
}
