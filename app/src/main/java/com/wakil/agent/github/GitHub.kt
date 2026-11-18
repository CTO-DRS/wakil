package com.wakil.agent.github

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.zip.ZipInputStream

class GhException(val code: Int, msg: String) : IOException(msg)

data class GhUser(val login: String, val name: String, val avatar: String)
data class GhRepo(
    val owner: String, val name: String, val private: Boolean, val description: String,
    val language: String, val defaultBranch: String, val updated: String, val htmlUrl: String,
) { val full get() = "$owner/$name" }
data class GhEntry(val name: String, val path: String, val type: String, val size: Long, val sha: String) {
    val isDir get() = type == "dir"
}
data class GhFile(val path: String, val sha: String, val text: String?, val size: Long)
data class GhWorkflow(val id: Long, val name: String, val path: String, val state: String)
data class GhRun(
    val id: Long, val name: String, val title: String, val status: String, val conclusion: String,
    val branch: String, val event: String, val created: String, val htmlUrl: String, val number: Int,
) {
    val active get() = status == "queued" || status == "in_progress" || status == "waiting" || status == "pending" || status == "requested"
    val ok get() = conclusion == "success"
}
data class GhStep(val name: String, val status: String, val conclusion: String)
data class GhJob(val id: Long, val name: String, val status: String, val conclusion: String, val steps: List<GhStep>)
data class GhArtifact(val id: Long, val name: String, val size: Long, val expired: Boolean, val url: String)

/** Minimal GitHub REST client (token auth). All calls run on IO. */
class GitHub(private val token: () -> String) {
    private val api = "https://api.github.com"

    private fun enc(p: String) = p.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }

    private suspend fun call(method: String, path: String, body: Any? = null, accept: String = "application/vnd.github+json"): String =
        withContext(Dispatchers.IO) {
            val c = (URL(if (path.startsWith("http")) path else api + path).openConnection() as HttpURLConnection)
            c.requestMethod = method
            c.connectTimeout = 20_000; c.readTimeout = 60_000
            c.setRequestProperty("Accept", accept)
            c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            c.setRequestProperty("User-Agent", "Wakil-Android")
            val t = token(); if (t.isNotBlank()) c.setRequestProperty("Authorization", "Bearer $t")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = c.responseCode
            val text = (if (code >= 400) c.errorStream else c.inputStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code >= 400) {
                val m = runCatching { JSONObject(text).optString("message") }.getOrNull().orEmpty()
                throw GhException(code, friendly(code, m))
            }
            text
        }

    private fun friendly(code: Int, m: String) = when (code) {
        401 -> "الرمز غير صالح أو منتهي (401). أنشئ رمزاً جديداً."
        403 -> if (m.contains("rate limit", true)) "تجاوزت حد طلبات GitHub، انتظر قليلاً." else "مرفوض (403): $m — تأكد أن الرمز فيه صلاحيات repo و workflow."
        404 -> "غير موجود (404) — أو الرمز لا يملك صلاحية على هذا المستودع."
        409 -> "تعارض (409): $m"
        422 -> "طلب غير صالح (422): $m"
        else -> "خطأ GitHub $code: $m"
    }

    suspend fun user(): GhUser = JSONObject(call("GET", "/user")).let {
        GhUser(it.getString("login"), it.optString("name").takeIf { n -> n != "null" }.orEmpty(), it.optString("avatar_url"))
    }

    private fun repo(o: JSONObject) = GhRepo(
        o.getJSONObject("owner").getString("login"), o.getString("name"), o.optBoolean("private"),
        o.optString("description").takeIf { it != "null" }.orEmpty(), o.optString("language").takeIf { it != "null" }.orEmpty(),
        o.optString("default_branch", "main"), o.optString("updated_at"), o.optString("html_url"),
    )

    suspend fun repos(): List<GhRepo> {
        val out = mutableListOf<GhRepo>()
        for (page in 1..3) {
            val a = JSONArray(call("GET", "/user/repos?per_page=100&sort=updated&page=$page"))
            for (i in 0 until a.length()) out += repo(a.getJSONObject(i))
            if (a.length() < 100) break
        }
        return out
    }

    suspend fun getRepo(full: String): GhRepo = repo(JSONObject(call("GET", "/repos/$full")))

    suspend fun createRepo(name: String, private: Boolean, description: String): GhRepo = repo(JSONObject(call(
        "POST", "/user/repos",
        JSONObject().put("name", name).put("private", private).put("description", description).put("auto_init", true)
    )))

    suspend fun list(full: String, path: String, ref: String? = null): List<GhEntry> {
        val r = call("GET", "/repos/$full/contents/${enc(path)}" + (ref?.let { "?ref=$it" } ?: ""))
        val a = runCatching { JSONArray(r) }.getOrNull() ?: return emptyList()
        return (0 until a.length()).map { a.getJSONObject(it) }.map {
            GhEntry(it.getString("name"), it.getString("path"), it.getString("type"), it.optLong("size"), it.optString("sha"))
        }.sortedWith(compareBy({ !it.isDir }, { it.name.lowercase() }))
    }

    suspend fun read(full: String, path: String): GhFile {
        val o = JSONObject(call("GET", "/repos/$full/contents/${enc(path)}"))
        val size = o.optLong("size")
        val b64 = o.optString("content")
        val text = if (b64.isNotEmpty()) {
            val bytes = Base64.decode(b64, Base64.DEFAULT)
            if (bytes.take(8000).any { it == 0.toByte() }) null else String(bytes, Charsets.UTF_8)
        } else if (size == 0L) "" else null
        return GhFile(o.getString("path"), o.getString("sha"), text, size)
    }

    /** Create or update one file (one commit). Returns the new sha. */
    suspend fun write(full: String, path: String, text: String, sha: String?, message: String, branch: String? = null): String {
        val body = JSONObject().put("message", message)
            .put("content", Base64.encodeToString(text.toByteArray(), Base64.NO_WRAP))
        if (!sha.isNullOrBlank()) body.put("sha", sha)
        if (branch != null) body.put("branch", branch)
        return JSONObject(call("PUT", "/repos/$full/contents/${enc(path)}", body)).getJSONObject("content").getString("sha")
    }

    suspend fun delete(full: String, path: String, sha: String, message: String) {
        call("DELETE", "/repos/$full/contents/${enc(path)}", JSONObject().put("message", message).put("sha", sha))
    }

    /** Commit many files at once on [branch] (Git Data API). */
    /** Every file path in the repo (recursive), with sizes. */
    suspend fun tree(full: String, branch: String): List<Pair<String, Long>> {
        val o = JSONObject(call("GET", "/repos/$full/git/trees/$branch?recursive=1"))
        val a = o.getJSONArray("tree")
        return (0 until a.length()).map { a.getJSONObject(it) }.filter { it.optString("type") == "blob" }
            .map { it.getString("path") to it.optLong("size") }
    }

    suspend fun pushFiles(full: String, branch: String, files: Map<String, String>, message: String) =
        pushFilesOrDelete(full, branch, files, message)

    /** One commit with many files; a null content deletes that path. */
    suspend fun pushFilesOrDelete(full: String, branch: String, files: Map<String, String?>, message: String) {
        val ref = JSONObject(call("GET", "/repos/$full/git/ref/heads/$branch"))
        val head = ref.getJSONObject("object").getString("sha")
        val baseTree = JSONObject(call("GET", "/repos/$full/git/commits/$head")).getJSONObject("tree").getString("sha")
        val tree = JSONArray()
        files.forEach { (p, c) ->
            val e = JSONObject().put("path", p).put("mode", if (p.endsWith("gradlew") || p.endsWith(".sh")) "100755" else "100644").put("type", "blob")
            if (c == null) e.put("sha", JSONObject.NULL) else e.put("content", c)
            tree.put(e)
        }
        val newTree = JSONObject(call("POST", "/repos/$full/git/trees", JSONObject().put("base_tree", baseTree).put("tree", tree))).getString("sha")
        val commit = JSONObject(call("POST", "/repos/$full/git/commits",
            JSONObject().put("message", message).put("tree", newTree).put("parents", JSONArray().put(head)))).getString("sha")
        call("PATCH", "/repos/$full/git/refs/heads/$branch", JSONObject().put("sha", commit))
    }

    suspend fun workflows(full: String): List<GhWorkflow> {
        val a = JSONObject(call("GET", "/repos/$full/actions/workflows?per_page=100")).getJSONArray("workflows")
        return (0 until a.length()).map { a.getJSONObject(it) }.map {
            GhWorkflow(it.getLong("id"), it.optString("name"), it.optString("path"), it.optString("state"))
        }
    }

    suspend fun dispatch(full: String, workflowId: Long, ref: String) {
        call("POST", "/repos/$full/actions/workflows/$workflowId/dispatches", JSONObject().put("ref", ref))
    }

    suspend fun runs(full: String, n: Int = 20): List<GhRun> {
        val a = JSONObject(call("GET", "/repos/$full/actions/runs?per_page=$n")).getJSONArray("workflow_runs")
        return (0 until a.length()).map { a.getJSONObject(it) }.map {
            GhRun(
                it.getLong("id"), it.optString("name"), it.optString("display_title"), it.optString("status"),
                it.optString("conclusion").takeIf { c -> c != "null" }.orEmpty(), it.optString("head_branch"),
                it.optString("event"), it.optString("created_at"), it.optString("html_url"), it.optInt("run_number"),
            )
        }
    }

    suspend fun run(full: String, id: Long): GhRun = runs(full, 30).firstOrNull { it.id == id }
        ?: JSONObject(call("GET", "/repos/$full/actions/runs/$id")).let {
            GhRun(it.getLong("id"), it.optString("name"), it.optString("display_title"), it.optString("status"),
                it.optString("conclusion").takeIf { c -> c != "null" }.orEmpty(), it.optString("head_branch"),
                it.optString("event"), it.optString("created_at"), it.optString("html_url"), it.optInt("run_number"))
        }

    suspend fun rerun(full: String, runId: Long, failedOnly: Boolean = true) {
        call("POST", "/repos/$full/actions/runs/$runId/" + if (failedOnly) "rerun-failed-jobs" else "rerun")
    }

    suspend fun cancel(full: String, runId: Long) { call("POST", "/repos/$full/actions/runs/$runId/cancel") }

    suspend fun jobs(full: String, runId: Long): List<GhJob> {
        val a = JSONObject(call("GET", "/repos/$full/actions/runs/$runId/jobs")).getJSONArray("jobs")
        return (0 until a.length()).map { a.getJSONObject(it) }.map { j ->
            val s = j.optJSONArray("steps") ?: JSONArray()
            GhJob(j.getLong("id"), j.optString("name"), j.optString("status"),
                j.optString("conclusion").takeIf { it != "null" }.orEmpty(),
                (0 until s.length()).map { s.getJSONObject(it) }.map {
                    GhStep(it.optString("name"), it.optString("status"), it.optString("conclusion").takeIf { c -> c != "null" }.orEmpty())
                })
        }
    }

    /** Last [lines] lines of a job's log (GitHub redirects to blob storage; we follow without the token). */
    suspend fun jobLogTail(full: String, jobId: Long, lines: Int = 80): String = withContext(Dispatchers.IO) {
        val loc = redirectOf("$api/repos/$full/actions/jobs/$jobId/logs") ?: return@withContext ""
        val text = (URL(loc).openConnection() as HttpURLConnection).run {
            connectTimeout = 20_000; readTimeout = 60_000
            inputStream.bufferedReader().use { it.readText() }
        }
        text.lines().takeLast(lines).joinToString("\n") { it.replace(Regex("^\\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z "), "") }
    }

    suspend fun artifacts(full: String, runId: Long): List<GhArtifact> {
        val a = JSONObject(call("GET", "/repos/$full/actions/runs/$runId/artifacts")).getJSONArray("artifacts")
        return (0 until a.length()).map { a.getJSONObject(it) }.map {
            GhArtifact(it.getLong("id"), it.optString("name"), it.optLong("size_in_bytes"), it.optBoolean("expired"), it.optString("archive_download_url"))
        }
    }

    private fun redirectOf(url: String): String? {
        val c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = false
        c.setRequestProperty("Authorization", "Bearer ${token()}")
        c.setRequestProperty("User-Agent", "Wakil-Android")
        c.setRequestProperty("Accept", "application/vnd.github+json")
        val code = c.responseCode
        if (code in 300..399) return c.getHeaderField("Location")
        if (code >= 400) throw GhException(code, friendly(code, c.errorStream?.bufferedReader()?.readText().orEmpty()))
        return null
    }

    /** Downloads an artifact zip and extracts every .apk into [dir]. Returns the APK files. */
    suspend fun downloadApks(art: GhArtifact, dir: File, progress: (Long, Long) -> Unit = { _, _ -> }): List<File> = withContext(Dispatchers.IO) {
        val loc = redirectOf(art.url) ?: throw IOException("لم يُرجع GitHub رابط التنزيل")
        dir.mkdirs(); dir.listFiles()?.forEach { it.delete() }
        val c = URL(loc).openConnection() as HttpURLConnection
        c.connectTimeout = 20_000; c.readTimeout = 120_000
        val total = c.contentLengthLong.takeIf { it > 0 } ?: art.size
        val out = mutableListOf<File>()
        var read = 0L
        val counting = object : java.io.FilterInputStream(c.inputStream) {
            override fun read(b: ByteArray, off: Int, len: Int): Int =
                super.read(b, off, len).also { if (it > 0) { read += it; progress(read, total) } }
        }
        ZipInputStream(counting).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                if (!e.isDirectory && e.name.endsWith(".apk", true)) {
                    val f = File(dir, e.name.substringAfterLast('/'))
                    f.outputStream().use { z.copyTo(it) }
                    out += f
                }
            }
        }
        out
    }

    companion object {
        const val TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Wakil%20Android"
    }
}
