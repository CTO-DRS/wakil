// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * App-side access to the RafeeqTools native module with graceful
 * degradation: on iOS, web or any environment where the module is missing,
 * `getRafeeqNative()` returns null and the phone tools report an honest,
 * localized "not available" observation instead of crashing. The lookup is
 * lazy and cached so importing the tools never touches native code (tests).
 */

import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

import type { RafeeqToolsApi } from '../../../modules/expo-rafeeq-tools';

export type { NativeCalendarEvent, NativeContact, NativeResult, RafeeqToolsApi } from '../../../modules/expo-rafeeq-tools';

let cached: RafeeqToolsApi | null | undefined;

/** Lazily resolves the native module; null when unavailable. Cached. */
export function getRafeeqNative(): RafeeqToolsApi | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'android') {
    cached = null;
    return cached;
  }
  try {
    cached = requireNativeModule<RafeeqToolsApi>('RafeeqTools');
  } catch {
    cached = null;
  }
  return cached;
}

/** Clears the cached lookup (tests inject fakes via `setRafeeqNative`). */
export function resetRafeeqNative() {
  cached = undefined;
}

let override: RafeeqToolsApi | null | undefined;

/** Test hook: force the native API (a fake) or restore the real lookup. */
export function setRafeeqNative(api: RafeeqToolsApi | null | undefined) {
  override = api;
}

export function getRafeeqNativeOrOverride(): RafeeqToolsApi | null {
  return override !== undefined ? override : getRafeeqNative();
}
