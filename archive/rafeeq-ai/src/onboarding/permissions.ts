// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The smart permissions registry. Every entry is a permission Rafeeq's real
 * features actually use — nothing here is decorative:
 *
 *  notifications  → reminders, morning briefing, trial diary, backup nudges
 *  microphone     → on-device voice input (whisper transcription)
 *  location       → prayer-times tool + the agent's location device tool
 *  biometric      → unlocking the PIN lock with fingerprint/face
 *  contacts       → the agent's contacts search tool
 *  calendar       → the agent's calendar tools (read/create/move)
 *  callPhone      → direct dialing (dialer itself needs no permission)
 *  dndPolicy      → the «do not disturb» tool (special access page)
 *  writeSettings  → the brightness tool (special access page)
 *
 * The core is what onboarding offers; the tool-driven ones live in the full
 * Permissions Center under Settings. Nothing is requested in bulk and nothing
 * is claimed granted before the system says so: `check()` is the only source
 * of truth, re-queried on every foreground return.
 *
 * The pure registry takes its IO as injectable functions (the same pattern as
 * `utils/reminderSchedule`), so jest exercises every branch without a device.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { useEffect, useState } from 'react';

export type PermissionId =
  | 'notifications'
  | 'microphone'
  | 'location'
  | 'biometric'
  | 'contacts'
  | 'calendar'
  | 'callPhone'
  | 'dndPolicy'
  | 'writeSettings';

export type PermissionState = 'granted' | 'denied' | 'blocked' | 'unavailable' | 'special';

/** Permissions surfaced during onboarding (non-essential, always optional). */
export const CORE_PERMISSION_IDS: readonly PermissionId[] = [
  'notifications',
  'microphone',
  'location',
  'biometric',
];

/** Permissions managed from the full Permissions Center (Settings). */
export const TOOL_PERMISSION_IDS: readonly PermissionId[] = [
  'contacts',
  'calendar',
  'callPhone',
  'dndPolicy',
  'writeSettings',
];

export type PermissionIO = {
  /** Reads the current state from the OS. Must never throw. */
  check: () => Promise<PermissionState>;
  /**
   * Starts the system grant flow. Returns the resulting state; null when this
   * permission has no in-app request (special-access pages use openPage).
   */
  request: (() => Promise<PermissionState | null>) | null;
  /** Opens the exact system page that governs this permission. */
  openPage: () => Promise<void>;
};

export type PermissionEntry = {
  readonly id: PermissionId;
  /** True = shown during onboarding; false = Permissions Center only. */
  readonly core: boolean;
  /** i18n keys: name / why / feature link. */
  readonly nameKey: string;
  readonly whyKey: string;
  readonly featureKey: string;
  readonly io: PermissionIO;
};

export const PERMISSION_ORDER: readonly PermissionId[] = [...CORE_PERMISSION_IDS, ...TOOL_PERMISSION_IDS];

function entry(id: PermissionId, io: PermissionIO): PermissionEntry {
  const nameKey = `permissions.item.${id}.name`;
  const whyKey = `permissions.item.${id}.why`;
  const featureKey = `permissions.item.${id}.feature`;
  return { id, core: CORE_PERMISSION_IDS.includes(id), nameKey, whyKey, featureKey, io };
}

export const PERMISSIONS: readonly PermissionEntry[] = [
  entry('notifications', {
    check: async () => {
      const Notifications = await import('expo-notifications');
      const s = await Notifications.getPermissionsAsync();
      if (s.granted) return 'granted';
      if (s.canAskAgain === false) return 'blocked';
      return 'denied';
    },
    request: async () => {
      const Notifications = await import('expo-notifications');
      const s = await Notifications.requestPermissionsAsync();
      if (s.granted) return 'granted';
      if (s.canAskAgain === false) return 'blocked';
      return 'denied';
    },
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('app');
    },
  }),
  entry('microphone', {
    check: async () => {
      const { PermissionsAndroid } = await import('react-native');
      return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))
        ? 'granted'
        : 'denied';
    },
    request: async () => {
      const { PermissionsAndroid } = await import('react-native');
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Rafeeq AI',
        message: 'Microphone access is used only to turn your speech into text on this device.',
        buttonPositive: 'OK',
        buttonNegative: 'Cancel',
      });
      if (r === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
      return 'denied';
    },
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('app');
    },
  }),
  entry('location', {
    check: async () => {
      const Location = await import('expo-location');
      const s = await Location.getForegroundPermissionsAsync();
      if (s.granted) return 'granted';
      if (s.canAskAgain === false) return 'blocked';
      return 'denied';
    },
    request: async () => {
      const Location = await import('expo-location');
      const s = await Location.requestForegroundPermissionsAsync();
      if (s.granted) return 'granted';
      if (s.canAskAgain === false) return 'blocked';
      return 'denied';
    },
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('app');
    },
  }),
  entry('biometric', {
    check: async () => {
      const Auth = await import('expo-local-authentication');
      const has = await Auth.hasHardwareAsync();
      if (!has) return 'unavailable';
      const enrolled = await Auth.isEnrolledAsync();
      return enrolled ? 'granted' : 'denied';
    },
    // Biometric needs no runtime dialog: enrollment happens in the OS settings.
    request: null,
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('app');
    },
  }),
  entry('contacts', {
    check: async () => {
      const { PermissionsAndroid } = await import('react-native');
      return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CONTACTS))
        ? 'granted'
        : 'denied';
    },
    request: async () => {
      const { PermissionsAndroid } = await import('react-native');
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS, {
        title: 'Rafeeq AI',
        message: 'Contact search happens on this device; a name is only read when you ask for it.',
        buttonPositive: 'OK',
        buttonNegative: 'Cancel',
      });
      if (r === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
      return 'denied';
    },
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('app');
    },
  }),
  entry('calendar', {
    check: async () => {
      const { PermissionsAndroid } = await import('react-native');
      const read = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALENDAR);
      const write = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR);
      return read && write ? 'granted' : 'denied';
    },
    request: async () => {
      const { PermissionsAndroid } = await import('react-native');
      const ask = (perm: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]) =>
        PermissionsAndroid.request(perm, {
          title: 'Rafeeq AI',
          message: 'Calendar access lets the assistant create and list your events locally.',
          buttonPositive: 'OK',
          buttonNegative: 'Cancel',
        });
      const read = await ask(PermissionsAndroid.PERMISSIONS.READ_CALENDAR);
      if (read !== PermissionsAndroid.RESULTS.GRANTED)
        return read === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
      const write = await ask(PermissionsAndroid.PERMISSIONS.WRITE_CALENDAR);
      if (write !== PermissionsAndroid.RESULTS.GRANTED)
        return write === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
      return 'granted';
    },
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('app');
    },
  }),
  entry('callPhone', {
    check: async () => {
      const { PermissionsAndroid } = await import('react-native');
      return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CALL_PHONE)) ? 'granted' : 'denied';
    },
    request: async () => {
      const { PermissionsAndroid } = await import('react-native');
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE, {
        title: 'Rafeeq AI',
        message: 'Direct dialing only; without it the dialer still opens pre-filled.',
        buttonPositive: 'OK',
        buttonNegative: 'Cancel',
      });
      if (r === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
      return 'denied';
    },
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('app');
    },
  }),
  entry('dndPolicy', {
    check: async () => {
      const Rafeeq = await import('../agent/tools/native');
      const s = await Rafeeq.getRafeeqNativeOrOverride()?.permissionsStatus();
      return s?.ok && s.dndPolicy ? 'granted' : 'special';
    },
    // Special access: no runtime dialog exists — the exact page opens instead.
    request: null,
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('dnd');
    },
  }),
  entry('writeSettings', {
    check: async () => {
      const Rafeeq = await import('../agent/tools/native');
      const s = await Rafeeq.getRafeeqNativeOrOverride()?.permissionsStatus();
      return s?.ok && s.writeSettings ? 'granted' : 'special';
    },
    request: null,
    openPage: async () => {
      const Rafeeq = await import('../agent/tools/native');
      await Rafeeq.getRafeeqNativeOrOverride()?.openPermissionSettings('write_settings');
    },
  }),
];

const BY_ID = new Map<string, PermissionEntry>(PERMISSIONS.map((p) => [p.id, p]));

export function permissionEntry(id: PermissionId): PermissionEntry | null {
  return BY_ID.get(id) ?? null;
}

/** Reads every permission's state; failures degrade to 'denied', never throw. */
export async function readAllPermissionStates(
  ids: readonly PermissionId[] = PERMISSION_ORDER,
): Promise<Record<PermissionId, PermissionState>> {
  const out = {} as Record<PermissionId, PermissionState>;
  await Promise.all(
    ids.map(async (id) => {
      const entry = BY_ID.get(id);
      if (!entry) {
        out[id] = 'denied';
        return;
      }
      try {
        out[id] = await entry.io.check();
      } catch {
        out[id] = 'denied';
      }
    }),
  );
  return out;
}

/**
 * Lifecycle-aware hook: reads states on mount and re-reads them every time the
 * app returns to the foreground (a user coming back from Android Settings is
 * exactly that), so the UI never shows a stale grant.
 */
export function usePermissionStates(ids: readonly PermissionId[] = PERMISSION_ORDER): {
  states: Partial<Record<PermissionId, PermissionState>> | null;
  refresh: () => Promise<void>;
} {
  const [states, setStates] = useState<Partial<Record<PermissionId, PermissionState>> | null>(null);
  const key = ids.join(',');
  const refresh = async () => setStates(await readAllPermissionStates(ids));
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const next = await readAllPermissionStates(key.split(',') as PermissionId[]);
      if (mounted) setStates(next);
    };
    void run();
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void run();
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [key]);
  return { states, refresh };
}
