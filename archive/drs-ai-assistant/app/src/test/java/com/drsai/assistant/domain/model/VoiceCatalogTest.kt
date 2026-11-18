package com.drsai.assistant.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceCatalogTest {
    @Test
    fun filesArePinnedAndVerified() {
        for (f in VoiceCatalog.FILES) {
            assertTrue(f.url, f.url.startsWith("https://github.com/CTO-DRS/DRS-AI-Download/releases/download/voice-nabra-1/"))
            assertTrue(f.url.endsWith("/" + f.fileName))
            assertTrue(Regex("[0-9a-f]{64}").matches(f.sha256))
            assertTrue(f.sizeBytes > 0)
        }
        assertEquals(510L * 256 * 4, VoiceCatalog.STYLE.sizeBytes)
        assertEquals(16_290_211L, VoiceCatalog.TOTAL_BYTES)
    }

    @Test
    fun speedIsClamped() {
        assertEquals(0.8f, VoiceCatalog.clampSpeed(0.1f))
        assertEquals(1.3f, VoiceCatalog.clampSpeed(3f))
        assertEquals(1.1f, VoiceCatalog.clampSpeed(1.1f))
    }

    @Test
    fun combinedDownloadState() {
        val totals = listOf(100L, 10L)
        assertEquals(DownloadState.Completed,
            VoiceCatalog.combine(listOf(DownloadState.Completed, DownloadState.Completed), totals))
        assertEquals(DownloadState.NotStarted,
            VoiceCatalog.combine(listOf(DownloadState.NotStarted, DownloadState.NotStarted), totals))
        assertEquals(DownloadState.Downloading(60L, 110L),
            VoiceCatalog.combine(listOf(DownloadState.Downloading(50L, 100L), DownloadState.Completed), totals))
        assertEquals(DownloadState.Paused(10L, 110L),
            VoiceCatalog.combine(listOf(DownloadState.NotStarted, DownloadState.Completed), totals))
        val failed = DownloadState.Failed(DownloadState.Reason.NETWORK)
        assertEquals(failed, VoiceCatalog.combine(listOf(failed, DownloadState.Downloading(1L, 10L)), totals))
    }
}
