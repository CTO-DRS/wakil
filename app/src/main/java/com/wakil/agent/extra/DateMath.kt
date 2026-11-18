package com.wakil.agent.extra

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Date/time arithmetic for the `datetime` tool.
 *
 * Small local LLMs regularly miscount days, months and weekdays; this tool answers
 * "what date is next Friday", "how many days until X" and reformatting questions exactly.
 * Pure JVM code (SimpleDateFormat/Calendar), fully unit-tested.
 *
 * Accepted date input: "yyyy-MM-dd", "yyyy-MM-dd HH:mm" (+ :ss), ISO "yyyy-MM-ddTHH:mm(:ss)",
 * "dd/MM/yyyy", "HH:mm" (today), epoch seconds or milliseconds (bare digits), and the
 * relative words today/tomorrow/yesterday and اليوم/غدا/بكرة/أمس.
 */
object DateMath {

    private val INPUT_FORMATS = listOf(
        "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm",
        "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm",
        "yyyy-MM-dd", "dd/MM/yyyy", "HH:mm",
    )

    fun op(args: JSONObject): String = when (args.optString("op", "now").lowercase().trim()) {
        "now" -> now()
        "add" -> add(
            args.optString("date").ifBlank { args.optString("from") },
            args.optInt("days"), args.optInt("hours"), args.optInt("minutes"),
            args.optInt("months"), args.optInt("years"), args.optInt("weeks"),
        )
        "diff" -> diff(args.optString("from"), args.optString("to"))
        "format" -> format(args.optString("date"), args.optString("pattern", "yyyy-MM-dd"))
        else -> throw IllegalArgumentException("op must be now|add|diff|format")
    }

    // ---- operations ---------------------------------------------------------

    fun now(): String {
        val cal = Calendar.getInstance()
        val tz = TimeZone.getDefault()
        val offset = java.util.concurrent.TimeUnit.MINUTES.convert(tz.getOffset(cal.timeInMillis).toLong(), java.util.concurrent.TimeUnit.MILLISECONDS)
        val sign = if (offset >= 0) "+" else "-"
        val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        return "${fmt.format(cal.time)} (${cal.getDisplayName(Calendar.DAY_OF_WEEK, Calendar.LONG, Locale.US)}) | " +
            "epoch ${cal.timeInMillis / 1000} | UTC$sign${String.format(Locale.US, "%02d:%02d", Math.abs(offset) / 60, Math.abs(offset) % 60)} $tz.id"
    }

    fun add(date: String, days: Int = 0, hours: Int = 0, minutes: Int = 0, months: Int = 0, years: Int = 0, weeks: Int = 0): String {
        val cal = Calendar.getInstance().apply { time = parse(date, "date") }
        if (days != 0) cal.add(Calendar.DAY_OF_MONTH, days)
        if (weeks != 0) cal.add(Calendar.DAY_OF_MONTH, weeks * 7)
        if (hours != 0) cal.add(Calendar.HOUR_OF_DAY, hours)
        if (minutes != 0) cal.add(Calendar.MINUTE, minutes)
        if (months != 0) cal.add(Calendar.MONTH, months)
        if (years != 0) cal.add(Calendar.YEAR, years)
        return fmt(cal.time, cal.hasTime())
    }

    fun diff(fromRaw: String, toRaw: String): String {
        val from = parse(fromRaw, "from")
        val to = parse(toRaw, "to")
        val ms = to.time - from.time
        val days = Math.round(ms / 86_400_000.0)
        val sign = if (ms < 0) "-" else ""
        val dir = if (ms < 0) "$toRaw is BEFORE $fromRaw" else "from $fromRaw to $toRaw"
        val withTime = hasTimePart(fromRaw) && hasTimePart(toRaw)
        return if (withTime) {
            val absMin = Math.abs(ms) / 60_000
            val d = absMin / 1440; val h = (absMin % 1440) / 60; val m = absMin % 60
            "$sign${absMin} minutes | $sign$d days $h h $m m | $dir"
        } else "$sign${Math.abs(days)} days | $dir"
    }

    /** Whole days from `from` to `to` (negative when `to` is earlier). Test helper. */
    fun parseDiffDays(from: String, to: String): Double =
        Math.round((parse(to, "to").time - parse(from, "from").time) / 86_400_000.0).toDouble()

    fun format(date: String, pattern: String): String {
        if (pattern.isBlank()) throw IllegalArgumentException("missing pattern")
        val d = parse(date, "date")
        return try { SimpleDateFormat(pattern, Locale.US).format(d) }
        catch (e: Exception) { throw IllegalArgumentException("bad pattern '$pattern' (use e.g. yyyy-MM-dd, EEEE, HH:mm)") }
    }

    // ---- parsing ------------------------------------------------------------

    private fun Calendar.hasTime(): Boolean =
        get(Calendar.HOUR_OF_DAY) != 0 || get(Calendar.MINUTE) != 0 || get(Calendar.SECOND) != 0

    private fun hasTimePart(s: String) = s.contains(':') || s.contains('T')

    private fun fmt(d: Date, withTime: Boolean): String =
        SimpleDateFormat(if (withTime) "yyyy-MM-dd HH:mm" else "yyyy-MM-dd", Locale.US).format(d)

    fun parse(raw: String, label: String = "date"): Date {
        val s = resolveRelative(raw.trim())
        if (s.isEmpty()) throw IllegalArgumentException("missing $label")
        if (s.matches(Regex("\\d+"))) {
            // Bare digits: 13+ digits = epoch milliseconds, otherwise epoch seconds.
            return Date(if (s.length >= 13) s.toLong() else s.toLong() * 1000)
        }
        for (f in INPUT_FORMATS) {
            val df = SimpleDateFormat(f, Locale.US); df.isLenient = false
            runCatching { return df.parse(s) ?: throw IllegalArgumentException("") }
        }
        throw IllegalArgumentException(
            "could not parse $label '$raw' (use yyyy-MM-dd, \"yyyy-MM-dd HH:mm\", dd/MM/yyyy, or today/tomorrow/yesterday)"
        )
    }

    private fun resolveRelative(s: String): String = when (s.lowercase().trim()) {
        "today", "اليوم" -> isoDay(0)
        "tomorrow", "غدا", "غداً", "بكرة" -> isoDay(1)
        "yesterday", "أمس", "امس" -> isoDay(-1)
        else -> s
    }

    /** Today ± daysOffset as a plain yyyy-MM-dd string (parseable by INPUT_FORMATS). */
    private fun isoDay(daysOffset: Int): String {
        val cal = Calendar.getInstance(); cal.add(Calendar.DAY_OF_MONTH, daysOffset)
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.time)
    }
}
