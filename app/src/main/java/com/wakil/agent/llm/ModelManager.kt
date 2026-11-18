package com.wakil.agent.llm

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.wakil.agent.service.AgentForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** [ramGb]: phone RAM this model runs comfortably on. [tags]: short labels shown as badges. */
data class ModelPreset(val title: String, val sizeLabel: String, val url: String, val ramGb: Int = 6, val tags: List<String> = emptyList(), val note: String = "")

data class DownloadState(
    val fileName: String,
    val downloaded: Long,
    val total: Long,
    val running: Boolean,
    val error: String? = null,
    val done: Boolean = false,
    val speed: Double = 0.0,
    val connections: Int = 0,
    /** Interrupted fast download that can be resumed. */
    val paused: Boolean = false,
    val fast: Boolean = false,
)

/** Copying a saved model into the dedicated library folder (v3.5). */
data class MoveState(val name: String, val moved: Long, val total: Long, val running: Boolean, val error: String? = null, val done: Boolean = false)

/**
 * Model files. Downloads go through Android's system DownloadManager so they keep running after the app
 * is closed or killed, show their own progress notification, and resume after network drops.
 * Files land in the app's external files dir (Android/data/com.wakil.agent/files/models) and stay there.
 */
class ModelManager(private val ctx: Context, private val scope: CoroutineScope) {
    val dir: File = File(ctx.filesDir, "models").apply { mkdirs() }
    /** Where DownloadManager saves models (app-specific external storage, no permission needed). */
    val extDir: File? = ctx.getExternalFilesDir("models")?.apply { mkdirs() }
    private val sp = ctx.getSharedPreferences("wakil_dl", Context.MODE_PRIVATE)
    private val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
    private val _download = MutableStateFlow<DownloadState?>(null)
    val download: StateFlow<DownloadState?> = _download
    private val _files = MutableStateFlow(listFiles())
    val files: StateFlow<List<File>> = _files
    private var job: Job? = null
    /** Called with the finished file so the app can load it right away. */
    var onDownloaded: ((File) -> Unit)? = null
    /** Called with the ref (path or content:// uri) of a successfully imported model. */
    var onImported: ((String) -> Unit)? = null

    /** Models picked from the phone's storage and run in place (no copy). Persisted as JSON. */
    private val _ext = MutableStateFlow(ExtModels.fromJson(sp.getString("ext_models", null)))
    val ext: StateFlow<List<ExtModel>> = _ext

    /** GGUF header facts keyed by model ref (path or content uri) — probed lazily on IO threads. */
    private val _meta = MutableStateFlow<Map<String, GgufMeta>>(emptyMap())
    val meta: StateFlow<Map<String, GgufMeta>> = _meta

    // ---------- dedicated library folder (v3.5) ----------

    /** Persisted SAF tree the user picked once; every .gguf inside it becomes a runnable model. */
    private val _libTree = MutableStateFlow(sp.getString("lib_tree", null))
    val libTree: StateFlow<String?> = _libTree
    private val _lib = MutableStateFlow(Library.fromJson(sp.getString("lib_models", null)))
    val lib: StateFlow<List<Library.LibModel>> = _lib
    private val _move = MutableStateFlow<MoveState?>(null)
    val move: StateFlow<MoveState?> = _move

    private fun saveExt() = sp.edit().putString("ext_models", ExtModels.toJson(_ext.value)).apply()

    init {
        // Leftovers of the old in-app downloader (v1.0–1.5.1) that never finished; they can be gigabytes.
        dir.listFiles { f -> f.name.endsWith(".part") }?.forEach { it.delete() }
        // A download started earlier keeps running in the system even if the app was closed: pick it back up.
        if (sp.getLong("id", -1L) >= 0) watch()
        // An interrupted fast download: offer to resume it.
        sp.getString("fast_name", null)?.let { n ->
            val part = File(extDir ?: dir, "$n.part")
            if (part.exists()) {
                val meta = File(extDir ?: dir, "$n.meta")
                val (got, total) = runCatching {
                    val o = org.json.JSONObject(meta.readText()); val a = o.getJSONArray("segs")
                    val tot = o.getLong("total")
                    tot - (0 until a.length()).sumOf { val x = a.getJSONArray(it); (x.getLong(1) - x.getLong(2) + 1).coerceAtLeast(0) } to tot
                }.getOrDefault(0L to -1L)
                _download.value = DownloadState(n, got, total, false, paused = true, fast = true)
            } else sp.edit().remove("fast_url").remove("fast_name").apply()
        }
        probeAll()
        // A library folder picked earlier: re-scan it so its models are listed and probed.
        if (_libTree.value != null) scope.launch { scanLibrary() }
    }

    fun refresh() { _files.value = listFiles(); probeAll() }

    /** Reads the GGUF header of a model (path or content:// ref) once and caches the facts by ref. */
    suspend fun probe(ref: String): GgufMeta? = withContext(Dispatchers.IO) {
        _meta.value[ref]?.let { return@withContext it }
        val m = runCatching {
            if (ExtModels.isContentRef(ref)) ctx.contentResolver.openInputStream(android.net.Uri.parse(ref))?.use { Gguf.parse(it) }
            else Gguf.parseFile(File(ref))
        }.getOrNull()
        if (m != null) _meta.value = _meta.value + (ref to m)
        m
    }

    /** Probe every listed model (local files + phone-storage refs); results stream into [meta]. */
    fun probeAll() {
        scope.launch(Dispatchers.IO) { (files.value.map { it.path } + ext.value.map { it.uri }).forEach { probe(it) } }
    }

    /** Remember a picked folder as the model library, then scan it immediately. */
    fun pickLibraryTree(uri: android.net.Uri) {
        runCatching {
            ctx.contentResolver.takePersistableUriPermission(uri,
                android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        sp.edit().putString("lib_tree", uri.toString()).apply()
        _libTree.value = uri.toString()
        scope.launch { scanLibrary() }
    }

    /** Stop using the library folder (the folder and its files are untouched). */
    fun clearLibrary() {
        _libTree.value?.let {
            runCatching {
                ctx.contentResolver.releasePersistableUriPermission(android.net.Uri.parse(it),
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
        }
        sp.edit().remove("lib_tree").remove("lib_models").apply()
        _libTree.value = null
        _lib.value = emptyList()
    }

    /** Forget one scanned model (the file inside the folder is untouched). */
    fun forgetLib(docId: String) {
        _lib.value = _lib.value.filter { it.docId != docId }
        sp.edit().putString("lib_models", Library.toJson(_lib.value)).apply()
    }

    /** The content:// ref that runs a scanned library model in place. */
    fun libRef(m: Library.LibModel): String? {
        val tree = _libTree.value ?: return null
        return runCatching {
            android.provider.DocumentsContract.buildDocumentUriUsingTree(android.net.Uri.parse(tree), m.docId).toString()
        }.getOrNull()
    }

    /** Re-scan the library folder; returns the number of models now listed (0 when unset). */
    suspend fun scanLibrary(): Int = withContext(Dispatchers.IO) {
        val tree = _libTree.value ?: return@withContext 0
        val n = runCatching {
            val turi = android.net.Uri.parse(tree)
            val childrenUri = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(turi, android.provider.DocumentsContract.getTreeDocumentId(turi))
            val cols = arrayOf(
                android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                android.provider.DocumentsContract.Document.COLUMN_SIZE)
            val scanned = ArrayList<Library.LibModel>()
            ctx.contentResolver.query(childrenUri, cols, null, null, null)?.use { c ->
                while (c.moveToNext()) {
                    val docId = c.getString(0) ?: continue
                    val name = c.getString(1) ?: continue
                    val size = if (c.isNull(2)) 0L else c.getLong(2)
                    if (Library.isModelName(name, size)) scanned.add(Library.LibModel(docId, Library.cleanName(name), size))
                }
            }
            _lib.value = Library.merge(_lib.value, scanned)
            sp.edit().putString("lib_models", Library.toJson(_lib.value)).apply()
            _lib.value.size
        }.getOrDefault(0)
        if (n > 0) _lib.value.forEach { libRef(it)?.let { r -> probe(r) } }
        n
    }

    /**
     * Move a saved model (app storage) into the library folder: stream-copy through SAF with
     * progress, delete the source when the copy verifies, then re-scan. Null on success.
     */
    suspend fun moveToLibrary(f: File): String? = withContext(Dispatchers.IO) {
        val tree = _libTree.value ?: return@withContext "اختر مجلد المكتبة أولاً"
        try {
            val turi = android.net.Uri.parse(tree)
            val parent = android.provider.DocumentsContract.buildDocumentUriUsingTree(turi, android.provider.DocumentsContract.getTreeDocumentId(turi))
            val doc = android.provider.DocumentsContract.createDocument(ctx.contentResolver, parent, "application/octet-stream", f.name)
                ?: return@withContext "تعذّر إنشاء الملف داخل مجلد المكتبة"
            _move.value = MoveState(f.name, 0, f.length(), true)
            AgentForegroundService.acquire(ctx, "نقل إلى المكتبة: ${f.name}")
            var moved = 0L
            val ok = runCatching {
                ctx.contentResolver.openOutputStream(doc)!!.use { out ->
                    f.inputStream().use { input ->
                        val buf = ByteArray(1 shl 18)
                        var last = 0L
                        while (true) {
                            val n = input.read(buf); if (n < 0) break
                            out.write(buf, 0, n); moved += n
                            val now = System.currentTimeMillis()
                            if (now - last > 300) { last = now; _move.value = MoveState(f.name, moved, f.length(), true) }
                        }
                        out.flush()
                    }
                }
            }.isSuccess && moved == f.length()
            if (ok) {
                f.delete()
                refresh()
                scanLibrary()
                _move.value = MoveState(f.name, moved, moved, false, done = true)
                null
            } else {
                runCatching { android.provider.DocumentsContract.deleteDocument(ctx.contentResolver, doc) }
                _move.value = MoveState(f.name, moved, f.length(), false, error = "فشل النقل — تحقق من مساحة المجلد والإذن")
                "فشل نقل ${f.name} إلى مجلد المكتبة"
            }
        } catch (e: Exception) {
            _move.value = MoveState(f.name, 0, f.length(), false, error = e.message ?: e.toString())
            "فشل النقل: ${e.message ?: e}"
        } finally {
            AgentForegroundService.release(ctx)
        }
    }

    fun clearMove() { _move.value = null }

    private fun listFiles(): List<File> =
        listOfNotNull(dir, extDir).flatMap { d -> d.listFiles { f -> f.name.endsWith(".gguf") && f.length() > 0 }?.toList() ?: emptyList() }
            .sortedBy { it.name }

    fun delete(f: File) { f.delete(); refresh() }

    /** Parallel connections for the fast downloader (1–16). */
    var connections: Int
        get() = sp.getInt("conn", 8)
        set(v) = sp.edit().putInt("conn", v.coerceIn(1, 16)).apply()
    var useMirror: Boolean
        get() = sp.getBoolean("mirror", false)
        set(v) = sp.edit().putBoolean("mirror", v).apply()
    private var fast: FastDownloader? = null

    private fun nameOf(url: String) = url.substringAfterLast('/').substringBefore('?').ifBlank { "model.gguf" }
        .let { if (it.endsWith(".gguf")) it else "$it.gguf" }

    /** Fast multi-connection download (default). Falls back to the system DownloadManager if the server can't do ranges. */
    fun startDownload(url: String) {
        if (job?.isActive == true) return
        val name = nameOf(url)
        val base = extDir ?: dir
        val target = File(base, name)
        val realUrl = FastDownloader.mirror(url, useMirror)
        sp.edit().putString("fast_url", url).putString("fast_name", name).apply()
        val dl = FastDownloader(realUrl, target, connections) { done, total, speed, active ->
            _download.value = DownloadState(name, done, total, true, speed = speed, connections = active, fast = true)
            notifyProgress(name, done, total, speed)
        }
        fast = dl
        _download.value = DownloadState(name, 0, -1, true, fast = true, connections = connections)
        job = scope.launch(Dispatchers.IO) {
            AgentForegroundService.acquire(ctx, "تنزيل سريع: $name")
            try {
                val f = dl.run()
                sp.edit().remove("fast_url").remove("fast_name").apply()
                _download.value = DownloadState(name, f.length(), f.length(), false, done = true, fast = true)
                notifyDone(name, null)
                refresh(); onDownloaded?.invoke(f)
            } catch (e: FastDownloader.NoRangeException) {
                sp.edit().remove("fast_url").remove("fast_name").apply()
                dl.discard()
                launch(Dispatchers.Main) { startSystemDownload(realUrl) }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                val st = _download.value
                _download.value = DownloadState(name, st?.downloaded ?: 0, st?.total ?: -1, false,
                    error = "توقف التنزيل: ${e.message ?: e}. اضغط استئناف ليكمل من حيث توقف.", paused = true, fast = true)
                notifyDone(name, "توقف التنزيل، افتح وكيل للاستئناف")
            } finally {
                AgentForegroundService.release(ctx)
            }
        }
    }

    fun pauseDownload() {
        if (fast == null || job?.isActive != true) return
        job?.cancel()
        val st = _download.value
        _download.value = st?.copy(running = false, paused = true, error = null, speed = 0.0)
        ctx.getSystemService(android.app.NotificationManager::class.java).cancel(NOTIF_DL)
    }

    fun resumeDownload() { sp.getString("fast_url", null)?.let { startDownload(it) } }

    private fun notifyProgress(name: String, done: Long, total: Long, speed: Double) {
        val pct = if (total > 0) (done * 100 / total).toInt() else 0
        val n = android.app.Notification.Builder(ctx, com.wakil.agent.WakilApp.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("وكيل: تنزيل سريع · $pct%")
            .setContentText("$name · ${"%.1f".format(speed / 1048576)} MB/s")
            .setProgress(100, pct, total <= 0).setOngoing(true).setOnlyAlertOnce(true).build()
        runCatching { ctx.getSystemService(android.app.NotificationManager::class.java).notify(NOTIF_DL, n) }
    }

    private fun notifyDone(name: String, err: String?) {
        val n = android.app.Notification.Builder(ctx, com.wakil.agent.WakilApp.CHANNEL_ID)
            .setSmallIcon(if (err == null) android.R.drawable.stat_sys_download_done else android.R.drawable.stat_notify_error)
            .setContentTitle(if (err == null) "اكتمل تنزيل النموذج" else "وكيل: التنزيل متوقف")
            .setContentText(err ?: name).setAutoCancel(true).build()
        runCatching { ctx.getSystemService(android.app.NotificationManager::class.java).notify(NOTIF_DL, n) }
    }

    fun cancelDownload() {
        fast?.let { job?.cancel(); it.discard(); fast = null }
        sp.getString("fast_name", null)?.let { n -> File(extDir ?: dir, "$n.part").delete(); File(extDir ?: dir, "$n.meta").delete() }
        sp.edit().remove("fast_url").remove("fast_name").apply()
        ctx.getSystemService(android.app.NotificationManager::class.java).cancel(NOTIF_DL)
        val id = sp.getLong("id", -1L)
        if (id >= 0) runCatching { dm.remove(id) }
        sp.edit().remove("id").remove("name").apply()
        job?.cancel()
        _download.value = _download.value?.copy(running = false, error = "أُلغي التنزيل")
    }

    /** Single-connection download through Android's DownloadManager (fallback). */
    fun startSystemDownload(url: String) {
        if (sp.getLong("id", -1L) >= 0 && job?.isActive == true) return
        val name = nameOf(url)
        val base = extDir ?: run { _download.value = DownloadState(name, 0, -1, false, error = "لا توجد ذاكرة تخزين متاحة"); return }
        File(base, "$name.download").delete()
        val req = android.app.DownloadManager.Request(android.net.Uri.parse(url))
            .setTitle("وكيل: تنزيل النموذج")
            .setDescription(name)
            .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(ctx, "models", "$name.download")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true)
            .addRequestHeader("User-Agent", "Wakil/1.5")
        val id = try { dm.enqueue(req) } catch (e: Exception) {
            _download.value = DownloadState(name, 0, -1, false, error = e.message ?: e.toString()); return
        }
        sp.edit().putLong("id", id).putString("name", name).apply()
        _download.value = DownloadState(name, 0, -1, true)
        watch()
    }

    /** Polls the system download for progress until it finishes, then moves it into place. */
    private fun watch() {
        job?.cancel()
        job = scope.launch(Dispatchers.IO) {
            while (isActive) {
                val id = sp.getLong("id", -1L); if (id < 0) break
                val name = sp.getString("name", null) ?: "model.gguf"
                val q = android.app.DownloadManager.Query().setFilterById(id)
                val row = dm.query(q)?.use { c ->
                    if (!c.moveToFirst()) null else Triple(
                        c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS)),
                        c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
                        c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_TOTAL_SIZE_BYTES)) to
                            c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_REASON)),
                    )
                }
                if (row == null) { // removed from the system list (cancelled from the notification)
                    sp.edit().remove("id").remove("name").apply()
                    _download.value = DownloadState(name, 0, -1, false, error = "أُلغي التنزيل")
                    break
                }
                val (status, done, totalReason) = row
                val (total, reason) = totalReason
                when (status) {
                    android.app.DownloadManager.STATUS_SUCCESSFUL -> {
                        val tmp = File(extDir, "$name.download")
                        val target = File(extDir, name)
                        target.delete()
                        val ok = tmp.renameTo(target)
                        sp.edit().remove("id").remove("name").apply()
                        if (ok) {
                            _download.value = DownloadState(name, target.length(), target.length(), false, done = true)
                            refresh()
                            onDownloaded?.invoke(target)
                        } else {
                            _download.value = DownloadState(name, done, total, false, error = "تعذّر حفظ الملف")
                        }
                        break
                    }
                    android.app.DownloadManager.STATUS_FAILED -> {
                        sp.edit().remove("id").remove("name").apply()
                        runCatching { dm.remove(id) }
                        _download.value = DownloadState(name, done, total, false, error = failText(reason))
                        break
                    }
                    android.app.DownloadManager.STATUS_PAUSED ->
                        _download.value = DownloadState(name, done, total, true, error = pauseText(reason))
                    else -> _download.value = DownloadState(name, done, total, true)
                }
                delay(500)
            }
        }
    }

    private fun pauseText(r: Int) = when (r) {
        android.app.DownloadManager.PAUSED_WAITING_FOR_NETWORK -> "بانتظار الاتصال بالإنترنت…"
        android.app.DownloadManager.PAUSED_WAITING_TO_RETRY -> "انقطع الاتصال، سيُعاد المحاولة تلقائياً…"
        android.app.DownloadManager.PAUSED_QUEUED_FOR_WIFI -> "بانتظار شبكة Wi-Fi…"
        else -> "متوقف مؤقتاً…"
    }

    private fun failText(r: Int) = when (r) {
        android.app.DownloadManager.ERROR_INSUFFICIENT_SPACE -> "المساحة غير كافية على الجهاز"
        android.app.DownloadManager.ERROR_HTTP_DATA_ERROR, android.app.DownloadManager.ERROR_CANNOT_RESUME -> "انقطع التنزيل، أعد المحاولة"
        android.app.DownloadManager.ERROR_TOO_MANY_REDIRECTS, android.app.DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "الرابط لا يعمل"
        in 400..599 -> "خطأ من الخادم (HTTP $r)"
        else -> "فشل التنزيل ($r)"
    }

    /** Copies a user-picked .gguf (SAF uri) into app storage. */
    fun import(uri: Uri) {
        scope.launch(Dispatchers.IO) {
            var name = "imported.gguf"
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0) ?: name
            }
            name = ExtModels.normalizeName(name)
            val target = File(dir, name)
            AgentForegroundService.acquire(ctx, "استيراد النموذج: $name")
            try {
                _download.value = DownloadState(name, 0, -1, true)
                ctx.contentResolver.openInputStream(uri)!!.use { input ->
                    // Verify the GGUF magic before copying gigabytes into a doomed file.
                    val head = ByteArray(4)
                    val got = input.read(head)
                    if (got < 4 || !ExtModels.isGgufMagic(head)) {
                        _download.value = DownloadState(name, 0, -1, false, error = "الملف ليس نموذج GGUF صالح (اختر ملفاً بلاحقة .gguf)")
                        return@use
                    }
                    target.outputStream().use { out ->
                        out.write(head)
                        val buf = ByteArray(1 shl 16)
                        var done = 4L; var last = 0L
                        while (true) {
                            val n = input.read(buf); if (n < 0) break
                            out.write(buf, 0, n); done += n
                            val now = System.currentTimeMillis()
                            if (now - last > 300) { last = now; _download.value = DownloadState(name, done, -1, true) }
                        }
                    }
                }
                if (target.length() > 0) {
                    _download.value = DownloadState(name, target.length(), target.length(), false, done = true)
                    onImported?.invoke(target.path)
                }
            } catch (e: Exception) {
                target.delete()
                _download.value = DownloadState(name, 0, -1, false, error = e.message)
            } finally {
                AgentForegroundService.release(ctx)
                refresh()
            }
        }
    }

    /**
     * Instant import: remember a picked phone file (SAF uri) and run it in place — no copy.
     * Returns null on success or an Arabic error message for the UI.
     */
    suspend fun importInstant(uri: Uri): String? = withContext(Dispatchers.IO) {
        try {
            var name = "model.gguf"
            var size = -1L
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    name = c.getString(0) ?: name
                    size = if (c.isNull(1)) -1L else c.getLong(1)
                }
            }
            name = ExtModels.normalizeName(name)
            if (ExtModels.splitParts(name) != null)
                return@withContext "النموذج مقسّم إلى أجزاء (${name}) — التشغيل الفوري لا يدعم النماذج المقسّمة. استخدم «نسخ إلى التطبيق» لكل جزء بالأسماء الأصلية."
            // Reject non-GGUF files up front (a cloud provider may serve an html error page or a pipe).
            runCatching {
                ctx.contentResolver.openInputStream(uri)?.use { input ->
                    val head = ByteArray(4)
                    val got = input.read(head)
                    if (got < 4 || !ExtModels.isGgufMagic(head)) return@withContext "الملف ليس نموذج GGUF صالح (اختر ملفاً بلاحقة .gguf)"
                } ?: return@withContext "تعذّر قراءة الملف من ذاكرة الهاتف"
            }.getOrElse { return@withContext "تعذّر قراءة الملف من ذاكرة الهاتف: ${it.message ?: it}" }
            // Keep read access across restarts; providers that don't support it still work this session.
            runCatching { ctx.contentResolver.takePersistableUriPermission(uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            val item = ExtModel(uri.toString(), name, size, System.currentTimeMillis())
            _ext.value = listOf(item) + _ext.value.filter { it.uri != item.uri }
            saveExt()
            probe(item.uri)
            onImported?.invoke(item.uri)
            null
        } catch (e: SecurityException) {
            "لا تملك الوكيل إذن قراءة هذا الملف — أعِد اختياره"
        } catch (e: Exception) {
            "تعذّر الاستيراد: ${e.message ?: e}"
        }
    }

    /** Forget an in-place model reference (the original file on the phone is untouched). */
    fun removeExt(uri: String) {
        _ext.value = _ext.value.filter { it.uri != uri }
        saveExt()
        runCatching { ctx.contentResolver.releasePersistableUriPermission(android.net.Uri.parse(uri), android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION) }
    }

    companion object {
        const val NOTIF_DL = 9300
        /** Best preset for a phone with [ramGb] of RAM: the newest smart model that fits. */
        fun recommendedIndex(ramGb: Double): Int = when {
            ramGb >= 11.0 -> 2   // Qwen3.5-4B (12 GB phones run it smoothly)
            ramGb >= 7.0 -> 2
            else -> 1            // Qwen3.5-2B
        }
        private const val HF = "https://huggingface.co/"
        val PRESETS = listOf(
            ModelPreset("Qwen3.5-9B — الأذكى", "5.7 GB", HF + "unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf",
                12, listOf("جديد", "ذكاء عالٍ", "عربي ممتاز"), "أقوى نموذج يعمل على الجوال، يحتاج 12 GB رام ويكون أبطأ."),
            ModelPreset("Qwen3.5-2B — سريع جداً", "1.3 GB", HF + "unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
                4, listOf("جديد", "سريع"), "خفيف وسريع للمهام اليومية."),
            ModelPreset("Qwen3.5-4B — موصى به", "2.7 GB", HF + "unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
                6, listOf("جديد", "متوازن", "وكيل"), "أفضل توازن بين الذكاء والسرعة لتنفيذ المهام."),
            ModelPreset("Gemma 4 E4B — من Google", "5.0 GB", HF + "unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf",
                10, listOf("جديد", "Google", "متعدد اللغات"), "نموذج Google الجديد للأجهزة، قوي في العربية والكتابة."),
            ModelPreset("Gemma 4 E2B — من Google", "3.1 GB", HF + "unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf",
                6, listOf("جديد", "Google"), "نسخة أخف من Gemma 4."),
            ModelPreset("Qwen3-4B-Instruct-2507 — منفّذ مهام", "2.5 GB", HF + "unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
                6, listOf("بدون تفكير", "أدوات"), "يرد مباشرة بدون تفكير طويل، ممتاز لاستدعاء الأدوات."),
            ModelPreset("DeepSeek-R1-0528-Qwen3-8B — تفكير عميق", "5.0 GB", HF + "unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF/resolve/main/DeepSeek-R1-0528-Qwen3-8B-Q4_K_M.gguf",
                12, listOf("استدلال", "رياضيات"), "يفكّر قبل الإجابة، للمسائل الصعبة."),
            ModelPreset("Qwen2.5-Coder-3B — مبرمج", "2.1 GB", HF + "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf",
                6, listOf("برمجة"), "مخصص لكتابة الكود وإصلاحه."),
            ModelPreset("Phi-4-mini — من Microsoft", "2.5 GB", HF + "unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf",
                6, listOf("Microsoft", "منطق"), "قوي في المنطق والرياضيات بالإنجليزية."),
            ModelPreset("Llama 3.2 3B — من Meta", "2.0 GB", HF + "bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
                6, listOf("Meta"), "نموذج Meta الخفيف."),
            ModelPreset("SmolLM3-3B — مفتوح بالكامل", "1.9 GB", HF + "ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf",
                4, listOf("خفيف"), ""),
            ModelPreset("Qwen3-1.7B — الأخف", "1.1 GB", HF + "unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
                3, listOf("سريع"), "للجوالات ذات الرام القليلة."),
            ModelPreset("Qwen2.5-3B-Instruct", "2.1 GB", HF + "Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
                6, listOf("مجرّب"), "النموذج السابق الموصى به."),
        )
    }
}
