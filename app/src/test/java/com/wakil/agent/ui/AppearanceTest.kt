package com.wakil.agent.ui

import androidx.compose.ui.graphics.Color
import com.wakil.agent.ui.theme.Neon
import com.wakil.agent.ui.theme.Palettes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** سجل المظهر: 5 ثيمات جارفس الأصلية + 3 حزم هوية مدمجة من المشاريع القديمة (رفيق/مساعد OS/DRS AI). */
class AppearanceTest {
    private val legacyIds = listOf("rafeeq", "mosaed", "drsai")

    @Test fun eightPalettesWithUniqueIds() {
        assertEquals(8, Palettes.all.size)
        assertEquals(Palettes.all.size, Palettes.all.map { it.id }.distinct().size)
    }

    @Test fun legacyIdentityPacksAreRegistered() {
        legacyIds.forEach { id -> assertTrue("missing palette $id", Palettes.all.any { it.id == id }) }
    }

    @Test fun legacyColorsMatchOriginalProjects() {
        // قيم HEX مستخرجة حرفيًا من كود الثيم في كل مشروع قديم قبل حذفه
        val rafeeq = Palettes.byId("rafeeq")
        assertEquals(Color(0xFF22D3EE), rafeeq.cyan)      // رفيق: accent في darkPalette
        assertEquals(Color(0xFF8B5CF6), rafeeq.blue)      // رفيق: primary في darkPalette
        assertEquals(Color(0xFF7C3AED), rafeeq.violet)    // رفيق: primary في lightPalette
        assertEquals(Color(0xFFFF2D8C), rafeeq.magenta)   // رفيق: الوردي
        val mosaed = Palettes.byId("mosaed")
        assertEquals(Color(0xFF22C58B), mosaed.cyan)      // مساعد OS: الأخضر
        assertEquals(Color(0xFF4F8CFF), mosaed.blue)      // مساعد OS: الأزرق الأساسي
        assertEquals(Color(0xFF9FB0CD), mosaed.violet)    // مساعد OS: الرمادي المزرق
        assertEquals(Color(0xFFA9C6FF), mosaed.magenta)   // مساعد OS: الأزرق الفاتح
        val drsai = Palettes.byId("drsai")
        assertEquals(Color(0xFF7FDBA0), drsai.cyan)       // DRS: الأخضر الفاتح
        assertEquals(Color(0xFF006C35), drsai.blue)       // DRS: الأخضر الأساسي
        assertEquals(Color(0xFF0E5E4E), drsai.violet)     // DRS: الأخضر البحري العميق
        assertEquals(Color(0xFFE6C17F), drsai.magenta)    // DRS: الذهبي
    }

    @Test fun legacyPacksCarrySourceLabelAndNativesDoNot() {
        Palettes.all.forEach { p ->
            if (p.id in legacyIds) assertTrue("no source for ${p.id}", !p.source.isNullOrBlank())
            else assertNull("unexpected source for ${p.id}", p.source)
        }
    }

    @Test fun everyColorIsFullyOpaque() {
        Palettes.all.forEach { p ->
            listOf(p.cyan, p.blue, p.violet, p.magenta).forEach { c ->
                assertEquals("opaque ${p.id}", 1f, c.alpha, 0f)
            }
        }
    }

    @Test fun idsArePersistSafePrefsStrings() {
        Palettes.all.forEach { p ->
            assertTrue("prefs-safe id ${p.id}", Regex("[a-z]+").matches(p.id))
            assertTrue("named ${p.id}", p.name.isNotBlank())
        }
    }

    @Test fun byIdFallsBackToDefaultJarvis() {
        assertEquals("jarvis", Palettes.byId("no-such-theme").id)
        assertEquals("jarvis", Palettes.byId("").id)
    }

    @Test fun activePaletteDefaultsToJarvis() {
        assertEquals("jarvis", Neon.palette.id)
    }
}
