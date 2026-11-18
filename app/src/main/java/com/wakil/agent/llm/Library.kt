package com.wakil.agent.llm

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Pure helpers for the dedicated model-library folder (v3.5). The folder is a SAF tree the user
 * picks once (anywhere on the phone: internal storage, SD card); Wakil keeps a persisted grant,
 * scans it for .gguf files and runs them in place through content:// refs — the same mechanism
 * as instant import. No Android imports here so the logic is unit-testable.
 */
object Library {

    const val GGUF_SUFFIX = ".gguf"
    private val SPLIT_RX = Regex("-\\d{5}-of-\\d{5}\\.gguf$", RegexOption.IGNORE_CASE)

    /** A scanned model inside the library folder. [docId] identifies the document inside the tree. */
    data class LibModel(val docId: String, val name: String, val size: Long)

    /** Any picked tree may serve as the library (the picker itself enforces a real folder). */
    fun isTreeRef(ref: String): Boolean = ref.startsWith("content://")

    /** Clean a display name from the documents provider: strip paths, keep the .gguf suffix. */
    fun cleanName(raw: String): String =
        raw.substringAfterLast('/').trim().ifBlank { "model.gguf" }
            .let { if (it.endsWith(GGUF_SUFFIX, ignoreCase = true)) it else "$it.gguf" }

    /** Only real model files are listed: .gguf, non-empty, no partial downloads, no projectors. */
    fun isModelName(name: String, size: Long): Boolean =
        name.endsWith(GGUF_SUFFIX, ignoreCase = true) && size > 0 &&
            !name.endsWith(".part", ignoreCase = true) && !name.contains("mmproj", ignoreCase = true) &&
            !name.contains(".download", ignoreCase = true)

    /** Merge a fresh scan into the remembered list: scan data wins, remembered order first, dedup by docId. */
    fun merge(remembered: List<LibModel>, scanned: List<LibModel>): List<LibModel> {
        val scannedById = scanned.associateBy { it.docId }
        val seen = linkedSetOf<String>()
        val out = ArrayList<LibModel>(scanned.size)
        remembered.forEach { r -> scannedById[r.docId]?.let { s -> if (seen.add(s.docId)) out.add(s) } }
        scanned.forEach { s -> if (seen.add(s.docId)) out.add(s) }
        return out
    }

    fun toJson(list: List<LibModel>): String = JSONArray().apply {
        list.forEach { put(JSONObject().put("docId", it.docId).put("name", it.name).put("size", it.size)) }
    }.toString()

    fun fromJson(s: String?): List<LibModel> = runCatching {
        val a = JSONArray(s ?: "[]")
        (0 until a.length()).mapNotNull { i ->
            val o = a.optJSONObject(i) ?: return@mapNotNull null
            val d = o.optString("docId")
            if (d.isBlank()) null else LibModel(d, cleanName(o.optString("name", "model.gguf")), o.optLong("size", 0L))
        }
    }.getOrDefault(emptyList())

    /** Human summary for the library header: "3 نماذج · 7.4 GB". */
    fun summary(models: List<LibModel>): String {
        val gb = models.sumOf { it.size } / (1024.0 * 1024 * 1024)
        val size = if (gb >= 1.0) String.format(Locale.US, "%.1f GB", gb)
            else String.format(Locale.US, "%.0f MB", models.sumOf { it.size } / (1024.0 * 1024))
        val noun = when {
            models.size == 1 -> "نموذج واحد"
            models.size == 2 -> "نموذجان"
            models.size in 3..10 -> "${models.size} نماذج"
            models.size > 10 -> "${models.size} نموذجاً"
            else -> "لا نماذج"
        }
        return "$noun · $size"
    }
}
