package com.drsai.assistant.voice

import com.drsai.assistant.voice.g2p.ArabicG2p
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

/**
 * Runs the 60 reference sentences produced by the Python training front-end
 * (espeak-ng 1.52 + misaki + clean_phonemes). Two known mismatches are documented in
 * nabra SPEC.md (بالمية, a fully vowelized التَّطْبِيقِ), so the bar is 58/60.
 */
class ArabicG2pVectorsTest {
    companion object {
        private lateinit var g2p: ArabicG2p
        private lateinit var vectors: List<List<String>>

        private fun asset(name: String): File =
            listOf(File("src/main/assets/$name"), File("app/src/main/assets/$name")).first { it.exists() }

        @JvmStatic
        @BeforeClass
        fun setUp() {
            g2p = ArabicG2p.load(asset("nabra_lexicon.tsv.gz").inputStream(), asset("nabra_numbers.tsv").inputStream())
            val text = ArabicG2pVectorsTest::class.java.classLoader!!
                .getResourceAsStream("g2p_test_vectors.tsv")!!.bufferedReader(Charsets.UTF_8).readText()
            vectors = text.lines().filter { it.isNotBlank() }.map { it.split('\t') }
        }
    }

    @Test
    fun sixtyVectors() {
        assertEquals(60, vectors.size)
        var okPh = 0
        var okIds = 0
        var okStyle = 0
        val misses = ArrayList<String>()
        for (v in vectors) {
            val r = g2p.encode(v[0])
            val ids = v[2].split(' ').filter { it.isNotEmpty() }.map { it.toInt() }
            if (r.phonemes == v[1]) okPh++ else misses += "${v[0]}\n  py: ${v[1]}\n  kt: ${r.phonemes}"
            if (r.ids.toList() == ids) okIds++
            if (r.styleIndex == v[3].toInt()) okStyle++
            // model input is wrapped [0, ids..., 0]
            assertEquals(0L, r.inputIds.first())
            assertEquals(0L, r.inputIds.last())
            assertEquals(r.ids.size + 2, r.inputIds.size)
        }
        println("G2P vectors: phonemes $okPh/60, token ids $okIds/60, style index $okStyle/60")
        misses.forEach { println("MISMATCH $it") }
        assertTrue("phonemes $okPh/60", okPh >= 58)
        assertTrue("token ids $okIds/60", okIds >= 58)
        assertTrue("style index $okStyle/60", okStyle >= 58)
    }

    @Test
    fun speakableTextEncodesWithinModelLimits() {
        for (s in SpeechText.forSpeech("أهلًا! **هذا** اختبار 😀 للرقم 2026 والرقم ٣٥.")) {
            val r = g2p.encode(s)
            assertTrue(r.ids.isNotEmpty())
            assertTrue(r.inputIds.size <= ArabicG2p.MAX_PHONEMES + 2)
            assertTrue(r.styleIndex in 0 until ArabicG2p.VOICE_ROWS)
        }
    }
}
