package com.wakil.agent.extra

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.AlarmClock
import android.provider.CalendarContract
import android.provider.ContactsContract
import android.provider.Settings
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * On-device phone tools, ported from Rafeeq AI's expo-rafeeq-tools module so
 * the unified agent keeps the same device surface. Design rules carried over:
 * every method is local (nothing touches the network), mutating actions open
 * the system app for the user to confirm (the send/dial button always stays
 * with the user), and permission problems never throw — they return an
 * "ERROR: NEED_*" string the agent can explain, with a matching open_settings
 * tool for the screens Android does not let the app grant itself.
 */
object PhoneTools {

    // ---- pure helpers (unit-testable) ---------------------------------------

    /** Strip everything but digits and +, and drop the + for wa.me links. */
    fun sanitizeWhatsAppNumber(raw: String?, forWaMe: Boolean): String =
        (raw?.trim()?.replace(Regex("[^0-9+]"), "") ?: "").let { if (forWaMe) it.removePrefix("+") else it }

    fun isValidAlarmTime(hour: Int, minute: Int): Boolean = hour in 0..23 && minute in 0..59

    fun isValidTimerSeconds(seconds: Int): Boolean = seconds in 5..86_400

    /**
     * Accepts epoch millis, "yyyy-MM-dd HH:mm", "yyyy-MM-ddTHH:mm" or
     * "yyyy-MM-dd" (midnight) and returns epoch ms in the device zone, or
     * null. Kept pure so the calendar tools' argument handling is testable.
     */
    fun parseWhen(raw: String?): Long? {
        val s = raw?.trim() ?: return null
        if (s.isEmpty()) return null
        s.toLongOrNull()?.let { return it }
        val zone = java.time.ZoneId.systemDefault()
        val normalized = s.replace('T', ' ')
        for (pattern in listOf("yyyy-MM-dd HH:mm", "yyyy-MM-dd HH:mm:ss")) runCatching {
            return java.time.LocalDateTime.parse(normalized, java.time.format.DateTimeFormatter.ofPattern(pattern))
                .atZone(zone).toInstant().toEpochMilli()
        }
        runCatching { return java.time.LocalDateTime.parse(normalized).atZone(zone).toInstant().toEpochMilli() }
        runCatching { return java.time.LocalDate.parse(normalized).atStartOfDay(zone).toInstant().toEpochMilli() }
        return null
    }

    // ---- permission plumbing -------------------------------------------------

    private fun granted(ctx: Context, name: String): Boolean =
        ctx.checkSelfPermission(name) == PackageManager.PERMISSION_GRANTED

    /** "NEED_*" results tell the agent exactly what to ask the user for. */
    private fun needs(permission: String) = when (permission) {
        Manifest.permission.READ_CONTACTS, Manifest.permission.CALL_PHONE,
        Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR ->
            "ERROR: NEED_PERMISSION $permission — أذِن لهذا الإذن من إعدادات التطبيقات ثم أعد المحاولة."
        else -> "ERROR: NEED_PERMISSION $permission"
    }

    private fun launch(ctx: Context, intent: Intent) {
        ctx.startActivity(Intent(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Status of every phone permission, so the agent can check before acting. */
    fun permissionsStatus(ctx: Context): String {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return buildString {
            append("contacts=${granted(ctx, Manifest.permission.READ_CONTACTS)} ")
            append("callPhone=${granted(ctx, Manifest.permission.CALL_PHONE)} ")
            append("calendarRead=${granted(ctx, Manifest.permission.READ_CALENDAR)} ")
            append("calendarWrite=${granted(ctx, Manifest.permission.WRITE_CALENDAR)} ")
            append("dndPolicy=${nm.isNotificationPolicyAccessGranted} ")
            append("writeSettings=${Settings.System.canWrite(ctx)}")
        }
    }

    /** Guides the user to the special-permission screens the app cannot grant itself. */
    fun openPermissionSettings(ctx: Context, target: String): String {
        val intent = when (target) {
            "dnd" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            "write_settings" -> Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}"))
        }
        return runCatching { launch(ctx, intent); "فتحت شاشة الإذن المطلوبة." }
            .getOrElse { "ERROR: ${it.message}" }
    }

    // ---- contacts --------------------------------------------------------------

    fun contactsSearch(ctx: Context, query: String, limit: Int): String {
        if (!granted(ctx, Manifest.permission.READ_CONTACTS)) return needs(Manifest.permission.READ_CONTACTS)
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return "(لا استعلام — اكتب اسماً أو رقمًا للبحث)"
        val resolver = ctx.contentResolver
        val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        val selection =
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ? OR " +
                "${ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER} LIKE ?"
        val args = arrayOf("%$trimmed%", "%$trimmed%")
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NORMALIZED_NUMBER,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        )
        val order =
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} COLLATE LOCALIZED ASC LIMIT ${limit.coerceIn(1, 20)}"
        val contacts = mutableListOf<Pair<String, String>>()
        resolver.query(uri, projection, selection, args, order)?.use { cursor ->
            val seen = HashSet<String>()
            while (cursor.moveToNext() && contacts.size < limit.coerceIn(1, 20)) {
                val name = cursor.getString(1) ?: continue
                val number = cursor.getString(2) ?: cursor.getString(3) ?: continue
                if (seen.add("$name|$number")) contacts.add(name to number)
            }
        }
        return if (contacts.isEmpty()) "لا نتائج لـ \"$trimmed\" في جهات الاتصال."
        else contacts.joinToString("\n") { "${it.first} — ${it.second}" }
    }

    /** ACTION_CALL dials immediately when CALL_PHONE is granted; otherwise the dialer opens pre-filled. */
    fun callNumber(ctx: Context, phone: String): String {
        val digits = phone.trim()
        if (digits.isEmpty()) return "ERROR: PHONE_EMPTY"
        val (action, mode) = if (granted(ctx, Manifest.permission.CALL_PHONE))
            Intent.ACTION_CALL to "call" else Intent.ACTION_DIAL to "dial"
        return runCatching { launch(ctx, Intent(action, Uri.parse("tel:$digits")))
            if (mode == "call") "بدأت المكالمة مع $digits." else "فتحت لوحة الاتصال مع الرقم $digits — اضغط اتصال لإتمامها."
        }.getOrElse { e -> if (e is ActivityNotFoundException) "ERROR: NO_DIALER" else "ERROR: ${e.message}" }
    }

    // ---- messages (draft + open; the user always presses send) -------------------

    fun draftSms(ctx: Context, phone: String?, body: String): String =
        runCatching {
            launch(ctx, Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${phone?.trim() ?: ""}")).putExtra("sms_body", body))
            "فتحت تطبيق الرسائل بمسوّدة جاهزة — زر الإرسال بيدك."
        }.getOrElse { e -> if (e is ActivityNotFoundException) "ERROR: NO_SMS_APP" else "ERROR: ${e.message}" }

    fun draftWhatsApp(ctx: Context, text: String, phone: String?): String =
        runCatching {
            val target = sanitizeWhatsAppNumber(phone, forWaMe = false)
            if (target.isEmpty()) {
                val send = Intent(Intent.ACTION_SEND)
                send.type = "text/plain"
                send.putExtra(Intent.EXTRA_TEXT, text)
                send.setPackage("com.whatsapp")
                launch(ctx, send)
            } else {
                val digits = sanitizeWhatsAppNumber(target, forWaMe = true)
                val url = "https://wa.me/$digits?text=" + Uri.encode(text)
                launch(ctx, Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            }
            "فتحت واتساب بمسوّدة جاهزة — زر الإرسال بيدك."
        }.getOrElse { e -> if (e is ActivityNotFoundException) "ERROR: WHATSAPP_MISSING" else "ERROR: ${e.message}" }

    // ---- alarm + timer (the device clock app does the exact scheduling) ------------

    fun setAlarm(ctx: Context, hour: Int, minute: Int, label: String?): String {
        if (!isValidAlarmTime(hour, minute)) return "ERROR: ALARM_TIME_INVALID (ساعة 0-23 ودقيقة 0-59)"
        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hour)
            .putExtra(AlarmClock.EXTRA_MINUTES, minute)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        if (!label.isNullOrBlank()) intent.putExtra(AlarmClock.EXTRA_MESSAGE, label.trim())
        return runCatching { launch(ctx, intent); "ضبط المنبه على %02d:%02d${label?.let { " ($it)" } ?: ""} عبر تطبيق الساعة.".format(hour, minute) }
            .getOrElse { e -> if (e is ActivityNotFoundException) "ERROR: NO_CLOCK_APP" else "ERROR: ${e.message}" }
    }

    fun setTimer(ctx: Context, seconds: Int, label: String?): String {
        if (!isValidTimerSeconds(seconds)) return "ERROR: TIMER_LENGTH_INVALID (من 5 ثوانٍ إلى 24 ساعة)"
        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        if (!label.isNullOrBlank()) intent.putExtra(AlarmClock.EXTRA_MESSAGE, label.trim())
        val human = when {
            seconds >= 3600 -> String.format(Locale.US, "%.1f ساعة", seconds / 3600.0)
            seconds >= 60 -> "${seconds / 60} دقيقة"
            else -> "$seconds ثانية"
        }
        return runCatching { launch(ctx, intent); "ضبط المؤقت على $human عبر تطبيق الساعة." }
            .getOrElse { e -> if (e is ActivityNotFoundException) "ERROR: NO_CLOCK_APP" else "ERROR: ${e.message}" }
    }

    // ---- calendar --------------------------------------------------------------------

    private fun firstCalendarId(resolver: android.content.ContentResolver): Long? {
        val uri = CalendarContract.Calendars.CONTENT_URI
        resolver.query(uri, arrayOf(CalendarContract.Calendars._ID), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) return cursor.getLong(0)
        }
        return null
    }

    fun calendarCreate(ctx: Context, title: String, startMs: Long, endMs: Long?, allDay: Boolean, notes: String?): String {
        if (!granted(ctx, Manifest.permission.WRITE_CALENDAR) || !granted(ctx, Manifest.permission.READ_CALENDAR))
            return needs(Manifest.permission.WRITE_CALENDAR)
        val resolver = ctx.contentResolver
        val calendarId = firstCalendarId(resolver) ?: return "ERROR: NO_CALENDAR"
        val values = ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, calendarId)
            put(CalendarContract.Events.TITLE, title.trim())
            put(CalendarContract.Events.DTSTART, startMs)
            if (allDay) put(CalendarContract.Events.DURATION, "P1D")
            else put(CalendarContract.Events.DTEND, endMs ?: (startMs + 3_600_000L))
            put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
            if (!notes.isNullOrBlank()) put(CalendarContract.Events.DESCRIPTION, notes.trim())
        }
        return runCatching {
            val eventId = resolver.insert(CalendarContract.Events.CONTENT_URI, values)
            "أضفت الحدث \"${title.trim()}\" إلى التقويم (رقم ${ContentUris.parseId(eventId ?: Uri.EMPTY)})."
        }.getOrElse { "ERROR: CALENDAR_CREATE_ERROR ${it.message}" }
    }

    private val calFmt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US)

    /** Recurring events are expanded by the Instances table. */
    fun calendarList(ctx: Context, daysAhead: Int, maxCount: Int): String {
        if (!granted(ctx, Manifest.permission.READ_CALENDAR)) return needs(Manifest.permission.READ_CALENDAR)
        val resolver = ctx.contentResolver
        val start = System.currentTimeMillis()
        val end = start + daysAhead.coerceIn(1, 60).toLong() * 24L * 60L * 60L * 1000L
        val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(builder, start)
        ContentUris.appendId(builder, end)
        val projection = arrayOf(
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.EVENT_LOCATION,
        )
        val order = "${CalendarContract.Instances.BEGIN} ASC"
        val events = mutableListOf<String>()
        resolver.query(builder.build(), projection, null, null, order)?.use { cursor ->
            while (cursor.moveToNext() && events.size < maxCount.coerceIn(1, 20)) {
                events.add("#${cursor.getLong(0)} \"${cursor.getString(1) ?: ""}\" ${calFmt.format(Date(cursor.getLong(2)))}" +
                    (cursor.getString(3)?.takeIf { it.isNotBlank() }?.let { " @ $it" } ?: ""))
            }
        }
        return if (events.isEmpty()) "لا أحداث قادمة خلال $daysAhead يوم/أيام."
        else events.joinToString("\n")
    }

    fun calendarMove(ctx: Context, eventId: Long, newStartMs: Long, newEndMs: Long?): String {
        if (!granted(ctx, Manifest.permission.WRITE_CALENDAR) || !granted(ctx, Manifest.permission.READ_CALENDAR))
            return needs(Manifest.permission.WRITE_CALENDAR)
        val resolver = ctx.contentResolver
        val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId)
        val values = ContentValues().apply {
            put(CalendarContract.Events.DTSTART, newStartMs)
            if (newEndMs != null) put(CalendarContract.Events.DTEND, newEndMs)
        }
        return runCatching {
            if (resolver.update(uri, values, null, null) > 0) "نقلت الحدث #$eventId إلى ${calFmt.format(Date(newStartMs))}."
            else "ERROR: EVENT_NOT_FOUND"
        }.getOrElse { "ERROR: CALENDAR_MOVE_ERROR ${it.message}" }
    }

    // ---- device shortcuts ---------------------------------------------------------------

    private fun firstFlashCameraId(cm: CameraManager): String? {
        for (id in cm.cameraIdList) {
            val flash = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE)
            if (flash == true) return id
        }
        return null
    }

    fun torch(ctx: Context, enabled: Boolean): String {
        val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = firstFlashCameraId(cm) ?: return "ERROR: NO_FLASH"
        return runCatching { cm.setTorchMode(cameraId, enabled); if (enabled) "أشعلت المصباح." else "أطفأت المصباح." }
            .getOrElse { e -> if (e is IllegalArgumentException) "ERROR: TORCH_BUSY" else "ERROR: ${e.message}" }
    }

    fun dnd(ctx: Context, enabled: Boolean): String {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!nm.isNotificationPolicyAccessGranted) return "ERROR: NEED_POLICY_ACCESS — استخدم open_settings {\"target\": \"dnd\"} ليتيح المستخدم الإذن."
        return runCatching {
            nm.setInterruptionFilter(if (enabled) NotificationManager.INTERRUPTION_FILTER_NONE else NotificationManager.INTERRUPTION_FILTER_ALL)
            if (enabled) "فعّلت عدم الإزعاج." else "أوقفت عدم الإزعاج."
        }.getOrElse { "ERROR: DND_ERROR ${it.message}" }
    }

    fun brightness(ctx: Context, value: Int): String {
        if (!Settings.System.canWrite(ctx)) return "ERROR: NEED_WRITE_SETTINGS — استخدم open_settings {\"target\": \"write_settings\"} ليتيح المستخدم الإذن."
        // The old Settings.System.BRIGHTNESS constant was removed from newer
        // android.jar versions; the documented setting key stays "brightness".
        return runCatching { Settings.System.putInt(ctx.contentResolver, "brightness", value.coerceIn(1, 255)); "ضبطت السطوع على ${value.coerceIn(1, 255)}." }
            .getOrElse { "ERROR: BRIGHTNESS_ERROR ${it.message}" }
    }

    /** Absolute path of the shared Downloads directory (no permission implied). */
    fun publicDownloadsDir(): String = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).absolutePath

    /** True on Android 11+ when the app holds "All files access" (model library). */
    fun allFilesAccessGranted(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()
}
