package com.wakil.agent.extra

import com.wakil.agent.audio.OfflineVoice
import kotlin.io.path.createTempDirectory
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class V25Test {
    @Test fun extractKeepsOnlyInt8() {
        val dir = createTempDirectory("v25").toFile()
        val arc = File(dir, "m.tar.bz2")
        TarArchiveOutputStream(BZip2CompressorOutputStream(arc.outputStream())).use { t ->
            fun put(n: String, s: String) { val b = s.toByteArray(); t.putArchiveEntry(TarArchiveEntry(n).apply { size = b.size.toLong() }); t.write(b); t.closeArchiveEntry() }
            put("sherpa-onnx-whisper-base/base-encoder.onnx", "big"); put("sherpa-onnx-whisper-base/base-encoder.int8.onnx", "e8")
            put("sherpa-onnx-whisper-base/base-tokens.txt", "tok"); put("sherpa-onnx-whisper-base/test_wavs/0.wav", "w")
            put("sherpa-onnx-whisper-base/../../evil.txt", "x")
        }
        val out = File(dir, "out").apply { mkdirs() }
        val keep = OfflineVoice.PACKS.first { it.id == "asr-base" }.keep
        OfflineVoice.extract(arc, out, keep)
        assertEquals(setOf("base-encoder.int8.onnx", "base-tokens.txt"), out.list()!!.toSet())
        assertFalse(File(dir, "evil.txt").exists())
        dir.deleteRecursively()
    }

    @Test fun sentencesAndCleanup() {
        val s = OfflineVoice.splitSentences("مرحباً. كيف حالك؟ أنا وكيل!")
        assertEquals(3, s.size)
        assertEquals("", OfflineVoice.cleanAsr(" [موسيقى] "))
        assertEquals("افتح يوتيوب", OfflineVoice.cleanAsr(" افتح يوتيوب "))
    }
}

class TextMatchTest {
    @Test fun arabicNormalize() {
        val m = com.wakil.agent.access.TextMatch
        assertEquals(m.norm("إعدادات"), m.norm("اعدادات"))
        assertEquals(m.norm("الإعدادات"), m.norm("الاعدادات"))
        assertEquals(m.norm("مكتبة"), m.norm("مكتبه"))
        assertEquals("الإعدادات", m.closest("إعدادات", listOf("المحادثة", "الإعدادات", "GitHub"), 1).first())
    }

    @Test fun ocrMatchThreshold() {
        val m = com.wakil.agent.access.TextMatch
        assertTrue(m.score("الإعدادات", "الاعدادات") >= 0.6)
        assertTrue(m.score("تسجيل الدخول", "تسجيل الدخول ←") >= 0.6)
        assertTrue(m.score("الإعدادات", "المحادثة") < 0.6)
    }
}

class CpuThreadsTest {
    @org.junit.Test fun dimensity8350PicksBigCores() {
        // 1x3.35 GHz + 3x3.2 GHz A715, 4x2.2 GHz A510
        val f = listOf(2200000, 2200000, 2200000, 2200000, 3200000, 3200000, 3200000, 3350000)
        org.junit.Assert.assertEquals(4, com.wakil.agent.llm.CpuInfo.pickThreads(f, 8))
    }
    @org.junit.Test fun unreadableFallsBack() {
        org.junit.Assert.assertEquals(4, com.wakil.agent.llm.CpuInfo.pickThreads(emptyList(), 8))
    }
}

class RouterTest {
    @org.junit.Test fun routes() {
        val r = com.wakil.agent.llm.Router
        org.junit.Assert.assertTrue(r.isHard("ابني لي تطبيق آلة حاسبة"))
        org.junit.Assert.assertTrue(r.isHard("write a python script"))
        org.junit.Assert.assertFalse(r.isHard("كم نسبة البطارية"))
        org.junit.Assert.assertFalse(r.isHard("افتح يوتيوب"))
        org.junit.Assert.assertTrue(r.isHard("افتح يوتيوب", fullAccess = true))
    }
}
