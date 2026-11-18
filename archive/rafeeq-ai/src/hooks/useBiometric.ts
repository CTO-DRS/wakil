// Copyright (c) 2026 DRS AI. All rights reserved.
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';

/**
 * Whether the device can actually prompt for biometrics: a sensor exists AND
 * the user has enrolled fingerprints/face. Every call is defensive — a dev
 * build without the native module or an emulator simply reports "not
 * supported" instead of crashing the lock screen or Settings.
 */
export function useBiometricSupport(): boolean {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hardware, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!cancelled) setSupported(hardware && enrolled);
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return supported;
}

/**
 * Shows the system biometric prompt once and reports whether it succeeded.
 * The device verifies the identity itself; success only opens the PIN session
 * (see unlockBiometric) — the PIN always stays the master key.
 */
export async function promptBiometric(promptMessage: string, cancelLabel: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      disableDeviceFallback: true,
    });
    return !!result.success;
  } catch {
    return false;
  }
}
