// Copyright (c) 2026 DRS AI. All rights reserved.
// In-memory replacement for expo-sqlite's synchronous KV store used by persisted Zustand stores.
jest.mock('expo-sqlite/kv-store', () => {
  const map = new Map<string, string>();
  const Storage = {
    getItemSync: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItemSync: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItemSync: (k: string) => map.delete(k),
    clear: () => map.clear(),
  };
  return { __esModule: true, Storage, default: Storage, AsyncStorage: Storage };
});

jest.mock('llama.rn', () => ({ initLlama: jest.fn() }), { virtual: false });

jest.mock('whisper.rn', () => ({ initWhisper: jest.fn() }), { virtual: false });

jest.mock('@fugood/react-native-audio-pcm-stream', () => ({
  __esModule: true,
  default: { init: jest.fn(), on: jest.fn(), start: jest.fn(), stop: jest.fn() },
}));

jest.mock('expo-speech', () => {
  const api = {
    speak: jest.fn(),
    stop: jest.fn(async () => undefined),
    isSpeakingAsync: jest.fn(async () => false),
    getAvailableVoicesAsync: jest.fn(async () => []),
    maxSpeechInputLength: 4000,
  };
  return { __esModule: true, default: api, ...api };
});

jest.mock('expo-local-authentication', () => {
  const api = {
    hasHardwareAsync: jest.fn(async () => false),
    isEnrolledAsync: jest.fn(async () => false),
    authenticateAsync: jest.fn(async () => ({ success: false, error: 'not_available' })),
    SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC: 2 },
  };
  return { __esModule: true, default: api, ...api };
});

jest.mock('expo-print', () => ({
  __esModule: true,
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/rafeeq-print.pdf' })),
}));

jest.mock('expo-notifications', () => {
  const api = {
    getPermissionsAsync: jest.fn(async () => ({ granted: false })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
    scheduleNotificationAsync: jest.fn(async () => 'mock-notification-id'),
    cancelScheduledNotificationAsync: jest.fn(async () => undefined),
    SchedulableTriggerInputTypes: { DAILY: 'daily', CALENDAR: 'calendar', TIME_INTERVAL: 'timeInterval', DATE: 'date' },
  };
  return { __esModule: true, ...api };
});

jest.mock('expo-location', () => ({
  __esModule: true,
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, SixLow: 6, SixHigh: 7, BestForNavigation: 8 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 24.7136, longitude: 46.6753 } })),
}));
