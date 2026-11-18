// Copyright (c) 2026 DRS AI. All rights reserved.
package com.drsai.rafeeq.measure

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Phase-5 measurement probe: one call returns one on-device sample of what
 * the competition's device measurements need — battery level, battery
 * temperature, instantaneous power, this process's PSS, the thermal status
 * string, the charging state and the device model. No sampling loop lives
 * here: the JS layer drives the cadence so the whole protocol
 * (docs/phase5-device-measurements.md) stays pure and testable, and every
 * unavailable surface degrades to null instead of a crash. Reads only —
 * nothing here changes device state, and no sample ever leaves the phone.
 *
 * Reading strategy: level, temperature and voltage ride the sticky
 * ACTION_BATTERY_CHANGED intent (the EXTRA_* keys), whose shape is the most
 * stable battery surface across OEM builds; only the instantaneous current
 * uses the BatteryManager property API (BATTERY_PROPERTY_CURRENT_NOW, an
 * Int property id read through getIntProperty(Int)).
 */
class RafeeqMeasureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RafeeqMeasure")

    Function("readNow") { readSample() }
  }

  private fun readSample(): Map<String, Any?> {
    val ctx = appContext.reactContext ?: return emptyMap()

    val battery = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
    val sticky: Intent? = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

    val level = sticky?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = sticky?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
    val batteryPct = if (level >= 0 && scale > 0 && level <= scale) level * 100 / scale else null

    val tempTenths = sticky?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
      ?.takeIf { it in 1..(80 * 10) }
      ?.div(10.0)
    val voltageMv = sticky?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, Int.MIN_VALUE)?.takeIf { it > 0 }
    val currentUa = battery?.prop(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
    val powerMw = if (currentUa != null && voltageMv != null) {
      currentUa * voltageMv / 1_000_000.0
    } else null

    val status = sticky?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
    val plugged = sticky?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
    val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
      status == BatteryManager.BATTERY_STATUS_FULL ||
      plugged != 0

    val memInfo = Debug.MemoryInfo()
    Debug.getMemoryInfo(memInfo)
    val pssKb = memInfo.totalPss.takeIf { it > 0 }

    val thermal = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      (ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager)
        ?.currentThermalStatus
        ?.let { thermalName(it) }
    } else null

    return mapOf(
      "tMs" to System.currentTimeMillis(),
      "batteryPct" to batteryPct,
      "tempC" to tempTenths,
      "powerMw" to powerMw,
      "pssKb" to pssKb,
      "charging" to charging,
      "thermal" to thermal,
      "deviceModel" to "${Build.MANUFACTURER} ${Build.MODEL}",
    )
  }

  /** Property read that degrades to null on the MIN_VALUE / throwing paths. */
  private fun BatteryManager.prop(id: Int): Int? = try {
    val v = getIntProperty(id)
    if (v == Int.MIN_VALUE) null else v
  } catch (_: Exception) {
    null
  }

  /** PowerManager.THERMAL_STATUS_* names, kept verbatim like the docs demand. */
  private fun thermalName(status: Int): String = when (status) {
    0 -> "none"
    1 -> "light"
    2 -> "moderate"
    3 -> "severe"
    4 -> "critical"
    5 -> "emergency"
    else -> "shutdown"
  }
}
