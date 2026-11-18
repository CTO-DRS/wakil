// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The device location side of the prayer tools: a non-prompting GPS fix.
 * The tool run never asks for the location permission mid-plan — if the
 * permission is not already granted (or the fix fails or stalls), the tool
 * falls back to the saved city chain instead. Fix attempts are time-boxed
 * by the caller.
 */

import * as Location from 'expo-location';

export interface DeviceFix {
  lat: number;
  lng: number;
}

export async function deviceLocation(): Promise<DeviceFix | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
