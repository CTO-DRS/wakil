package com.wakil.agent.llm

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream

/**
 * Real facts read straight from a GGUF file's header: architecture, quantization, layer count,
 * training context, embedding size, attention heads and parameter count — before spending minutes
 * loading a multi-GB model into memory. Pure Kotlin (no Android imports) so it is unit-testable.
 *
 * Parsing is streaming with bounded work: metadata scalar values are collected into a small map,
 * big payloads (tokenizer vocab arrays, tensor data) are skipped without buffering them, so a
 * 10 GB model's header is read in milliseconds regardless of file size.
 */
data class GgufMeta(
    val version: Int = 0,
    val tensors: Long = 0,
    val architecture: String = "",
    val name: String = "",
    val quant: String = "",
    val layers: Int = 0,
    val trainCtx: Int = 0,
    val embedding: Int = 0,
    val headCount: Int = 0,
    val headCountKv: Int = 0,
    val params: Long = 0,
    val sizeLabel: String = "",
) {
    /** K/V cache dim per token per layer: n_embd scaled by grouped-query attention ratio. */
    fun kvDim(): Int = if (headCount > 0 && headCountKv > 0)
        Math.round(embedding * (headCountKv.toDouble() / headCount)).toInt().coerceAtLeast(0)
    else embedding

    /** Can this file's facts be used for a meaningful memory estimate? */
    val estimable: Boolean get() = layers > 0 && embedding > 0
}

object Gguf {

    /** GGUF container versions we can read (v1 used 32-bit counts and is long gone). */
    private val OK_VERSIONS = setOf(2, 3)

    /** Hard cap on skipped/read bytes inside the header — a corrupt file can't spin us for GBs. */
    private const val MAX_SCAN = 64L * 1024 * 1024

    /** A single metadata string bigger than this means the file is not something we can trust. */
    private const val MAX_STRING = 1L shl 20

    // GGUF metadata value types (ggml spec)
    private const val T_U8 = 0; private const val T_I8 = 1
    private const val T_U16 = 2; private const val T_I16 = 3
    private const val T_U32 = 4; private const val T_I32 = 5
    private const val T_F32 = 6; private const val T_BOOL = 7
    private const val T_STRING = 8; private const val T_ARRAY = 9
    private const val T_U64 = 10; private const val T_I64 = 11; private const val T_F64 = 12

    private val FIXED = mapOf(T_U8 to 1, T_I8 to 1, T_U16 to 2, T_I16 to 2, T_U32 to 4,
        T_I32 to 4, T_F32 to 4, T_BOOL to 1, T_U64 to 8, T_I64 to 8, T_F64 to 8)

    /** Parse a GGUF header from [input] (streamed, position irrelevant, stream left open). Null if not GGUF. */
    fun parse(input: InputStream): GgufMeta? {
        val r = Reader(input)
        val head = ByteArray(4)
        if (readFully(r, head) != 4 || String(head, 0, 4, Charsets.US_ASCII) != ExtModels.GGUF_MAGIC) return null
        val version = runCatching { r.u32() }.getOrDefault(-1)
        if (version !in OK_VERSIONS) return null
        // Everything after this is best-effort: a truncated header still yields the keys we got.
        val tensors = runCatching { r.u64() }.getOrDefault(0L)
        val kvCount = runCatching { r.u64() }.getOrDefault(0L)
        val scalars = HashMap<String, Any>()
        runCatching {
            var i = 0
            while (i < kvCount) {
                val key = r.string()
                val type = r.u32()
                when (type) {
                    T_STRING -> scalars[key] = r.string()
                    T_U8, T_I8, T_BOOL -> scalars[key] = r.u8().toLong()
                    T_U16, T_I16 -> scalars[key] = r.u16().toLong()
                    T_U32, T_I32 -> scalars[key] = r.u32().toLong()
                    T_U64, T_I64 -> scalars[key] = r.u64()
                    T_F32, T_F64 -> r.skip(if (type == T_F32) 4 else 8)
                    T_ARRAY -> skipArray(r)
                    else -> return@runCatching // unknown type: stop, keep what we have
                }
                i++
            }
        }
        val arch = (scalars["general.architecture"] as? String)?.trim()?.lowercase().orEmpty()
        fun u32v(k: String) = (scalars[k] as? Long)?.toInt() ?: 0
        return GgufMeta(
            version = version,
            tensors = tensors,
            architecture = arch,
            name = (scalars["general.name"] as? String).orEmpty(),
            quant = fileTypeLabel((scalars["general.file_type"] as? Long)?.toInt() ?: -1),
            layers = if (arch.isEmpty()) 0 else u32v("$arch.block_count"),
            trainCtx = if (arch.isEmpty()) 0 else u32v("$arch.context_length"),
            embedding = if (arch.isEmpty()) 0 else u32v("$arch.embedding_length"),
            headCount = if (arch.isEmpty()) 0 else u32v("$arch.attention.head_count"),
            headCountKv = if (arch.isEmpty()) 0 else u32v("$arch.attention.head_count_kv"),
            params = scalars["general.parameter_count"] as? Long ?: 0L,
            sizeLabel = (scalars["general.size_label"] as? String).orEmpty(),
        )
    }

    /** Convenience for a local file. */
    fun parseFile(f: File): GgufMeta? = runCatching { f.inputStream().use { parse(it) } }.getOrNull()

    // ---------- quantization labels ----------

    /** llama.cpp llm_ftype codes → short label. Empty when the code is unknown to us. */
    fun fileTypeLabel(code: Int): String = when (code) {
        0 -> "F32"
        1 -> "F16"
        2 -> "Q4_0"
        3 -> "Q4_1"
        7 -> "Q8_0"
        8 -> "Q5_0"
        9 -> "Q5_1"
        10 -> "Q2_K"
        11 -> "Q3_K_S"
        12 -> "Q3_K_M"
        13 -> "Q3_K_L"
        14 -> "Q4_K_S"
        15 -> "Q4_K_M"
        16 -> "Q5_K_S"
        17 -> "Q5_K_M"
        18 -> "Q6_K"
        19 -> "IQ2_XXS"
        20 -> "IQ2_XS"
        21 -> "Q2_K_S"
        22 -> "IQ3_XS"
        23 -> "IQ3_XXS"
        24 -> "IQ1_S"
        25 -> "IQ4_NL"
        26 -> "IQ3_S"
        27 -> "IQ3_M"
        28 -> "IQ2_S"
        29 -> "IQ2_M"
        30 -> "IQ4_XS"
        31 -> "IQ1_M"
        32 -> "BF16"
        38 -> "TQ1_0"
        39 -> "TQ2_0"
        else -> ""
    }

    private val QUANT_RX = Regex(
        """(IQ[1-4]_[A-Z0-9]+(?:_[SML])?|Q[2-8]_K(?:_[SML])?|Q[2-8]_[01]|F16|BF16|F32|MXFP4)""",
        RegexOption.IGNORE_CASE,
    )

    /** Fall back to the quantization written in the file name ("qwen3-Q4_K_M.gguf" → "Q4_K_M"). */
    fun filenameQuant(name: String): String =
        QUANT_RX.find(name)?.value?.uppercase().orEmpty()

    // ---------- derived display + memory estimate ----------

    /** Human parameter-count label: "4B", "1.3B", "500M". Falls back to size_label. Null when unknown. */
    fun paramsLabel(params: Long, sizeLabel: String): String? = when {
        params >= 1_000_000_000 -> trimZero("%.1f".format(params / 1e9)) + "B"
        params >= 1_000_000 -> (params / 1_000_000).toString() + "M"
        sizeLabel.isNotBlank() -> sizeLabel
        else -> null
    }

    private fun trimZero(s: String) = if (s.endsWith(".0")) s.dropLast(2) else s

    /**
     * Rough on-device footprint for [ctx] tokens of context: weights (file size) + KV cache
     * (F16: 2 K/V tensors × layers × kvDim × 2 bytes) + a flat compute-buffer allowance.
     * Only meaningful when [m] is [GgufMeta.estimable].
     */
    fun ramEstimateBytes(fileSize: Long, m: GgufMeta, ctx: Int, kvBytesPerElem: Int = 2): Long {
        if (!m.estimable) return fileSize + (256L shl 20)
        val kvPerToken = 2L * m.layers * m.kvDim() * kvBytesPerElem.toLong()
        val kv = kvPerToken * ctx.toLong().coerceAtLeast(0)
        return fileSize + kv + (256L shl 20)
    }

    // ---------- streaming reader ----------

    private class Reader(val inp: InputStream) {
        var consumed = 0L
        private fun charge(n: Long) {
            consumed += n
            if (consumed > MAX_SCAN) throw java.io.IOException("header scan cap exceeded")
        }
        /** Skip [n] bytes, verifying they were really skipped (skip() may short-read). */
        fun skip(n: Long) {
            charge(n)
            var left = n
            while (left > 0) {
                val s = inp.skip(left)
                if (s > 0) { left -= s; continue }
                if (inp.read() < 0) throw java.io.IOException("EOF")
                left--
            }
        }
        fun u8(): Int { charge(1); val b = inp.read(); if (b < 0) throw java.io.IOException("EOF"); return b }
        fun u16(): Int = u8() or (u8() shl 8)
        fun u32(): Int = u16() or (u16() shl 16)
        fun u64(): Long = (u32().toLong() and 0xFFFFFFFFL) or ((u32().toLong() and 0xFFFFFFFFL) shl 32)
        fun string(): String {
            val len = u64()
            if (len > MAX_STRING) throw java.io.IOException("string too long")
            charge(len)
            val buf = ByteArray(len.toInt())
            if (readFully(this, buf) != buf.size) throw java.io.IOException("EOF in string")
            return String(buf, Charsets.UTF_8)
        }
    }

    /** Read exactly [buf.size] bytes through the capped reader (counts against the scan cap). */
    private fun readFully(r: Reader, buf: ByteArray): Int {
        var off = 0
        while (off < buf.size) {
            val n = r.inp.read(buf, off, buf.size - off)
            if (n < 0) break
            off += n
        }
        r.consumed += off
        return off
    }

    /** Skip an array payload element by element — never buffers vocab-sized data. */
    private fun skipArray(r: Reader) {
        val elemType = r.u32()
        val count = r.u64()
        if (count < 0 || count > (1L shl 40)) throw java.io.IOException("array count absurd")
        val fixed = FIXED[elemType]
        if (fixed != null) { r.skip(fixed * count); return }
        when (elemType) {
            T_STRING -> repeat(count.coerceIn(0, Int.MAX_VALUE.toLong()).toInt()) { _ ->
                val len = r.u64()
                if (len > MAX_STRING) throw java.io.IOException("string too long")
                r.skip(len)
            }
            T_ARRAY -> repeat(count.coerceIn(0, Int.MAX_VALUE.toLong()).toInt()) { _ -> skipArray(r) }
            else -> throw java.io.IOException("unknown array element type $elemType")
        }
    }
}
