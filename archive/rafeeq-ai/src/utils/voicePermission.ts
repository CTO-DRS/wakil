// Copyright (c) 2026 DRS AI. All rights reserved.
import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Asks for microphone access (Android runtime permission). iOS relies on the
 * Info.plist usage string; the app currently ships Android-only release builds.
 */
export async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Rafeeq AI',
      message: 'Microphone access is used only to turn your speech into text on this device.',
      buttonPositive: 'OK',
      buttonNegative: 'Cancel',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
