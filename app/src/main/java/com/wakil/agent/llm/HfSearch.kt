package com.wakil.agent.llm

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * A search result. [minBytes] is the true download cost of the smallest *runnable* model in the
 * repo (single GGUF, or all shards of a split GGUF) — reported by the API when blobs=true.
 * [arch] is a friendly family name ("Qwen", "Llama"…) inferred from the repo id; "" = unknown.
 */
data class HfRepo(val id: String, val downloads: Long, val likes: Long, val minBytes: Long = -1L, val arch: String = "")
data class HfFile(val path: String, val size: Long)

/** Search any GGUF model on Hugging Face and list its files, so the user can download models beyond the presets. */
object HfSearch {
    private fun get(url: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 20000
        c.setRequestProperty("User-Agent", FastDownloader.UA)
        if (c.responseCode >= 400) throw RuntimeException("HTTP ${c.responseCode}")
        return c.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
    }

    /** Size buckets offered as filter chips in the UI: label → max smallest-file bytes (GiB units). */
    val SIZE_BUCKETS: List<Pair<String, Long>> = listOf(
        "أي حجم" to Long.MAX_VALUE,
        "≤ 2GB" to (2L shl 30),
        "≤ 4GB" to (4L shl 30),
        "≤ 8GB" to (8L shl 30),
    )

    /** Model families offered as filter chips; matched against the repo id case-insensitively. */
    val FAMILIES: List<Pair<String, String>> = listOf(
        "الكل" to "",
        "Qwen" to "qwen",
        "Llama" to "llama",
        "Gemma" to "gemma",
        "Phi" to "phi",
        "DeepSeek" to "deepseek",
        "Mistral" to "mistral",
        "SmolLM" to "smollm",
    )

    /** Friendly family name for a repo id ("unsloth/Qwen3.5-4B-GGUF" → "Qwen"); "" when unknown. */
    fun archOf(id: String): String {
        val s = id.lowercase()
        return when {
            "qwen" in s -> "Qwen"
            "deepseek" in s -> "DeepSeek"
            "gemma" in s -> "Gemma"
            "llama" in s -> "Llama"
            "mistral" in s || "mixtral" in s -> "Mistral"
            "phi" in s -> "Phi"
            "smollm" in s || "smol" in s -> "SmolLM"
            "granite" in s -> "Granite"
            "falcon" in s -> "Falcon"
            "olmo" in s -> "OLMo"
            "t5" in s || "flan" in s -> "T5"
            else -> ""
        }
    }

    /**
     * Download cost of the cheapest runnable model in a repo: a single GGUF file, or the SUM of
     * all shards when the model is split (`-00001-of-00003` style) because running a split model
     * needs every part. Multimodal projectors (mmproj) never count.
     */
    fun minModelBytes(files: List<HfFile>): Long {
        val ggufs = files.filter { it.path.endsWith(".gguf", true) && !it.path.contains("mmproj", true) && it.size > 0 }
        if (ggufs.isEmpty()) return -1L
        val split = ggufs.filter { Regex("-\\d{5}-of-\\d{5}\\.gguf$", RegexOption.IGNORE_CASE).containsMatchIn(it.path) }
        val candidates = ArrayList<Long>(2)
        ggufs.filter { it !in split }.minOfOrNull { it.size }?.let { candidates.add(it) }
        if (split.isNotEmpty()) candidates.add(split.sumOf { it.size })
        return candidates.min()
    }

    /**
     * Search GGUF repos. [maxBytes] keeps only repos whose smallest runnable model fits
     * (Long.MAX_VALUE = any size); [arch] keeps one family ("" = all families).
     */
    suspend fun search(query: String, maxBytes: Long = Long.MAX_VALUE, arch: String = ""): List<HfRepo> =
        withContext(Dispatchers.IO) {
            val q = URLEncoder.encode(query.trim(), "UTF-8")
            parseRepos(get("https://huggingface.co/api/models?search=$q&filter=gguf&sort=downloads&direction=-1&limit=30&blobs=true"))
                .filter { it.minBytes > 0 && it.minBytes <= maxBytes }
                .filter { arch.isEmpty() || it.arch.equals(arch, ignoreCase = true) }
        }

    suspend fun files(repo: String): List<HfFile> = withContext(Dispatchers.IO) {
        parseFiles(get("https://huggingface.co/api/models/$repo/tree/main?recursive=true"))
    }

    fun fileUrl(repo: String, path: String) = "https://huggingface.co/$repo/resolve/main/" +
        path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8").replace("+", "%20") }

    /** Repos from the API; with blobs=true each sibling carries a size, so minBytes/arch get filled. */
    fun parseRepos(json: String): List<HfRepo> {
        val a = JSONArray(json)
        return (0 until a.length()).map { i ->
            val o = a.getJSONObject(i)
            val id = o.optString("id")
            val sib = o.optJSONArray("siblings")
            val min = if (sib == null) -1L else minModelBytes(
                (0 until sib.length()).mapNotNull { i ->
                    val f = sib.optJSONObject(i) ?: return@mapNotNull null
                    HfFile(f.optString("rfilename"), f.optLong("size", -1L))
                }
            )
            HfRepo(id, o.optLong("downloads"), o.optLong("likes"), min, archOf(id))
        }.filter { it.id.isNotBlank() }
    }

    /** GGUF files only, skipping multimodal projectors and split parts after the first; Q4_K_M first. */
    fun parseFiles(json: String): List<HfFile> {
        val a = JSONArray(json)
        return (0 until a.length()).map { val o = a.getJSONObject(it); HfFile(o.optString("path"), o.optLong("size")) }
            .filter { it.path.endsWith(".gguf", true) && !it.path.contains("mmproj", true) && !Regex("-0000[2-9]-of-").containsMatchIn(it.path) }
            .sortedWith(compareBy({ !it.path.contains("Q4_K_M", true) }, { it.size }))
    }
}
