// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';
import { hashPin, generateSalt } from '../utils/pinHash';

type PinLockState = {
  /** The lock is on (a PIN is stored). Persisted. */
  enabled: boolean;
  /** Stretched hash of the PIN — the PIN itself is never stored. Persisted. */
  pinHash: string | null;
  /** Per-device random salt for the hash. Persisted. */
  salt: string | null;
  /** Digit count the pad collects. Persisted. */
  pinLength: number | null;
  /** Offer fingerprint/face as a shortcut on the lock screen. Persisted. */
  biometricEnabled: boolean;
  /**
   * How long the app may stay in the background before the session is closed
   * on return: 0 = lock on every return, 1 / 5 = grace window in minutes.
   * Persisted.
   */
  autoLockMinutes: number;
  /**
   * Session flag, deliberately NOT persisted: it resets on every launch and on
   * background→foreground transitions (see useAutoLockOnBackground in the root
   * layout, subject to the autoLockMinutes grace window), so coming back asks
   * for the PIN again.
   */
  unlocked: boolean;
  /** Enables the lock with a new PIN. The UI validates the format first. */
  setPin: (pin: string) => void;
  /** Verifies the current PIN and turns the lock off; false when the PIN is wrong. */
  removePin: (pin: string) => boolean;
  /** Checks a PIN and opens the session; false on a wrong PIN. */
  unlock: (pin: string) => boolean;
  /** Opens the session via the device biometric prompt; only when enabled above. */
  unlockBiometric: () => boolean;
  /** Toggles the biometric shortcut (kept when the PIN changes). */
  setBiometricEnabled: (value: boolean) => void;
  /** Sets the auto-lock grace window in minutes (0 = lock on every return). */
  setAutoLockMinutes: (minutes: number) => void;
  /** Closes the session — called on launch (implicit) and on return from background. */
  lock: () => void;
};

export const usePinLockStore = create<PinLockState>()(
  persist(
    (set, get) => ({
      enabled: false,
      pinHash: null,
      salt: null,
      pinLength: null,
      biometricEnabled: false,
      autoLockMinutes: 0,
      unlocked: false,

      setPin: (pin) => {
        const salt = generateSalt();
        set({ enabled: true, salt, pinHash: hashPin(pin, salt), pinLength: pin.length, unlocked: true });
      },

      removePin: (pin) => {
        const { salt, pinHash } = get();
        if (!salt || !pinHash || hashPin(pin, salt) !== pinHash) return false;
        set({ enabled: false, pinHash: null, salt: null, pinLength: null, unlocked: true });
        return true;
      },

      unlock: (pin) => {
        const { salt, pinHash } = get();
        if (!salt || !pinHash || hashPin(pin, salt) !== pinHash) return false;
        set({ unlocked: true });
        return true;
      },

      // The device already proved the user's identity with the biometric prompt;
      // this is a shortcut, the PIN remains the master key.
      unlockBiometric: () => {
        if (!get().enabled || !get().biometricEnabled) return false;
        set({ unlocked: true });
        return true;
      },

      setBiometricEnabled: (biometricEnabled) => set({ biometricEnabled }),

      setAutoLockMinutes: (autoLockMinutes) => set({ autoLockMinutes }),

      lock: () => set({ unlocked: false }),
    }),
    {
      name: 'rafeeq.pinlock.v1',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({
        enabled: s.enabled,
        pinHash: s.pinHash,
        salt: s.salt,
        pinLength: s.pinLength,
        biometricEnabled: s.biometricEnabled,
        autoLockMinutes: s.autoLockMinutes,
      }),
    },
  ),
);

/**
 * Pure decision for the auto-lock grace window: should the session be closed
 * when the app becomes active again? "absenceMs" is how long the app was away
 * (null = unknown, e.g. the very first activation — fail closed and lock).
 * A window of 0 is the strict mode: lock on every single return.
 */
export function shouldLockOnReturn(absenceMs: number | null, autoLockMinutes: number): boolean {
  if (autoLockMinutes <= 0) return true;
  if (absenceMs === null) return true;
  return absenceMs >= autoLockMinutes * 60_000;
}
