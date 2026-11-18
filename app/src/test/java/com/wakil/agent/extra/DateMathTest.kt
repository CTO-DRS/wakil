package com.wakil.agent.extra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DateMathTest {

    @Test
    fun `parses common formats`() {
        assertEquals("2026-11-15", DateMath.format("2026-11-15", "yyyy-MM-dd"))
        assertEquals("2026-11-15", DateMath.format("2026-11-15 08:30", "yyyy-MM-dd"))
        assertEquals("2026-11-15", DateMath.format("2026-11-15T08:30:00", "yyyy-MM-dd"))
        assertEquals("2026-11-15", DateMath.format("15/11/2026", "yyyy-MM-dd"))
        assertEquals("15/11/2026", DateMath.format("2026-11-15", "dd/MM/yyyy"))
        // epoch seconds and milliseconds
        assertEquals("2021-01-01", DateMath.format("1609459200", "yyyy-MM-dd"))
        assertEquals("2021-01-01", DateMath.format("1609459200000", "yyyy-MM-dd"))
    }

    @Test
    fun `relative words`() {
        val today = DateMath.format("today", "yyyy-MM-dd")
        val tomorrow = DateMath.format("tomorrow", "yyyy-MM-dd")
        val yesterday = DateMath.format("yesterday", "yyyy-MM-dd")
        assertEquals(1.0, DateMath.parseDiffDays(yesterday, today), 1e-9)
        assertEquals(1.0, DateMath.parseDiffDays(today, tomorrow), 1e-9)
        // Arabic words resolve to the same values
        assertEquals(today, DateMath.format("اليوم", "yyyy-MM-dd"))
        assertEquals(tomorrow, DateMath.format("غدا", "yyyy-MM-dd"))
        assertEquals(yesterday, DateMath.format("أمس", "yyyy-MM-dd"))
    }

    @Test
    fun `add days and weeks`() {
        assertEquals("2026-11-18", DateMath.add("2026-11-15", days = 3))
        assertEquals("2026-11-22", DateMath.add("2026-11-15", weeks = 1))
        assertEquals("2027-01-15", DateMath.add("2026-11-15", months = 2))
        assertEquals("2027-11-15", DateMath.add("2026-11-15", years = 1))
        assertEquals("2026-11-15 11:30", DateMath.add("2026-11-15 08:30", hours = 3))
        assertEquals("2026-03-01", DateMath.add("2026-02-28", days = 1))
        assertEquals("2028-02-29", DateMath.add("2028-02-28", days = 1))  // leap year
    }

    @Test
    fun `diff counts days`() {
        assertEquals(318, DateMath.parseDiffDays("2026-01-01", "2026-11-15").toLong())
        assertEquals(-10, DateMath.parseDiffDays("2026-11-25", "2026-11-15").toLong())
        val s = DateMath.diff("2026-01-01", "2026-11-15")
        assertTrue(s.contains("318"))
        assertTrue(s.contains("from 2026-01-01 to 2026-11-15"))
    }

    @Test
    fun `diff with time`() {
        val s = DateMath.diff("2026-11-15 10:00", "2026-11-15 12:30")
        assertTrue(s.contains("150 minutes"))
        assertTrue(s.contains("2 h 30 m"))
    }

    @Test
    fun `weekday formatting`() {
        // 2026-11-15 is a Sunday
        assertEquals("Sunday", DateMath.format("2026-11-15", "EEEE"))
    }

    @Test
    fun `now is well formed`() {
        assertTrue(Regex("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2} \\(\\w+\\) \\| epoch \\d+ \\| UTC[+-]\\d{2}:\\d{2} ").containsMatchIn(DateMath.now()))
    }

    @Test
    fun `errors are clear`() {
        try { DateMath.parse("not a date"); throw AssertionError("should throw") }
        catch (e: IllegalArgumentException) { assertTrue(e.message!!.contains("could not parse")) }
        try { DateMath.format("2026-11-15", ""); throw AssertionError("should throw") }
        catch (e: IllegalArgumentException) { assertTrue(e.message!!.contains("missing pattern")) }
    }
}
