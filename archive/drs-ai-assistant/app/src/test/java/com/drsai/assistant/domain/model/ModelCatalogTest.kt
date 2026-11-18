package com.drsai.assistant.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelCatalogTest {

    @Test
    fun catalogHasJaisAndQwenWithValidMetadata() {
        assertEquals(listOf(ModelCatalog.JAIS3, ModelCatalog.QWEN), ModelCatalog.ALL)
        assertEquals(ModelCatalog.ALL.size, ModelCatalog.ALL.map { it.id }.toSet().size)
        for (m in ModelCatalog.ALL) {
            assertTrue(m.sha256.matches(Regex("[0-9a-f]{64}")))
            assertTrue(m.url.startsWith("https://huggingface.co/") && m.url.endsWith("/" + m.fileName))
            assertTrue(m.sizeBytes > 0)
        }
    }

    @Test
    fun jaisIsTheRecommendedDefaultAndReasons() {
        assertEquals(ModelCatalog.JAIS3, ModelCatalog.DEFAULT)
        assertTrue(ModelCatalog.JAIS3.recommended)
        assertTrue(ModelCatalog.JAIS3.promptFormat.opensReasoning)
        assertEquals(666_192_384L, ModelCatalog.JAIS3.sizeBytes)
    }

    @Test
    fun initialSelectionPrefersSavedThenDownloadedThenDefault() {
        assertEquals(ModelCatalog.QWEN, ModelCatalog.initialSelection(ModelCatalog.QWEN.id) { false })
        assertEquals(ModelCatalog.QWEN, ModelCatalog.initialSelection(null) { it == ModelCatalog.QWEN })
        assertEquals(ModelCatalog.JAIS3, ModelCatalog.initialSelection(null) { false })
        assertEquals(ModelCatalog.JAIS3, ModelCatalog.initialSelection("gone") { false })
    }
}
