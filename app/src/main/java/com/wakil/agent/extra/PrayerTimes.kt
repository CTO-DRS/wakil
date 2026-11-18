package com.wakil.agent.extra

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.math.acos
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import kotlin.math.tan
import kotlin.math.asin
import kotlin.math.atan2

/**
 * Offline prayer times — a pure solar-position implementation of the Umm
 * al-Qura convention (the official Saudi method): Fajr at 18.5°, Isha fixed
 * at Maghrib + 90 minutes, Asr by the Shafi'i shadow factor. Ported from
 * Rafeeq AI's src/agent/prayer.ts so the unified agent keeps the same
 * numbers the assistant used. Nothing here touches the network and nothing
 * imports Android, so the whole object is unit-testable on the JVM.
 *
 * Accuracy on the Saudi latitudes is within a few minutes of published
 * tables; different published implementations differ between themselves by
 * about the same amount, so tests pin Riyadh fixtures with a ±5 min
 * tolerance (PrayerTimesTest).
 */
object PrayerTimes {

    enum class PrayerKey { Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha }

    enum class Convention { UMM_AL_QURA, GULF }

    /** Fixed hours from UTC (Saudi Arabia is +3, no DST). */
    data class Coords(val lat: Double, val lng: Double, val tz: Double)

    /** The six times as epoch milliseconds (absolute time). */
    data class Times(val fajr: Long, val sunrise: Long, val dhuhr: Long, val asr: Long, val maghrib: Long, val isha: Long)

    data class NamedCity(val key: String, val coords: Coords)

    data class Upcoming(val key: PrayerKey, val whenMs: Long)

    const val FAJR_ANGLE_UMM_AL_QURA = 18.5
    const val FAJR_ANGLE_GULF = 19.5
    /** Depression angle used by almanacs for sunrise/sunset. */
    const val SUNRISE_SUNSET_ANGLE = 0.833
    /** Umm al-Qura and Gulf: Isha is Maghrib + 90 minutes, always. */
    const val ISHA_DELAY_MINUTES = 90
    /** Saudi cities shadow factor (Shafi'i). */
    const val ASR_SHADOW_FACTOR = 1.0

    /** The Saudi cities the agent can name, keyed by lowercase ASCII name. */
    val SAUDI_CITIES: Map<String, Coords> = mapOf(
        "riyadh" to Coords(24.7136, 46.6753, 3.0),
        "jeddah" to Coords(21.4858, 39.1925, 3.0),
        "makkah" to Coords(21.3891, 39.8579, 3.0),
        "madinah" to Coords(24.5247, 39.5692, 3.0),
        "dammam" to Coords(26.4207, 50.0888, 3.0),
        "khobar" to Coords(26.2794, 50.2083, 3.0),
        "taif" to Coords(21.2854, 40.4183, 3.0),
        "abha" to Coords(18.2465, 42.5117, 3.0),
        "buraidah" to Coords(26.3256, 43.975, 3.0),
        "tabuk" to Coords(28.3835, 36.5662, 3.0),
        "hail" to Coords(27.5114, 41.7208, 3.0),
        "jubail" to Coords(27.0116, 49.6324, 3.0),
    )

    /** Aliases the user may produce (Saudi Arabic spellings). */
    val CITY_ALIASES: Map<String, String> = mapOf(
        "الرياض" to "riyadh",
        "جدة" to "jeddah",
        "مكة" to "makkah",
        "مكه" to "makkah",
        "مكة المكرمة" to "makkah",
        "المدينة" to "madinah",
        "المدينة المنورة" to "madinah",
        "الدمام" to "dammam",
        "الخبر" to "khobar",
        "الطائف" to "taif",
        "أبها" to "abha",
        "بريدة" to "buraidah",
        "تبوك" to "tabuk",
        "حائل" to "hail",
        "الجبيل" to "jubail",
    )

    val DEFAULT_CITY = "riyadh"

    /** Arabic display names for the supported cities (chat rendering). */
    val CITY_NAMES_AR: Map<String, String> = mapOf(
        "riyadh" to "الرياض",
        "jeddah" to "جدة",
        "makkah" to "مكة المكرمة",
        "madinah" to "المدينة المنورة",
        "dammam" to "الدمام",
        "khobar" to "الخبر",
        "taif" to "الطائف",
        "abha" to "أبها",
        "buraidah" to "بريدة",
        "tabuk" to "تبوك",
        "hail" to "حائل",
        "jubail" to "الجبيل",
    )

    val PRAYER_NAMES_AR: Map<PrayerKey, String> = mapOf(
        PrayerKey.Fajr to "الفجر",
        PrayerKey.Sunrise to "الشروق",
        PrayerKey.Dhuhr to "الظهر",
        PrayerKey.Asr to "العصر",
        PrayerKey.Maghrib to "المغرب",
        PrayerKey.Isha to "العشاء",
    )

    val PRAYER_NAMES_EN: Map<PrayerKey, String> = mapOf(
        PrayerKey.Fajr to "Fajr",
        PrayerKey.Sunrise to "Sunrise",
        PrayerKey.Dhuhr to "Dhuhr",
        PrayerKey.Asr to "Asr",
        PrayerKey.Maghrib to "Maghrib",
        PrayerKey.Isha to "Isha",
    )

    private const val DEG = Math.PI / 180

    /** Resolves a city name (English, Saudi Arabic spelling or alias) to coords. */
    fun resolveCity(raw: String?): NamedCity? {
        if (raw == null) return null
        val text = raw.trim().lowercase()
        SAUDI_CITIES[text]?.let { return NamedCity(text, it) }
        val alias = CITY_ALIASES[raw.trim()] ?: return null
        return NamedCity(alias, SAUDI_CITIES.getValue(alias))
    }

    private fun sunDeclinationAndEquation(jd: Double): Pair<Double, Double> {
        val d = jd - 2451545.0
        val g = (357.529 + 0.98560028 * d) % 360
        val q = (280.459 + 0.98564736 * d) % 360
        val l = (q + 1.915 * sin(g * DEG) + 0.02 * sin(2 * g * DEG)) % 360
        val e = 23.439 - 0.00000036 * d
        val decl = asin(sin(e * DEG) * sin(l * DEG)) / DEG
        val ra = atan2(cos(e * DEG) * sin(l * DEG), cos(l * DEG)) / DEG / 15
        // Equation of time in hours, normalized to a sane range.
        var eqt = q / 15 - ra
        while (eqt > 12) eqt -= 24
        while (eqt < -12) eqt += 24
        return decl to eqt
    }

    private fun julianDay(y0: Int, m0: Int, d: Int): Double {
        var y = y0
        var m = m0
        if (m <= 2) {
            y -= 1
            m += 12
        }
        val a = floor(y / 100.0).toInt()
        val b = 2 - a + floor(a / 4.0).toInt()
        return floor(365.25 * (y + 4716)) + floor(30.6001 * (m + 1)) + d + b - 1524.5
    }

    /** Hour angle between the transit and a depression angle, in hours. NaN when the sun never reaches it. */
    private fun angleTime(angle: Double, lat: Double, decl: Double): Double {
        val cosH = (-sin(angle * DEG) - sin(lat * DEG) * sin(decl * DEG)) / (cos(lat * DEG) * cos(decl * DEG))
        if (cosH > 1 || cosH < -1) return Double.NaN
        return acos(cosH) / DEG / 15
    }

    /** Asr offset (hours after transit) for a shadow factor. */
    private fun asrTime(shadowFactor: Double, lat: Double, decl: Double): Double {
        val angle = -atan(1.0 / (shadowFactor + tan(Math.abs(lat - decl) * DEG))) / DEG
        return angleTime(angle, lat, decl)
    }

    /** UTC midnight epoch ms of the civil date. */
    private fun utcMidnight(date: LocalDate): Long = date.toEpochDay() * 86_400_000L

    private fun localAt(date: LocalDate, tz: Double, minutes: Double): Long =
        utcMidnight(date) + ((minutes - tz * 60) * 60_000L).toLong()

    /**
     * Computes the six prayer times for one civil local date at the given
     * coordinates and timezone. Angles follow the chosen convention; all
     * values are epoch milliseconds. Polar-day/night (NaN angles) yields
     * epoch 0 for the dependent times, mirroring the original port.
     */
    fun compute(date: LocalDate, coords: Coords, convention: Convention = Convention.UMM_AL_QURA): Times {
        val jd = julianDay(date.year, date.monthValue, date.dayOfMonth) - coords.lng / (15.0 * 24)
        val (decl, eqt) = sunDeclinationAndEquation(jd)
        // Local solar transit in clock hours.
        val transit = 12 + coords.tz - coords.lng / 15 - eqt
        val transitMinutes = transit * 60
        val fajrAngle = if (convention == Convention.GULF) FAJR_ANGLE_GULF else FAJR_ANGLE_UMM_AL_QURA
        val t = angleTime(SUNRISE_SUNSET_ANGLE, coords.lat, decl)
        val tFajr = angleTime(fajrAngle, coords.lat, decl)
        val tAsr = asrTime(ASR_SHADOW_FACTOR, coords.lat, decl)
        val nan = t.isNaN() || tFajr.isNaN() || tAsr.isNaN()
        return Times(
            fajr = if (nan) 0 else localAt(date, coords.tz, transitMinutes - tFajr * 60),
            sunrise = if (nan) 0 else localAt(date, coords.tz, transitMinutes - t * 60),
            dhuhr = localAt(date, coords.tz, transitMinutes),
            asr = if (nan) 0 else localAt(date, coords.tz, transitMinutes + tAsr * 60),
            maghrib = if (nan) 0 else localAt(date, coords.tz, transitMinutes + t * 60),
            isha = if (nan) 0 else localAt(date, coords.tz, transitMinutes + t * 60 + ISHA_DELAY_MINUTES),
        )
    }

    /** Local `HH:MM` rendering of a prayer epoch ms. */
    fun formatClock(whenMs: Long, tz: Double): String {
        val shifted = Instant.ofEpochMilli(whenMs + (tz * 3_600_000L).toLong()).atZone(ZoneOffset.UTC)
        return "%02d:%02d".format(shifted.hour, shifted.minute)
    }

    /** Minutes since local midnight of a prayer epoch ms (used by tests). */
    fun minutesOfDay(whenMs: Long, tz: Double): Int {
        val shifted = Instant.ofEpochMilli(whenMs + (tz * 3_600_000L).toLong()).atZone(ZoneOffset.UTC)
        return shifted.hour * 60 + shifted.minute
    }

    /**
     * The five worship times (sunrise excluded from reminders), sorted,
     * starting from a given moment: today's remaining prayers first, then
     * tomorrow's.
     */
    fun upcoming(nowMs: Long, coords: Coords, convention: Convention = Convention.UMM_AL_QURA, maxCount: Int = 5): List<Upcoming> {
        val out = ArrayList<Upcoming>()
        val reminderKeys = listOf(PrayerKey.Fajr, PrayerKey.Dhuhr, PrayerKey.Asr, PrayerKey.Maghrib, PrayerKey.Isha)
        for (dayOffset in 0..1) {
            if (out.size >= maxCount) break
            val date = Instant.ofEpochMilli(nowMs + dayOffset * 86_400_000L).atZone(ZoneOffset.UTC).toLocalDate()
            val times = compute(date, coords, convention)
            for (key in reminderKeys) {
                val whenMs = when (key) {
                    PrayerKey.Fajr -> times.fajr
                    PrayerKey.Dhuhr -> times.dhuhr
                    PrayerKey.Asr -> times.asr
                    PrayerKey.Maghrib -> times.maghrib
                    PrayerKey.Isha -> times.isha
                    else -> continue
                }
                if (whenMs > nowMs) out.add(Upcoming(key, whenMs))
                if (out.size >= maxCount) break
            }
        }
        return out.take(maxCount)
    }

    /** One-line Arabic summary of the six times for the chat. */
    fun renderArabic(date: LocalDate, coords: Coords, convention: Convention = Convention.UMM_AL_QURA): String {
        val t = compute(date, coords, convention)
        val order = listOf(
            PrayerKey.Fajr to t.fajr, PrayerKey.Sunrise to t.sunrise, PrayerKey.Dhuhr to t.dhuhr,
            PrayerKey.Asr to t.asr, PrayerKey.Maghrib to t.maghrib, PrayerKey.Isha to t.isha,
        )
        return order.joinToString("، ") { "${PRAYER_NAMES_AR[it.first]}: ${formatClock(it.second, coords.tz)}" }
    }
}
