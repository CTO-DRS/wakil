package com.wakil.agent.extra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Ports of Rafeeq AI's agentPrayer.test.ts fixtures: published Umm al-Qura
 * prayer times for Riyadh (timesprayer.com, Riyadh November 2026 table,
 * retrieved 2026-11-08, cross-checked against al-habib.info and almosaly.com).
 * Different published implementations differ between themselves by a few
 * minutes, so the tolerance is deliberately ±5 minutes.
 */
class PrayerTimesTest {

    private val riyadh = PrayerTimes.SAUDI_CITIES.getValue("riyadh")

    private val fixtures = listOf(
        intArrayOf(2026, 11, 8) to mapOf("Fajr" to "04:44", "Sunrise" to "06:04", "Dhuhr" to "11:37", "Asr" to "14:46", "Maghrib" to "17:09", "Isha" to "18:39"),
        intArrayOf(2026, 11, 1) to mapOf("Fajr" to "04:40", "Sunrise" to "06:00", "Dhuhr" to "11:36", "Asr" to "14:49", "Maghrib" to "17:13", "Isha" to "18:43"),
        intArrayOf(2026, 11, 20) to mapOf("Fajr" to "04:51", "Sunrise" to "06:12", "Dhuhr" to "11:38", "Asr" to "14:43", "Maghrib" to "17:05", "Isha" to "18:35"),
    )

    private fun clockToMinutes(hhmm: String): Int {
        val (h, m) = hhmm.split(":").map { it.toInt() }
        return h * 60 + m
    }

    private fun date(y: Int, m: Int, d: Int) = LocalDate.of(y, m, d)

    @Test
    fun matchesPublishedRiyadhTablesWithinFiveMinutes() {
        for ((d, times) in fixtures) {
            val t = PrayerTimes.compute(date(d[0], d[1], d[2]), riyadh)
            for ((key, expected) in times) {
                val actual = PrayerTimes.minutesOfDay(prayerMs(t, key), riyadh.tz)
                val diff = kotlin.math.abs(actual - clockToMinutes(expected))
                assertTrue("$d $key: got $actual min, want ${expected} (±5 min)", diff <= 5)
            }
        }
    }

    private fun prayerMs(t: PrayerTimes.Times, key: String): Long = when (key) {
        "Fajr" -> t.fajr; "Sunrise" -> t.sunrise; "Dhuhr" -> t.dhuhr
        "Asr" -> t.asr; "Maghrib" -> t.maghrib; else -> t.isha
    }

    @Test
    fun ishaIsMaghribPlus90MinutesExactly() {
        val t = PrayerTimes.compute(date(2026, 11, 8), riyadh)
        assertEquals(
            PrayerTimes.minutesOfDay(t.maghrib, riyadh.tz) + PrayerTimes.ISHA_DELAY_MINUTES,
            PrayerTimes.minutesOfDay(t.isha, riyadh.tz),
        )
    }

    @Test
    fun keepsDayOrderingForEverySaudiCityAcrossTheYear() {
        for ((_, coords) in PrayerTimes.SAUDI_CITIES) {
            for (month in listOf(1, 4, 7, 10)) {
                val t = PrayerTimes.compute(date(2026, month, 15), coords)
                assertTrue(t.fajr <= t.sunrise)
                assertTrue(t.sunrise <= t.dhuhr)
                assertTrue(t.dhuhr <= t.asr)
                assertTrue(t.asr <= t.maghrib)
                assertTrue(t.maghrib <= t.isha)
            }
        }
    }

    @Test
    fun gulfConventionRaisesTheFajrAngleSoFajrComesEarlier() {
        // A steeper Fajr angle (19.5° vs 18.5°) means deeper sun depression,
        // so dawn breaks EARLIER in the Gulf convention; sunset is unchanged.
        val umm = PrayerTimes.compute(date(2026, 11, 8), riyadh, PrayerTimes.Convention.UMM_AL_QURA)
        val gulf = PrayerTimes.compute(date(2026, 11, 8), riyadh, PrayerTimes.Convention.GULF)
        assertTrue(gulf.fajr <= umm.fajr)
        assertEquals(PrayerTimes.minutesOfDay(umm.maghrib, riyadh.tz), PrayerTimes.minutesOfDay(gulf.maghrib, riyadh.tz))
    }

    @Test
    fun resolvesEnglishArabicAndAliasCityNames() {
        assertEquals("riyadh", PrayerTimes.resolveCity("riyadh")?.key)
        assertEquals("riyadh", PrayerTimes.resolveCity("RIYADH")?.key)
        assertEquals("jeddah", PrayerTimes.resolveCity("جدة")?.key)
        assertEquals("makkah", PrayerTimes.resolveCity("مكة المكرمة")?.key)
        assertEquals("madinah", PrayerTimes.resolveCity("المدينة")?.key)
        assertNull(PrayerTimes.resolveCity("atlantis"))
        assertNull(PrayerTimes.resolveCity(null))
    }

    @Test
    fun formatClockRendersHHMMInTheGivenZone() {
        // 2026-11-08T08:30:00Z rendered at tz +3 → 11:30.
        val ms = Instant.parse("2026-11-08T08:30:00Z").toEpochMilli()
        assertEquals("11:30", PrayerTimes.formatClock(ms, 3.0))
        assertEquals("08:30", PrayerTimes.formatClock(ms, 0.0))
    }

    @Test
    fun upcomingExcludesSunriseAndReturnsSortedFutureTimes() {
        // 2026-11-08 12:00 Riyadh time = 09:00 UTC.
        val now = Instant.parse("2026-11-08T09:00:00Z").toEpochMilli()
        val up = PrayerTimes.upcoming(now, riyadh, maxCount = 5)
        // Remaining today: Asr, Maghrib, Isha — then tomorrow Fajr, Dhuhr.
        assertEquals(5, up.size)
        assertEquals(PrayerTimes.PrayerKey.Asr, up[0].key)
        assertEquals(PrayerTimes.PrayerKey.Maghrib, up[1].key)
        assertEquals(PrayerTimes.PrayerKey.Isha, up[2].key)
        assertEquals(PrayerTimes.PrayerKey.Fajr, up[3].key)
        for (i in 1 until up.size) assertTrue(up[i - 1].whenMs < up[i].whenMs)
        for (u in up) assertTrue(u.whenMs > now)
    }

    @Test
    fun upcomingRespectsMaxCount() {
        val now = Instant.parse("2026-11-08T09:00:00Z").toEpochMilli()
        assertEquals(2, PrayerTimes.upcoming(now, riyadh, maxCount = 2).size)
    }

    @Test
    fun renderArabicContainsAllSixNames() {
        val s = PrayerTimes.renderArabic(date(2026, 11, 8), riyadh)
        for (name in listOf("الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء")) {
            assertTrue("missing $name in: $s", s.contains(name))
        }
    }
}
