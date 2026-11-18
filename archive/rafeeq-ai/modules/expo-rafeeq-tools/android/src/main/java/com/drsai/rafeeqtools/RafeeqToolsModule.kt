package com.drsai.rafeeqtools

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
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
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.TimeZone

/**
 * Rafeeq's on-device phone tools, one Expo module for the whole Phase-2 set.
 *
 * Design rules (competition hard rules):
 *  - Every method is local; nothing here touches the network.
 *  - The JS agent loop shows a confirmation card BEFORE any mutating call
 *    reaches this module; inside Kotlin we only re-check permissions and
 *    return structured result codes the agent can speak in Arabic.
 *  - Permission problems never throw into JS; they resolve as
 *    {ok=false, code=PERMISSION_*} or a NEED_* code pointing at settings.
 */
class RafeeqToolsModule : Module() {
  private fun ctx(): Context = requireNotNull(appContext.reactContext) { "NO_CONTEXT" }

  private fun granted(name: String): Boolean {
    val c = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(c, name) == PackageManager.PERMISSION_GRANTED
  }

  private fun launch(intent: Intent): Boolean {
    val c = ctx()
    val toStart = Intent(intent).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    c.startActivity(toStart)
    return true
  }

  private fun firstFlashCameraId(cm: CameraManager): String? {
    for (id in cm.cameraIdList) {
      val flash = cm.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE)
      if (flash == true) return id
    }
    return null
  }

  private fun deny(code: String, message: String? = null): Map<String, Any?> =
    mapOf("ok" to false, "code" to code, "message" to message)

  private fun firstCalendarId(resolver: android.content.ContentResolver): Long? {
    val uri = CalendarContract.Calendars.CONTENT_URI
    resolver.query(uri, arrayOf(CalendarContract.Calendars._ID), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) return cursor.getLong(0)
    }
    return null
  }

  override fun definition() = ModuleDefinition {
    Name("RafeeqTools")

    // ---- permissions -------------------------------------------------------

    AsyncFunction("permissionsStatus") { promise: Promise ->
      try {
        val nm = ctx().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        promise.resolve(
          mapOf(
            "ok" to true,
            "contacts" to granted(Manifest.permission.READ_CONTACTS),
            "callPhone" to granted(Manifest.permission.CALL_PHONE),
            "calendarRead" to granted(Manifest.permission.READ_CALENDAR),
            "calendarWrite" to granted(Manifest.permission.WRITE_CALENDAR),
            "dndPolicy" to nm.isNotificationPolicyAccessGranted,
            "writeSettings" to Settings.System.canWrite(ctx()),
          ),
        )
      } catch (e: Exception) {
        promise.resolve(deny("STATUS_ERROR", e.message))
      }
    }

    // ---- contacts ----------------------------------------------------------

    AsyncFunction("contactsSearch") { query: String, limit: Int, promise: Promise ->
      try {
        if (!granted(Manifest.permission.READ_CONTACTS)) {
          promise.resolve(deny("PERMISSION_CONTACTS"))
          return@AsyncFunction
        }
        val trimmed = query.trim()
        if (trimmed.isEmpty()) {
          promise.resolve(mapOf("ok" to true, "contacts" to emptyList<Map<String, String>>()))
          return@AsyncFunction
        }
        val resolver = ctx().contentResolver
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
        val contacts = mutableListOf<Map<String, String>>()
        resolver.query(uri, projection, selection, args, order)?.use { cursor ->
          val seen = HashSet<String>()
          while (cursor.moveToNext() && contacts.size < limit.coerceIn(1, 20)) {
            val name = cursor.getString(1) ?: continue
            val number = cursor.getString(2) ?: cursor.getString(3) ?: continue
            val key = "$name|$number"
            if (seen.add(key)) {
              contacts.add(mapOf("name" to name, "phone" to number))
            }
          }
        }
        promise.resolve(mapOf("ok" to true, "contacts" to contacts))
      } catch (e: Exception) {
        promise.resolve(deny("CONTACTS_ERROR", e.message))
      }
    }

    // ACTION_CALL dials immediately when CALL_PHONE is granted; otherwise the
    // dialer opens with the number pre-filled (the user still presses call).
    AsyncFunction("callNumber") { phone: String, promise: Promise ->
      try {
        val digits = phone.trim()
        if (digits.isEmpty()) {
          promise.resolve(deny("PHONE_EMPTY"))
          return@AsyncFunction
        }
        if (granted(Manifest.permission.CALL_PHONE)) {
          launch(Intent(Intent.ACTION_CALL, Uri.parse("tel:$digits")))
          promise.resolve(mapOf("ok" to true, "mode" to "call"))
        } else {
          launch(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$digits")))
          promise.resolve(mapOf("ok" to true, "mode" to "dial"))
        }
      } catch (e: ActivityNotFoundException) {
        promise.resolve(deny("NO_DIALER", e.message))
      } catch (e: Exception) {
        promise.resolve(deny("CALL_ERROR", e.message))
      }
    }

    // ---- messages (draft + open; the user always presses send) --------------

    AsyncFunction("draftSms") { phone: String?, body: String, promise: Promise ->
      try {
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${phone?.trim() ?: ""}"))
        intent.putExtra("sms_body", body)
        launch(intent)
        promise.resolve(mapOf("ok" to true))
      } catch (e: ActivityNotFoundException) {
        promise.resolve(deny("NO_SMS_APP", e.message))
      } catch (e: Exception) {
        promise.resolve(deny("SMS_ERROR", e.message))
      }
    }

    AsyncFunction("draftWhatsApp") { text: String, phone: String?, promise: Promise ->
      try {
        val target = phone?.trim()?.replace(Regex("[^0-9+]"), "") ?: ""
        if (target.isEmpty()) {
          val send = Intent(Intent.ACTION_SEND)
          send.type = "text/plain"
          send.putExtra(Intent.EXTRA_TEXT, text)
          send.setPackage("com.whatsapp")
          launch(send)
        } else {
          val digits = target.removePrefix("+")
          val url = "https://wa.me/$digits?text=" + android.net.Uri.encode(text)
          launch(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
        promise.resolve(mapOf("ok" to true))
      } catch (e: ActivityNotFoundException) {
        promise.resolve(deny("WHATSAPP_MISSING", e.message))
      } catch (e: Exception) {
        promise.resolve(deny("WHATSAPP_ERROR", e.message))
      }
    }

    // ---- alarm + timer (the device clock app does the exact scheduling) -----

    AsyncFunction("setAlarmClock") { hour: Int, minute: Int, label: String?, promise: Promise ->
      try {
        if (hour !in 0..23 || minute !in 0..59) {
          promise.resolve(deny("ALARM_TIME_INVALID"))
          return@AsyncFunction
        }
        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
          .putExtra(AlarmClock.EXTRA_HOUR, hour)
          .putExtra(AlarmClock.EXTRA_MINUTES, minute)
          .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        if (!label.isNullOrBlank()) intent.putExtra(AlarmClock.EXTRA_MESSAGE, label.trim())
        launch(intent)
        promise.resolve(mapOf("ok" to true))
      } catch (e: ActivityNotFoundException) {
        promise.resolve(deny("NO_CLOCK_APP", e.message))
      } catch (e: Exception) {
        promise.resolve(deny("ALARM_ERROR", e.message))
      }
    }

    AsyncFunction("setDeviceTimer") { seconds: Int, label: String?, promise: Promise ->
      try {
        if (seconds < 5 || seconds > 86_400) {
          promise.resolve(deny("TIMER_LENGTH_INVALID"))
          return@AsyncFunction
        }
        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
          .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
          .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        if (!label.isNullOrBlank()) intent.putExtra(AlarmClock.EXTRA_MESSAGE, label.trim())
        launch(intent)
        promise.resolve(mapOf("ok" to true))
      } catch (e: ActivityNotFoundException) {
        promise.resolve(deny("NO_CLOCK_APP", e.message))
      } catch (e: Exception) {
        promise.resolve(deny("TIMER_ERROR", e.message))
      }
    }

    // ---- calendar -----------------------------------------------------------

    AsyncFunction("calendarCreate") {
      title: String,
      startMs: Double,
      endMs: Double?,
      allDay: Boolean,
      notes: String?,
      promise: Promise ->
      try {
        if (!granted(Manifest.permission.WRITE_CALENDAR) || !granted(Manifest.permission.READ_CALENDAR)) {
          promise.resolve(deny("PERMISSION_CALENDAR"))
          return@AsyncFunction
        }
        val resolver = ctx().contentResolver
        val calendarId = firstCalendarId(resolver)
          ?: return@AsyncFunction promise.resolve(deny("NO_CALENDAR"))
        val values = ContentValues().apply {
          put(CalendarContract.Events.CALENDAR_ID, calendarId)
          put(CalendarContract.Events.TITLE, title.trim())
          put(CalendarContract.Events.DTSTART, startMs.toLong())
          if (allDay) {
            put(CalendarContract.Events.DTSTART, startMs.toLong())
            put(CalendarContract.Events.DURATION, "P1D")
          } else {
            put(CalendarContract.Events.DTSTART, startMs.toLong())
            put(CalendarContract.Events.DTEND, (endMs ?: (startMs + 3_600_000.0)).toLong())
          }
          put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
          if (!notes.isNullOrBlank()) put(CalendarContract.Events.DESCRIPTION, notes.trim())
        }
        val eventId = resolver.insert(CalendarContract.Events.CONTENT_URI, values)
        promise.resolve(mapOf("ok" to true, "eventId" to ContentUris.parseId(eventId ?: Uri.EMPTY)))
      } catch (e: Exception) {
        promise.resolve(deny("CALENDAR_CREATE_ERROR", e.message))
      }
    }

    // Recurring events are expanded by the Instances table.
    AsyncFunction("calendarListUpcoming") { daysAhead: Int, maxCount: Int, promise: Promise ->
      try {
        if (!granted(Manifest.permission.READ_CALENDAR)) {
          promise.resolve(deny("PERMISSION_CALENDAR"))
          return@AsyncFunction
        }
        val resolver = ctx().contentResolver
        val start = System.currentTimeMillis()
        val end = start + daysAhead.coerceIn(1, 60).toLong() * 24L * 60L * 60L * 1000L
        val builder = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(builder, start)
        ContentUris.appendId(builder, end)
        val projection = arrayOf(
          CalendarContract.Instances.EVENT_ID,
          CalendarContract.Instances.TITLE,
          CalendarContract.Instances.BEGIN,
          CalendarContract.Instances.END,
          CalendarContract.Instances.ALL_DAY,
          CalendarContract.Instances.EVENT_LOCATION,
        )
        val order = "${CalendarContract.Instances.BEGIN} ASC"
        val events = mutableListOf<Map<String, Any?>>()
        resolver.query(builder.build(), projection, null, null, order)?.use { cursor ->
          while (cursor.moveToNext() && events.size < maxCount.coerceIn(1, 20)) {
            events.add(
              mapOf(
                "id" to cursor.getLong(0),
                "title" to (cursor.getString(1) ?: ""),
                "startMs" to cursor.getLong(2),
                "endMs" to cursor.getLong(3),
                "allDay" to (cursor.getInt(4) == 1),
                "location" to (cursor.getString(5) ?: ""),
              ),
            )
          }
        }
        promise.resolve(mapOf("ok" to true, "events" to events))
      } catch (e: Exception) {
        promise.resolve(deny("CALENDAR_LIST_ERROR", e.message))
      }
    }

    AsyncFunction("calendarMove") { eventId: Double, newStartMs: Double, newEndMs: Double?, promise: Promise ->
      try {
        if (!granted(Manifest.permission.WRITE_CALENDAR) || !granted(Manifest.permission.READ_CALENDAR)) {
          promise.resolve(deny("PERMISSION_CALENDAR"))
          return@AsyncFunction
        }
        val resolver = ctx().contentResolver
        val uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId.toLong())
        val values = ContentValues().apply {
          put(CalendarContract.Events.DTSTART, newStartMs.toLong())
          if (newEndMs != null) put(CalendarContract.Events.DTEND, newEndMs.toLong())
        }
        val updated = resolver.update(uri, values, null, null)
        if (updated <= 0) {
          promise.resolve(deny("EVENT_NOT_FOUND"))
        } else {
          promise.resolve(mapOf("ok" to true))
        }
      } catch (e: Exception) {
        promise.resolve(deny("CALENDAR_MOVE_ERROR", e.message))
      }
    }

    // ---- device shortcuts ----------------------------------------------------

    AsyncFunction("torchSet") { enabled: Boolean, promise: Promise ->
      try {
        val cm = ctx().getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = firstFlashCameraId(cm)
          ?: return@AsyncFunction promise.resolve(deny("NO_FLASH"))
        cm.setTorchMode(cameraId, enabled)
        promise.resolve(mapOf("ok" to true))
      } catch (e: IllegalArgumentException) {
        promise.resolve(deny("TORCH_BUSY", e.message))
      } catch (e: Exception) {
        promise.resolve(deny("TORCH_ERROR", e.message))
      }
    }

    AsyncFunction("dndSet") { enabled: Boolean, promise: Promise ->
      try {
        val nm = ctx().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!nm.isNotificationPolicyAccessGranted) {
          promise.resolve(deny("NEED_POLICY_ACCESS"))
          return@AsyncFunction
        }
        nm.setInterruptionFilter(
          if (enabled) NotificationManager.INTERRUPTION_FILTER_NONE else NotificationManager.INTERRUPTION_FILTER_ALL,
        )
        promise.resolve(mapOf("ok" to true))
      } catch (e: Exception) {
        promise.resolve(deny("DND_ERROR", e.message))
      }
    }

    AsyncFunction("brightnessSet") { value: Int, promise: Promise ->
      try {
        if (!Settings.System.canWrite(ctx())) {
          promise.resolve(deny("NEED_WRITE_SETTINGS"))
          return@AsyncFunction
        }
        // The old Settings.System.BRIGHTNESS constant was removed from newer
        // android.jar versions; the documented setting key stays "brightness".
        Settings.System.putInt(ctx().contentResolver, "brightness", value.coerceIn(1, 255))
        promise.resolve(mapOf("ok" to true))
      } catch (e: Exception) {
        promise.resolve(deny("BRIGHTNESS_ERROR", e.message))
      }
    }

    // Android 10+ cannot toggle Wi-Fi programmatically; the connectivity
    // settings panel is the sanctioned shortcut.
    AsyncFunction("openWifiPanel") { promise: Promise ->
      try {
        val intent = if (android.os.Build.VERSION.SDK_INT >= 29) {
          Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY)
        } else {
          Intent(Settings.ACTION_WIFI_SETTINGS)
        }
        launch(intent)
        promise.resolve(mapOf("ok" to true))
      } catch (e: Exception) {
        promise.resolve(deny("WIFI_PANEL_ERROR", e.message))
      }
    }

    // Guides the user to the special-permission screens the agent cannot
    // grant itself (Do Not Disturb policy, system write settings).
    AsyncFunction("openPermissionSettings") { target: String, promise: Promise ->
      try {
        val intent = when (target) {
          "dnd" -> Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
          "write_settings" -> Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS)
          else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx().packageName}"))
        }
        launch(intent)
        promise.resolve(mapOf("ok" to true))
      } catch (e: Exception) {
        promise.resolve(deny("SETTINGS_ERROR", e.message))
      }
    }

    // ---- model storage (shared Downloads/Rafeeq) --------------------------

    /**
     * "All files access" is the only way Android 11+ lets an app read its own
     * model files from the shared Downloads folder after a reinstall (the
     * files are no longer "owned" by a fresh install). Never granted silently:
     * the user flips it in Settings through openAllFilesAccessSettings().
     */
    AsyncFunction("allFilesAccessStatus") { promise: Promise ->
      try {
        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
        val granted = supported && Environment.isExternalStorageManager()
        promise.resolve(mapOf("ok" to true, "supported" to supported, "granted" to granted))
      } catch (e: Exception) {
        promise.resolve(deny("STATUS_ERROR", e.message))
      }
    }

    AsyncFunction("openAllFilesAccessSettings") { promise: Promise ->
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
          promise.resolve(deny("UNSUPPORTED"))
          return@AsyncFunction
        }
        val appSpecific = Intent(
          Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
          Uri.parse("package:${ctx().packageName}")
        )
        try {
          launch(appSpecific)
        } catch (e: ActivityNotFoundException) {
          launch(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
        }
        promise.resolve(mapOf("ok" to true))
      } catch (e: Exception) {
        promise.resolve(deny("SETTINGS_ERROR", e.message))
      }
    }

    /** Absolute path of the shared Downloads directory (no permission implied). */
    AsyncFunction("publicDownloadsDir") { promise: Promise ->
      try {
        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        promise.resolve(mapOf("ok" to true, "path" to dir.absolutePath))
      } catch (e: Exception) {
        promise.resolve(deny("PATH_ERROR", e.message))
      }
    }

    // ---- launcher icon designs ---------------------------------------------

    /**
     * The alternate launcher icons ride *activity aliases* declared in the
     * manifest by the withLauncherIcons config plugin; exactly one is enabled
     * at a time. Reading the current one walks the package's own components:
     * the enabled alias decides the icon, and none-enabled falls back to the
     * default (fresh installs before the first switch).
     */
    val launcherAliasIds = listOf("midnight", "gold", "glass", "cyber", "neon", "mono", "sunset")

    fun aliasClassFor(id: String): String = if (id == "default") "Icon_Classic" else "Icon_$id"

    fun aliasComponent(cls: String): ComponentName =
      ComponentName(ctx().packageName, "${ctx().packageName}.$cls")

    fun componentState(cls: String): Int =
      ctx().packageManager.getComponentEnabledSetting(aliasComponent(cls))

    fun aliasEnabled(cls: String): Boolean {
      val state = componentState(cls)
      return if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) cls == "Icon_Classic" else state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
    }

    AsyncFunction("launcherIconStatus") { promise: Promise ->
      try {
        val pm = ctx().packageManager
        val active = (listOf("default") + launcherAliasIds).firstOrNull { id -> aliasEnabled(aliasClassFor(id)) } ?: "default"
        val declared = pm.getPackageInfo(ctx().packageName, PackageManager.GET_ACTIVITIES).activities
          ?.map { it.name }
          ?.filter { it.substringAfterLast('.') in setOf("Icon_Classic") + launcherAliasIds.map { id -> "Icon_$id" } }
          ?: emptyList()
        promise.resolve(mapOf("ok" to true, "supported" to declared.isNotEmpty(), "iconId" to active))
      } catch (e: Exception) {
        promise.resolve(deny("ICON_STATUS_ERROR", e.message))
      }
    }

    /**
     * Switches the launcher icon by component state, in the one safe order:
     * ENABLE the target alias first, then disable the rest — a crash between
     * the two steps can never leave the launcher without an icon. The plan's
     * ordering mirrors src/appearance/appIcons.ts (planIconSwitch), tested.
     */
    AsyncFunction("setLauncherIcon") { iconId: String, promise: Promise ->
      try {
        val known = iconId == "default" || launcherAliasIds.contains(iconId)
        if (!known) {
          promise.resolve(deny("ICON_UNKNOWN"))
          return@AsyncFunction
        }
        val pm = ctx().packageManager
        val enable = aliasClassFor(iconId)
        val disable = (listOf("default") + launcherAliasIds)
          .filter { it != iconId }
          .map { aliasClassFor(it) }
        pm.setComponentEnabledSetting(
          aliasComponent(enable),
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
          PackageManager.DONT_KILL_APP,
        )
        for (cls in disable) {
          if (cls != enable) {
            pm.setComponentEnabledSetting(
              aliasComponent(cls),
              PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
              PackageManager.DONT_KILL_APP,
            )
          }
        }
        promise.resolve(mapOf("ok" to true, "iconId" to iconId))
      } catch (e: Exception) {
        promise.resolve(deny("ICON_SWITCH_ERROR", e.message))
      }
    }
  }
}
