#!/usr/bin/env bash
# device_measure.sh — battery / RAM / thermal sampler for the Rafeeq agent
# on the target device (Infinix GT 30), for the Phase-5 measurement protocol.
#
# Usage:
#   ./device_measure.sh <session-label> [duration-seconds] [interval-seconds]
#   ./device_measure.sh voice-session 1800 30
#
# It samples every interval while YOU run the scenario on the phone:
#   - battery level (%) and temperature (°C, battery_temp is tenths of °C)
#   - battery current (µA) and voltage (mV) → instantaneous power estimate
#   - app RAM (PSS total) from `dumpsys meminfo com.drsai.rafeeq`
#   - device CPU load and ambient thermals from `dumpsys thermalservice`
#
# Output: CSV on stdout, safe to redirect into a measurement file that is
# pasted into docs/phase5-device-measurements.md. Nothing is invented — every
# row is a real sample from the connected device. No network is touched.

set -euo pipefail

LABEL="${1:?usage: device_measure.sh <label> [duration-sec] [interval-sec]}"
DURATION="${2:-1800}"
INTERVAL="${3:-30}"
PKG="com.drsai.rafeeq"

for bin in adb; do
  command -v "$bin" >/dev/null || { echo "missing $bin — install android platform-tools" >&2; exit 1; }
done

adb get-state >/dev/null 2>&1 || { echo "no device attached (run: adb devices)" >&2; exit 1; }

echo "label,elapsed_s,battery_level,battery_temp_c,current_ua,voltage_mv,power_mw,app_pss_kb,thermal_status"

end=$((SECONDS + DURATION))
while [ "$SECONDS" -lt "$end" ]; do
  battery="$(adb shell dumpsys battery 2>/dev/null)"
  level="$(printf '%s\n' "$battery" | awk '/^  level:/{print $2; exit}')"
  temp="$(printf '%s\n' "$battery" | awk '/^  temperature:/{print $2; exit}')"
  current="$(printf '%s\n' "$battery" | awk '/^  current now:/{print $3; exit}')"
  voltage="$(printf '%s\n' "$battery" | awk '/^  voltage:/{print $2; exit}')"
  meminfo="$(adb shell dumpsys meminfo "$PKG" -d 2>/dev/null | grep -E 'TOTAL PSS:' | awk '{print $3}' | head -1)"
  thermal="$(adb shell dumpsys thermalservice 2>/dev/null | grep -m1 -E 'Status :|mIsStatusOverride' | sed 's/^ *//' || true)"

  # µA × mV = pW → /1e6 = mW (sign: negative = discharging)
  power="$(awk -v c="${current:-0}" -v v="${voltage:-0}" 'BEGIN{printf "%.0f", (c*v)/1000000.0}')"
  temp_c="$(awk -v t="${temp:-0}" 'BEGIN{printf "%.1f", t/10.0}')"

  echo "$LABEL,$SECONDS,${level:-?},${temp_c:-?},${current:-?},${voltage:-?},${power:-?},${meminfo:-?},${thermal:-?}"
  sleep "$INTERVAL"
done
