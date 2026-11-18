package com.wakil.agent.github

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.wakil.agent.MainActivity
import com.wakil.agent.Prefs
import com.wakil.agent.WakilApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** App-wide GitHub state: account, project creation, cloud builds and APK install. */
class GhManager(private val ctx: Context, private val prefs: Prefs, private val scope: CoroutineScope) {
    val api = GitHub { prefs.ghToken }

    private val _user = MutableStateFlow<GhUser?>(null)
    val user: StateFlow<GhUser?> = _user
    val connected get() = prefs.ghToken.isNotBlank()

    /** Runs being watched in the background: repo full name → run id. */
    private val watching = mutableMapOf<String, Job>()
    private val _watch = MutableStateFlow<Map<String, GhRun>>(emptyMap())
    val watched: StateFlow<Map<String, GhRun>> = _watch

    init { if (connected) scope.launch { runCatching { _user.value = api.user() } } }

    suspend fun connect(token: String): GhUser {
        val old = prefs.ghToken
        prefs.ghToken = token.trim()
        return runCatching { api.user() }.onSuccess { _user.value = it }.getOrElse { prefs.ghToken = old; throw it }
    }

    fun logout() { prefs.ghToken = ""; _user.value = null }

    suspend fun refreshUser() { if (connected) _user.value = api.user() }

    /** Creates a repo from a template and pushes all its files in one commit. */
    suspend fun createProject(t: GhTemplate, repoName: String, appName: String, private: Boolean): GhRepo {
        val repo = api.createRepo(repoName, private, "${t.title} — built with Wakil")
        val files = Templates.files(ctx, t, Templates.names(appName, repoName))
        var err: Throwable? = null
        repeat(5) { i ->
            val ok = runCatching { api.pushFiles(repo.full, repo.defaultBranch, files, "🤖 مشروع ${t.title} من وكيل") }
            if (ok.isSuccess) { watchNext(repo); return repo }
            err = ok.exceptionOrNull(); delay(1500L * (i + 1))
        }
        throw err ?: IllegalStateException("push failed")
    }

    /** Detects the project type of an existing repo. */
    suspend fun detect(repo: GhRepo): Triple<BuildKind, String, String?>? {
        val root = api.list(repo.full, "")
        val names = root.map { it.name }.toSet()
        val pkg = if ("package.json" in names) runCatching { api.read(repo.full, "package.json").text }.getOrNull() else null
        val nextName = names.firstOrNull { it.startsWith("next.config") }
        val next = nextName?.let { runCatching { api.read(repo.full, it).text }.getOrNull() }
        return Templates.detect(names, pkg, next)
    }

    /** Adds Wakil's APK workflow (+ signing key) to an existing repo. */
    suspend fun addBuild(repo: GhRepo, kind: BuildKind, webDir: String) {
        val files = Templates.buildFiles(ctx, kind, Templates.names(repo.name, repo.name), webDir)
        api.pushFiles(repo.full, repo.defaultBranch, files, "🤖 إضافة بناء APK عبر GitHub Actions (وكيل)")
        watchNext(repo)
    }

    /** The workflow Wakil should run: its own first, else one whose file mentions apk/android. */
    suspend fun buildWorkflow(repo: GhRepo): GhWorkflow? {
        val wfs = api.workflows(repo.full).filter { it.state == "active" }
        return wfs.firstOrNull { it.path.endsWith("wakil-build-apk.yml") }
            ?: wfs.firstOrNull { (it.name + it.path).contains("apk", true) || (it.name + it.path).contains("android", true) }
            ?: wfs.firstOrNull()
    }

    suspend fun buildNow(repo: GhRepo, wf: GhWorkflow) {
        api.dispatch(repo.full, wf.id, repo.defaultBranch)
        watchNext(repo)
    }

    /** Dispatches a build and suspends until it finishes (max ~25 min). */
    suspend fun buildAndWait(repo: GhRepo, wf: GhWorkflow, onProgress: (GhRun) -> Unit): GhRun {
        watching[repo.full]?.cancel()
        val known = runCatching { api.runs(repo.full, 10).map { it.id }.toSet() }.getOrDefault(emptySet())
        api.dispatch(repo.full, wf.id, repo.defaultBranch)
        var run: GhRun? = null
        for (i in 0 until 40) {
            delay(3000)
            run = runCatching { api.runs(repo.full, 10).firstOrNull { it.id !in known } }.getOrNull()
            if (run != null) break
        }
        var r = run ?: throw IllegalStateException("لم يبدأ البناء في GitHub Actions (تحقق من تفعيل Actions في المستودع)")
        _watch.value = _watch.value + (repo.full to r)
        val deadline = System.currentTimeMillis() + 25 * 60_000
        while (r.active && System.currentTimeMillis() < deadline) {
            delay(10_000)
            r = runCatching { api.run(repo.full, r.id) }.getOrDefault(r)
            _watch.value = _watch.value + (repo.full to r); onProgress(r)
        }
        notifyDone(repo, r)
        return r
    }

    /** The useful part of a failed job log: error lines with a little context, else the tail. */
    suspend fun errorDigest(full: String, jobId: Long): String {
        val log = api.jobLogTail(full, jobId, 400)
        val lines = log.lines().map { it.replace(Regex("^\\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z "), "") }
        val pat = Regex("(error|e: |FAILURE|What went wrong|Exception|failed|cannot find symbol|Unresolved reference|\\.(kt|java|dart|js|ts|tsx|jsx):\\d+)", RegexOption.IGNORE_CASE)
        val keep = sortedSetOf<Int>()
        lines.forEachIndexed { i, l -> if (pat.containsMatchIn(l) && !l.contains("##[group]")) (i - 1..i + 2).forEach { if (it in lines.indices) keep += it } }
        val picked = keep.toList().takeLast(70).map { lines[it] }
        return if (picked.size >= 3) "Error lines:\n" + picked.joinToString("\n") else "Log tail:\n" + lines.takeLast(60).joinToString("\n")
    }

    /** Wait for the next new run in [repo] and notify when it finishes. */
    fun watchNext(repo: GhRepo) {
        watching[repo.full]?.cancel()
        watching[repo.full] = scope.launch {
            val known = runCatching { api.runs(repo.full, 10).map { it.id }.toSet() }.getOrDefault(emptySet())
            var run: GhRun? = null
            for (i in 0 until 30) {                     // up to ~90 s for the run to appear
                delay(3000)
                run = runCatching { api.runs(repo.full, 10).firstOrNull { it.id !in known } }.getOrNull()
                if (run != null) break
            }
            run ?: return@launch
            watchRun(repo, run)
        }
    }

    private suspend fun watchRun(repo: GhRepo, start: GhRun) {
        var r = start
        _watch.value = _watch.value + (repo.full to r)
        while (r.active) {
            delay(10_000)
            r = runCatching { api.run(repo.full, r.id) }.getOrDefault(r)
            _watch.value = _watch.value + (repo.full to r)
        }
        notifyDone(repo, r)
    }

    private fun notifyDone(repo: GhRepo, r: GhRun) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val open = PendingIntent.getActivity(
            ctx, repo.full.hashCode(),
            Intent(ctx, MainActivity::class.java).putExtra("tab", 3).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val ok = r.ok
        nm.notify(
            7000 + (repo.full.hashCode() and 0xFFF),
            Notification.Builder(ctx, WakilApp.APPROVAL_CHANNEL_ID)
                .setSmallIcon(if (ok) android.R.drawable.stat_sys_download_done else android.R.drawable.stat_notify_error)
                .setContentTitle(if (ok) "✅ تم بناء ${repo.name}" else "❌ فشل بناء ${repo.name}")
                .setContentText(if (ok) "ملف APK جاهز للتنزيل والتثبيت من وكيل" else "افتح وكيل لرؤية سبب الخطأ (${r.conclusion})")
                .setContentIntent(open).setAutoCancel(true).build()
        )
    }

    /** Downloads the APK artifact of a run and opens the installer. Returns an error message or null. */
    suspend fun installFromRun(repo: GhRepo, runId: Long, progress: (Float) -> Unit): String? {
        val arts = api.artifacts(repo.full, runId).filter { !it.expired }
        val art = arts.firstOrNull { it.name.contains("apk", true) } ?: arts.firstOrNull()
            ?: return "لا يوجد ملف ناتج (artifact) في هذا البناء."
        val dir = File(ctx.filesDir, "gh-apks")
        val apks = api.downloadApks(art, dir) { r, t -> if (t > 0) progress(r.toFloat() / t) }
        val apk = apks.firstOrNull { it.name.contains("release") } ?: apks.firstOrNull()
            ?: return "الملف الناتج لا يحتوي على APK."
        return withContext(Dispatchers.Main) { com.wakil.agent.env.ApkInstaller.install(ctx, apk) }
    }
}
