package com.wakil.agent.llm

import org.json.JSONArray
import org.json.JSONObject

/** A .gguf file that stays where it is on the phone's storage; Wakil only remembers a reference to it. */
data class ExtModel(val uri: String, val name: String, val size: Long, val added: Long)

/**
 * Pure helpers for the instant-import feature (no Android imports → unit-testable).
 * Instant import runs a model straight from the picked SAF document via /proc/self/fd,
 * so multi-GB files start in seconds without copying or wasting storage.
 */
object ExtModels {
    const val GGUF_MAGIC = "GGUF"

    /** A "content://" reference means the model lives outside Wakil's own storage. */
    fun isContentRef(ref: String): Boolean = ref.startsWith("content://")

    /** Clean a picked document name: strip paths, drop a trailing ".part", keep the .gguf suffix (case-insensitive). */
    fun normalizeName(raw: String): String =
        raw.substringAfterLast('/').trim().removeSuffix(".part").ifBlank { "model.gguf" }
            .let { if (it.endsWith(".gguf", ignoreCase = true)) it else "$it.gguf" }

    /**
     * llama.cpp split-sharded GGUF naming (model-00001-of-00003.gguf): returns (part, total).
     * Split models cannot be run in place — llama.cpp resolves sibling shards relative to the
     * file's directory, and /proc/self/fd has none — they must be copied into Wakil instead.
     */
    fun splitParts(name: String): Pair<Int, Int>? {
        val m = Regex("""-(\d{5})-of-(\d{5})\.gguf$""", RegexOption.IGNORE_CASE).find(name) ?: return null
        val (part, total) = m.destructured
        val p = part.toInt(); val t = total.toInt()
        return if (t >= 2 && p in 1..t) p to t else null
    }

    /** First 4 bytes of a stream are the GGUF magic? Consumes exactly 4 bytes (or fewer at EOF). */
    fun isGgufMagic(head: ByteArray): Boolean = head.size >= 4 && String(head, 0, 4, Charsets.US_ASCII) == GGUF_MAGIC

    fun toJson(list: List<ExtModel>): String = JSONArray().apply {
        list.forEach { put(JSONObject().put("uri", it.uri).put("name", it.name).put("size", it.size).put("added", it.added)) }
    }.toString()

    fun fromJson(s: String?): List<ExtModel> = runCatching {
        val a = JSONArray(s ?: "[]")
        (0 until a.length()).mapNotNull { i ->
            val o = a.optJSONObject(i) ?: return@mapNotNull null
            val uri = o.optString("uri")
            if (!isContentRef(uri)) null
            else ExtModel(uri, normalizeName(o.optString("name", "model.gguf")), o.optLong("size", -1L), o.optLong("added", 0L))
        }
    }.getOrDefault(emptyList())
}
