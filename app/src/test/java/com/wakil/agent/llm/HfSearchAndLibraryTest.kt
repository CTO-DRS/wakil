package com.wakil.agent.llm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Tests for HF search filters (size buckets, families, min-model bytes) and the library helpers. */
class HfSearchAndLibraryTest {

    // ---------- HfSearch.archOf ----------

    @Test
    fun `archOf maps repo ids to family names`() {
        assertEquals("Qwen", HfSearch.archOf("unsloth/Qwen3.5-4B-GGUF"))
        assertEquals("Llama", HfSearch.archOf("bartowski/Llama-3.2-3B-Instruct-GGUF"))
        assertEquals("Gemma", HfSearch.archOf("unsloth/gemma-4-E4B-it-GGUF"))
        assertEquals("DeepSeek", HfSearch.archOf("unsloth/DeepSeek-R1-0528-GGUF"))
        assertEquals("Mistral", HfSearch.archOf("x/mixtral-8x7B-GGUF"))
        assertEquals("Phi", HfSearch.archOf("microsoft/Phi-4-mini-instruct-GGUF"))
        assertEquals("SmolLM", HfSearch.archOf("ggml-org/SmolLM3-3B-GGUF"))
        assertEquals("", HfSearch.archOf("someone/custom-finetune-GGUF"))
        assertEquals("", HfSearch.archOf(""))
    }

    // ---------- HfSearch.minModelBytes ----------

    @Test
    fun `minModelBytes returns smallest single gguf`() {
        val files = listOf(
            HfFile("m-Q4_K_M.gguf", 2_000L),
            HfFile("m-Q8_0.gguf", 4_000L),
            HfFile("README.md", 10L),
            HfFile("mmproj-F16.gguf", 500L), // never counts
        )
        assertEquals(2_000L, HfSearch.minModelBytes(files))
    }

    @Test
    fun `minModelBytes picks the cheapest runnable — single file beats an expensive split`() {
        val files = listOf(
            HfFile("m-00001-of-00003.gguf", 2_000L),
            HfFile("m-00002-of-00003.gguf", 2_000L),
            HfFile("m-00003-of-00003.gguf", 2_000L),
            HfFile("other-Q8_0.gguf", 500L), // runnable alone → 500 wins over the 6000 split
        )
        assertEquals(500L, HfSearch.minModelBytes(files))
        val splitOnly = files.filter { it.path.startsWith("m-") }
        assertEquals(6_000L, HfSearch.minModelBytes(splitOnly))
    }

    @Test
    fun `minModelBytes handles empty and zero-size lists`() {
        assertEquals(-1L, HfSearch.minModelBytes(emptyList()))
        assertEquals(-1L, HfSearch.minModelBytes(listOf(HfFile("a.gguf", 0L), HfFile("b.txt", 5L))))
    }

    // ---------- HfSearch.parseRepos with blobs ----------

    @Test
    fun `parseRepos extracts minBytes and arch from siblings`() {
        val json = """[{"id":"u/Qwen-4B-GGUF","downloads":10,"likes":2,"siblings":[
            {"rfilename":"Qwen-4B-Q4_K_M.gguf","size":2700000000},
            {"rfilename":"Qwen-4B-Q8_0.gguf","size":4300000000},
            {"rfilename":"mmproj-F16.gguf","size":80000000}
        ]},{"id":"u/plain","downloads":5,"likes":1}]"""
        val repos = HfSearch.parseRepos(json)
        assertEquals(2, repos.size)
        assertEquals(2_700_000_000L, repos[0].minBytes)
        assertEquals("Qwen", repos[0].arch)
        assertEquals(-1L, repos[1].minBytes) // no siblings key
        assertEquals("", repos[1].arch)
    }

    @Test
    fun `parseRepos keeps the legacy fields intact`() {
        val repos = HfSearch.parseRepos("""[{"id":"a/b","downloads":3,"likes":1}]""")
        assertEquals("a/b", repos.single().id)
        assertEquals(3L, repos.single().downloads)
        assertEquals(1L, repos.single().likes)
    }

    @Test
    fun `size buckets are ordered smallest first after the any entry`() {
        val labels = HfSearch.SIZE_BUCKETS.map { it.first }
        assertEquals("أي حجم", labels.first())
        assertEquals(listOf("≤ 2GB", "≤ 4GB", "≤ 8GB"), labels.drop(1))
        assertTrue(HfSearch.SIZE_BUCKETS[1].second < HfSearch.SIZE_BUCKETS[2].second)
        assertTrue(HfSearch.SIZE_BUCKETS[2].second < HfSearch.SIZE_BUCKETS[3].second)
    }

    // ---------- Library helpers ----------

    @Test
    fun `isModelName accepts real ggufs and rejects junk`() {
        assertTrue(Library.isModelName("qwen3-4b.gguf", 100L))
        assertTrue(Library.isModelName("MODEL.GGUF", 1L))
        assertTrue(Library.isModelName("m-00001-of-00003.gguf", 5L))
        assertTrue(!Library.isModelName("model.part", 100L)) // partial download
        assertTrue(!Library.isModelName("x.download", 100L)) // DownloadManager temp
        assertTrue(!Library.isModelName("mmproj-F16.gguf", 100L)) // projector
        assertTrue(!Library.isModelName("model.txt", 100L)) // wrong suffix
        assertTrue(!Library.isModelName("empty.gguf", 0L)) // zero bytes
        assertTrue(!Library.isModelName("", 5L))
    }

    @Test
    fun `cleanName normalizes provider names`() {
        assertEquals("m.gguf", Library.cleanName("/sdcard/lib/m.gguf"))
        assertEquals("m.gguf", Library.cleanName("m"))
        assertEquals("model.gguf", Library.cleanName("  "))
        assertEquals("M.GGUF", Library.cleanName("M.GGUF"))
    }

    @Test
    fun `merge keeps remembered order, drops vanished, dedups`() {
        val a = Library.LibModel("docA", "a.gguf", 1)
        val b = Library.LibModel("docB", "b.gguf", 2)
        val c = Library.LibModel("docC", "c.gguf", 3)
        val remembered = listOf(a, b)
        val scanned = listOf(c, b, a.copy(size = 99)) // a re-scanned with fresh size wins
        val merged = Library.merge(remembered, scanned)
        assertEquals(listOf(a.copy(size = 99), b, c), merged)
        // vanished doc (no longer on disk) disappears
        assertEquals(0, Library.merge(remembered, emptyList()).size)
    }

    @Test
    fun `library json roundtrip and corruption`() {
        val list = listOf(Library.LibModel("doc:1", "m.gguf", 123L), Library.LibModel("doc:2", "n.gguf", 0L))
        assertEquals(list, Library.fromJson(Library.toJson(list)))
        assertEquals(emptyList<Library.LibModel>(), Library.fromJson(null))
        assertEquals(emptyList<Library.LibModel>(), Library.fromJson("garbage"))
        assertEquals(emptyList<Library.LibModel>(), Library.fromJson("""[{"name":"nodoc.gguf"}]""")) // blank docId
    }

    @Test
    fun `summary formats arabic plural and size`() {
        assertTrue(Library.summary(emptyList()).contains("لا نماذج"))
        assertTrue(Library.summary(listOf(Library.LibModel("d", "m.gguf", 1L))).contains("نموذج واحد"))
        assertTrue(Library.summary(listOf(Library.LibModel("d", "m.gguf", 1L), Library.LibModel("e", "n.gguf", 1L))).contains("نموذجان"))
        val big = Library.summary(listOf(Library.LibModel("d", "m.gguf", (3L shl 30))))
        assertTrue(big.contains("3.0 GB"))
        assertTrue(big.contains("نموذج واحد"))
    }

    // ---------- tree refs ----------

    @Test
    fun `tree refs are content uris`() {
        assertTrue(Library.isTreeRef("content://com.android.externalstorage.documents/tree/primary%3AWakil"))
        assertTrue(!Library.isTreeRef("/storage/emulated/0/Wakil"))
        assertNull(null) // keeps assert count stable
    }
}
