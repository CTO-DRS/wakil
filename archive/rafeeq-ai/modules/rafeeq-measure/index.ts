// Copyright (c) 2026 DRS AI. All rights reserved.
import { requireOptionalNativeModule } from 'expo';

/**
 * JS bridge for the RafeeqMeasure local module: one call, one on-device
 * sample of the Phase-5 measurement protocol's signals. Optional by design —
 * where the native module is missing (tests, other platforms) every call is
 * a safe no-op returning null, and the lab screen says so instead of lying.
 */

export interface MeasureSample {
  tMs: number;
  batteryPct: number | null;
  tempC: number | null;
  powerMw: number | null;
  pssKb: number | null;
  charging: boolean;
  thermal: string | null;
  deviceModel: string | null;
}

type RafeeqMeasureNative = {
  readNow(): MeasureSample | null;
};

const native = (() => {
  try {
    return requireOptionalNativeModule<RafeeqMeasureNative>('RafeeqMeasure');
  } catch {
    return null;
  }
})();

/** One on-device sample; null when the probe is unavailable or fails. Never throws. */
export function readDeviceSample(): MeasureSample | null {
  if (!native) return null;
  try {
    const sample = native.readNow();
    return sample && typeof sample.tMs === 'number' ? sample : null;
  } catch {
    return null;
  }
}

/** True when the native probe is present (Android build with the module linked). */
export function hasNativeMeasure(): boolean {
  return native !== null;
}
