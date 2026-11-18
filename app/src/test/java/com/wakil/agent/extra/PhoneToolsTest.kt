package com.wakil.agent.extra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** Pure helpers of the phone tools ported from Rafeeq AI's expo-rafeeq-tools. */
class PhoneToolsTest {

    @Test
    fun sanitizeWhatsAppNumberKeepsDigitsAndPlus() {
        assertEquals("+966501234567", PhoneTools.sanitizeWhatsAppNumber(" +966 50 123 4567 ", forWaMe = false))
        assertEquals("966501234567", PhoneTools.sanitizeWhatsAppNumber(" +966 50 123 4567 ", forWaMe = true))
        assertEquals("", PhoneTools.sanitizeWhatsAppNumber(null, forWaMe = false))
        assertEquals("0501234567", PhoneTools.sanitizeWhatsAppNumber("050-123-4567", forWaMe = false))
    }

    @Test
    fun alarmTimeValidation() {
        assertTrue(PhoneTools.isValidAlarmTime(4, 30))
        assertTrue(PhoneTools.isValidAlarmTime(0, 0))
        assertTrue(PhoneTools.isValidAlarmTime(23, 59))
        assertFalse(PhoneTools.isValidAlarmTime(24, 0))
        assertFalse(PhoneTools.isValidAlarmTime(-1, 30))
        assertFalse(PhoneTools.isValidAlarmTime(7, 60))
    }

    @Test
    fun timerValidationBounds() {
        assertFalse(PhoneTools.isValidTimerSeconds(4))
        assertTrue(PhoneTools.isValidTimerSeconds(5))
        assertTrue(PhoneTools.isValidTimerSeconds(86_400))
        assertFalse(PhoneTools.isValidTimerSeconds(86_401))
        assertFalse(PhoneTools.isValidTimerSeconds(0))
    }

    @Test
    fun parseWhenAcceptsEpochAndDates() {
        val zone = ZoneId.systemDefault()
        val expected = java.time.LocalDateTime.of(2026, 11, 20, 14, 30).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, PhoneTools.parseWhen("2026-11-20 14:30"))
        assertEquals(expected, PhoneTools.parseWhen("2026-11-20T14:30"))
        val midnight = java.time.LocalDate.of(2026, 11, 20).atStartOfDay(zone).toInstant().toEpochMilli()
        assertEquals(midnight, PhoneTools.parseWhen("2026-11-20"))
        val epoch = Instant.parse("2026-11-20T10:00:00Z").toEpochMilli()
        assertEquals(epoch, PhoneTools.parseWhen(epoch.toString()))
        assertNull(PhoneTools.parseWhen("not a date"))
        assertNull(PhoneTools.parseWhen(""))
        assertNull(PhoneTools.parseWhen(null))
        assertNotNull(PhoneTools.parseWhen(" 2026-11-20 14:30 "))
    }
}
