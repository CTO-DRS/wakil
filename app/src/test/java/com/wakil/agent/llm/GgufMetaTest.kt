package com.wakil.agent.llm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Tests for the pure GGUF-header parser. Every test builds synthetic GGUF bytes
 * (little-endian, ggml spec v2/v3 layout) — no real model files needed.
 */
class GgufMetaTest {

    // ---------- binary building helpers ----------

    private fun le32(v: Int) = byteArrayOf(
        (v and 0xFF).toByte(), ((v shr 8) and 0xFF).toByte(), ((v shr 16) and 0xFF).toByte(), ((v shr 24) and 0xFF).toByte())

    private fun le64(v: Long): ByteArray {
        val b = ByteArray(8)
        for (i in 0 until 8) b[i] = ((v shr (8 * i)) and 0xFF).toByte()
        return b
    }

    /** GGUF string: u64 byte length + UTF-8 payload. */
    private fun s(str: String): ByteArray {
        val b = str.toByteArray(Charsets.UTF_8)
        return le64(b.size.toLong()) + b
    }

    private fun kvStr(key: String, value: String) = s(key) + le32(8) + s(value)
    private fun kvU32(key: String, value: Int) = s(key) + le32(4) + le32(value)
    private fun kvU64(key: String, value: Long) = s(key) + le32(10) + le64(value)
    private fun kvF32(key: String) = s(key) + le32(6) + ByteArray(4)
    private fun kvBool(key: String, v: Boolean) = s(key) + le32(7) + byteArrayOf(if (v) 1 else 0)
    private fun kvArrStr(key: String, items: List<String>) =
        s(key) + le32(9) + le32(8) + le64(items.size.toLong()) + items.map { s(it) }.reduce { a, b -> a + b }
    private fun kvArrU32(key: String, items: List<Int>) =
        s(key) + le32(9) + le32(4) + le64(items.size.toLong()) + items.map { le32(it) }.reduce { a, b -> a + b }

    private fun gguf(vararg kvs: ByteArray, version: Int = 3, tensors: Long = 101): ByteArray {
        val out = ByteArrayOutputStream()
        out.write("GGUF".toByteArray(Charsets.US_ASCII))
        out.write(le32(version))
        out.write(le64(tensors))
        out.write(le64(kvs.size.toLong()))
        kvs.forEach { out.write(it) }
        out.write(ByteArray(64)) // pretend tensor-info section follows (parser must not read it)
        return out.toByteArray()
    }

    private fun parse(bytes: ByteArray) = Gguf.parse(ByteArrayInputStream(bytes))

    // ---------- happy path ----------

    @Test
    fun `parses real model facts from the header`() {
        val m = parse(gguf(
            kvStr("general.architecture", "qwen3"),
            kvStr("general.name", "Qwen3.5 4B"),
            kvU32("general.file_type", 15),
            kvU32("qwen3.block_count", 28),
            kvU32("qwen3.context_length", 40960),
            kvU32("qwen3.embedding_length", 2560),
            kvU32("qwen3.attention.head_count", 20),
            kvU32("qwen3.attention.head_count_kv", 4),
            kvU64("general.parameter_count", 4_000_000_000L),
            kvStr("general.size_label", "4B"),
        ))!!
        assertEquals(3, m.version)
        assertEquals(101L, m.tensors)
        assertEquals("qwen3", m.architecture)
        assertEquals("Qwen3.5 4B", m.name)
        assertEquals("Q4_K_M", m.quant)
        assertEquals(28, m.layers)
        assertEquals(40960, m.trainCtx)
        assertEquals(2560, m.embedding)
        assertEquals(20, m.headCount)
        assertEquals(4, m.headCountKv)
        assertEquals(4_000_000_000L, m.params)
        assertEquals("4B", m.sizeLabel)
        assertTrue(m.estimable)
    }

    @Test
    fun `key order does not matter — arch keys may precede general_architecture`() {
        val m = parse(gguf(
            kvU32("llama.block_count", 32),
            kvU32("llama.context_length", 8192),
            kvStr("general.architecture", "llama"),
        ))!!
        assertEquals("llama", m.architecture)
        assertEquals(32, m.layers)
        assertEquals(8192, m.trainCtx)
    }

    @Test
    fun `vocab arrays and float scalars are skipped, later keys still parsed`() {
        val m = parse(gguf(
            kvArrStr("tokenizer.ggml.tokens", listOf("hello", "world", "عربي")),
            kvArrU32("tokenizer.ggml.token_type", listOf(2, 2, 5, 6)),
            kvF32("qwen3.rope.freq_base"),
            kvBool("tokenizer.ggml.add_bos_token", true),
            kvStr("general.architecture", "qwen3"),
            kvU32("qwen3.block_count", 36),
        ))!!
        assertEquals(36, m.layers)
        assertEquals(0, m.trainCtx) // absent key → 0
    }

    @Test
    fun `utf-8 names survive the round trip`() {
        val m = parse(gguf(kvStr("general.name", "نموذج وكيل التجريبي")))!!
        assertEquals("نموذج وكيل التجريبي", m.name)
    }

    // ---------- rejection and corruption ----------

    @Test
    fun `non-GGUF input returns null`() {
        assertNull(parse("<html>error page</html>".toByteArray()))
        assertNull(parse(ByteArray(0)))
        assertNull(parse("GGU".toByteArray())) // truncated magic
    }

    @Test
    fun `unsupported container versions return null`() {
        assertNull(parse(gguf(version = 1)))
        assertNull(parse(gguf(version = 4)))
    }

    @Test
    fun `truncated right after version yields defaults instead of crashing`() {
        val cut = gguf(kvStr("general.architecture", "qwen3")).copyOf(8) // magic + version only
        val m = parse(cut)!!
        assertEquals(3, m.version)
        assertEquals(0L, m.tensors)
        assertEquals("", m.architecture)
        assertEquals(0, m.layers)
    }

    @Test
    fun `absurd string length cannot hang or crash the parser`() {
        val out = ByteArrayOutputStream()
        out.write("GGUF".toByteArray(Charsets.US_ASCII))
        out.write(le32(3)); out.write(le64(0L)); out.write(le64(1L))
        out.write(s("general.architecture"))
        out.write(le32(8))
        out.write(le64(1L shl 40)) // claims 1 TB of string data
        out.write(ByteArray(16))
        val m = parse(out.toByteArray())
        assertNotNull(m) // partial: nothing usable, but no exception, no hang
    }

    @Test
    fun `unknown value type stops parsing but keeps earlier keys`() {
        val m = parse(gguf(
            kvStr("general.architecture", "gemma"),
            s("mystery.key") + le32(77) + ByteArray(8), // type 77 unknown
            kvU32("gemma.block_count", 34),
        ))!!
        assertEquals("gemma", m.architecture)
        assertEquals(0, m.layers) // never reached
    }

    // ---------- labels ----------

    @Test
    fun `fileTypeLabel maps llama cpp ftype codes`() {
        assertEquals("Q4_K_M", Gguf.fileTypeLabel(15))
        assertEquals("F16", Gguf.fileTypeLabel(1))
        assertEquals("Q8_0", Gguf.fileTypeLabel(7))
        assertEquals("Q5_K_M", Gguf.fileTypeLabel(17))
        assertEquals("Q6_K", Gguf.fileTypeLabel(18))
        assertEquals("IQ4_XS", Gguf.fileTypeLabel(30))
        assertEquals("BF16", Gguf.fileTypeLabel(32))
        assertEquals("", Gguf.fileTypeLabel(-1))
        assertEquals("", Gguf.fileTypeLabel(999))
    }

    @Test
    fun `filenameQuant extracts quantization from file names`() {
        assertEquals("Q4_K_M", Gguf.filenameQuant("Qwen3.5-4B-Q4_K_M.gguf"))
        assertEquals("IQ4_XS", Gguf.filenameQuant("model-iq4_xs.gguf"))
        assertEquals("Q8_0", Gguf.filenameQuant("qwen2.5-coder-3b-instruct-q8_0.gguf"))
        assertEquals("Q6_K", Gguf.filenameQuant("x.Q6_K.gguf"))
        assertEquals("BF16", Gguf.filenameQuant("m-bf16.gguf"))
        assertEquals("", Gguf.filenameQuant("model.gguf"))
        assertEquals("", Gguf.filenameQuant(""))
    }

    @Test
    fun `paramsLabel formats billions millions and size label fallback`() {
        assertEquals("4B", Gguf.paramsLabel(4_000_000_000L, ""))
        assertEquals("1.3B", Gguf.paramsLabel(1_300_000_000L, ""))
        assertEquals("500M", Gguf.paramsLabel(500_000_000L, ""))
        assertEquals("4B", Gguf.paramsLabel(0L, "4B"))
        assertNull(Gguf.paramsLabel(0L, ""))
    }

    // ---------- GQA and memory estimate ----------

    @Test
    fun `kvDim scales by grouped-query attention ratio`() {
        assertEquals(512, GgufMeta(embedding = 2560, headCount = 20, headCountKv = 4).kvDim())
        assertEquals(2560, GgufMeta(embedding = 2560).kvDim()) // no head info → full embedding
        assertEquals(2560, GgufMeta(embedding = 2560, headCount = 20, headCountKv = 0).kvDim())
    }

    @Test
    fun `ramEstimateBytes sums weights kv cache and compute buffer`() {
        val m = GgufMeta(layers = 28, embedding = 2560, headCount = 20, headCountKv = 4) // kvDim 512
        // kv per token = 2 (K+V) × 28 × 512 × 2 bytes = 57344; × 4096 ctx = 234,881,024
        val est = Gguf.ramEstimateBytes(2_000_000_000L, m, 4096)
        assertEquals(2_000_000_000L + 234_881_024L + (256L shl 20), est)
        // non-estimable model: only file size + compute buffer
        val flat = Gguf.ramEstimateBytes(1_000_000_000L, GgufMeta(), 4096)
        assertEquals(1_000_000_000L + (256L shl 20), flat)
    }

    // ---------- file convenience ----------

    @Test
    fun `parseFile reads a real temp file and rejects a missing one`() {
        val f = File.createTempFile("wakil-test", ".gguf")
        try {
            f.writeBytes(gguf(kvStr("general.architecture", "qwen3"), kvU32("qwen3.block_count", 28)))
            val m = Gguf.parseFile(f)!!
            assertEquals("qwen3", m.architecture)
            assertEquals(28, m.layers)
        } finally { f.delete() }
        assertNull(Gguf.parseFile(File("/nonexistent/path/model.gguf")))
    }
}
