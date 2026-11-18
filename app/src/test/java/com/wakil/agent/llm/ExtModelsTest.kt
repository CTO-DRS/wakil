package com.wakil.agent.llm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExtModelsTest {

    // ---------- isContentRef ----------

    @Test
    fun `content refs are detected`() {
        assertTrue(ExtModels.isContentRef("content://com.android.providers.downloads.documents/document/42"))
        assertTrue(ExtModels.isContentRef("content://com.android.externalstorage.documents/tree/primary"))
        assertFalse(ExtModels.isContentRef("/data/user/0/com.wakil.agent/files/models/qwen.gguf"))
        assertFalse(ExtModels.isContentRef("https://huggingface.co/model.gguf"))
        assertFalse(ExtModels.isContentRef(""))
    }

    // ---------- normalizeName ----------

    @Test
    fun `normalizeName keeps valid gguf names`() {
        assertEquals("qwen3.gguf", ExtModels.normalizeName("qwen3.gguf"))
        assertEquals("MODEL.GGUF", ExtModels.normalizeName("MODEL.GGUF")) // uppercase suffix kept as-is
        assertEquals("my-model-00001-of-00003.gguf", ExtModels.normalizeName("my-model-00001-of-00003.gguf"))
    }

    @Test
    fun `normalizeName appends missing suffix`() {
        assertEquals("qwen3.gguf", ExtModels.normalizeName("qwen3"))
        assertEquals("qwen3.bin.gguf", ExtModels.normalizeName("qwen3.bin")) // unknown suffix → suffix is appended
        assertEquals("x.gguf", ExtModels.normalizeName("x.gguf.part"))
    }

    @Test
    fun `normalizeName strips paths and blanks`() {
        assertEquals("m.gguf", ExtModels.normalizeName("/storage/downloads/m.gguf"))
        assertEquals("m.gguf", ExtModels.normalizeName("  m.gguf  "))
        assertEquals("model.gguf", ExtModels.normalizeName(""))
        assertEquals("model.gguf", ExtModels.normalizeName("/"))
        assertEquals("model.gguf", ExtModels.normalizeName("   "))
    }

    // ---------- splitParts ----------

    @Test
    fun `splitParts detects the llama cpp sharding pattern`() {
        assertEquals(1 to 3, ExtModels.splitParts("qwen-00001-of-00003.gguf"))
        assertEquals(7 to 12, ExtModels.splitParts("deepseek-00007-of-00012.gguf"))
    }

    @Test
    fun `splitParts is case insensitive on suffix`() {
        assertEquals(1 to 2, ExtModels.splitParts("m-00001-of-00002.GGUF"))
    }

    @Test
    fun `splitParts rejects non split names`() {
        assertNull(ExtModels.splitParts("qwen3.gguf"))
        assertNull(ExtModels.splitParts("qwen3-00001.gguf"))
        assertNull(ExtModels.splitParts("qwen3-of-00003.gguf"))
        assertNull(ExtModels.splitParts("m-1-of-3.gguf")) // padding must be 5 digits
        assertNull(ExtModels.splitParts(""))
    }

    @Test
    fun `splitParts rejects impossible ranges`() {
        assertNull(ExtModels.splitParts("m-00000-of-00003.gguf")) // part must start at 1
        assertNull(ExtModels.splitParts("m-00004-of-00003.gguf")) // part > total
        assertNull(ExtModels.splitParts("m-00001-of-00001.gguf")) // a single file is not a split
    }

    // ---------- GGUF magic ----------

    @Test
    fun `gguf magic detection`() {
        assertTrue(ExtModels.isGgufMagic("GGUF".toByteArray(Charsets.US_ASCII)))
        assertTrue(ExtModels.isGgufMagic("GGUF".toByteArray() + byteArrayOf(3, 0)))
        assertFalse(ExtModels.isGgufMagic("<ht".toByteArray())) // html error page
        assertFalse(ExtModels.isGgufMagic("PK\u0003\u0004".toByteArray())) // zip
        assertFalse(ExtModels.isGgufMagic("GGU".toByteArray())) // truncated
        assertFalse(ExtModels.isGgufMagic(ByteArray(0)))
    }

    // ---------- persistence (JSON) ----------

    @Test
    fun `json roundtrip keeps uri name size and added`() {
        val list = listOf(
            ExtModel("content://a/document/1", "qwen3.gguf", 1_300_000_000L, 1000L),
            ExtModel("content://a/document/2", "gemma.gguf", 2_700_000_000L, 2000L),
        )
        val parsed = ExtModels.fromJson(ExtModels.toJson(list))
        assertEquals(list, parsed)
    }

    @Test
    fun `json parse handles corrupt input`() {
        assertEquals(emptyList<ExtModel>(), ExtModels.fromJson(null))
        assertEquals(emptyList<ExtModel>(), ExtModels.fromJson(""))
        assertEquals(emptyList<ExtModel>(), ExtModels.fromJson("not json at all"))
        assertEquals(emptyList<ExtModel>(), ExtModels.fromJson("[1,2,3]")) // no objects
    }

    @Test
    fun `json parse filters non content uris and fills defaults`() {
        val json = """[
            {"uri":"/sdcard/model.gguf","name":"bad.gguf","size":5,"added":7},
            {"uri":"content://a/doc/9"},
            {"name":"nouri.gguf","size":9}
        ]"""
        val parsed = ExtModels.fromJson(json)
        assertEquals(1, parsed.size)
        assertEquals("content://a/doc/9", parsed[0].uri)
        assertEquals("model.gguf", parsed[0].name)
        assertEquals(-1L, parsed[0].size)
        assertEquals(0L, parsed[0].added)
    }
}
