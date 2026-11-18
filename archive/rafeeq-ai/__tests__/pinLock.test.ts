// Copyright (c) 2026 DRS AI. All rights reserved.
import { Storage } from 'expo-sqlite/kv-store';

import { shouldLockOnReturn, usePinLockStore } from '../src/store/pinLockStore';
import { generateSalt, hashPin, isValidPin, PIN_LENGTH, PIN_ROUNDS } from '../src/utils/pinHash';

// Independent reference vector: python3 hashlib, same scheme — start from
// "salt:pin" and chain sha256(...).hexdigest() PIN_ROUNDS times.
//   h = 'aabb:1234'
//   for _ in range(3000): h = sha256(h.encode()).hexdigest()
const REFERENCE_HASH = '752554de539e5e0b3b2b29c1c8b2de70d67eb231bb2e3a7b7c27e25c5663e5d4';

describe('pinHash', () => {
  it('matches an independently computed reference for the stretching scheme', () => {
    expect(PIN_ROUNDS).toBe(3000);
    expect(hashPin('1234', 'aabb')).toBe(REFERENCE_HASH);
  });

  it('differs per salt and per pin', () => {
    expect(hashPin('1234', 'aabb')).not.toBe(hashPin('1234', 'ccdd'));
    expect(hashPin('1234', 'aabb')).not.toBe(hashPin('5678', 'aabb'));
    expect(hashPin('1234', 'aabb')).toBe(hashPin('1234', 'aabb'));
  });

  it.each([
    ['1234', true],
    ['0000', true],
    ['123', false],
    ['12345', false],
    ['12a4', false],
    ['', false],
  ])('validates %j', (pin, ok) => {
    expect(isValidPin(pin)).toBe(ok);
    expect(PIN_LENGTH).toBe(4);
  });

  it('generates unique 32-char hex salts', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe('shouldLockOnReturn', () => {
  it.each([
    [0, 0, true], // strict mode: lock on every return, however brief
    [59_999, 0, true],
    [30_000, 1, false], // back inside the one-minute grace window
    [60_000, 1, true], // exactly at the window boundary
    [61_000, 1, true],
    [299_999, 5, false],
    [300_000, 5, true],
    [null, 1, true], // unknown absence (first activation) fails closed
    [null, 0, true],
  ])('absence=%j ms, window=%j min → lock=%j', (absence, minutes, expected) => {
    expect(shouldLockOnReturn(absence, minutes)).toBe(expected);
  });
});

describe('pinLockStore', () => {
  beforeEach(() => {
    Storage.clear();
    usePinLockStore.setState({
      enabled: false,
      pinHash: null,
      salt: null,
      pinLength: null,
      biometricEnabled: false,
      autoLockMinutes: 0,
      unlocked: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts open and disabled: no lock screen without a configured PIN', () => {
    const s = usePinLockStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.unlocked).toBe(false);
    // Gate logic used by the root layout: enabled && !unlocked
    expect(s.enabled && !s.unlocked).toBe(false);
  });

  it('setPin enables the lock, keeps the session open, and never stores the plain PIN', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // deterministic salt
    usePinLockStore.getState().setPin('1234');

    const s = usePinLockStore.getState();
    expect(s.enabled).toBe(true);
    expect(s.unlocked).toBe(true);
    expect(s.pinLength).toBe(4);
    expect(s.salt).toBe('80'.repeat(16));
    expect(s.pinHash).toBe(hashPin('1234', s.salt!));
    expect(s.pinHash).not.toContain('1234');
  });

  it('locks and unlocks only with the right PIN', () => {
    usePinLockStore.getState().setPin('1234');

    usePinLockStore.getState().lock();
    expect(usePinLockStore.getState().unlocked).toBe(false);

    expect(usePinLockStore.getState().unlock('9999')).toBe(false);
    expect(usePinLockStore.getState().unlocked).toBe(false);

    expect(usePinLockStore.getState().unlock('1234')).toBe(true);
    expect(usePinLockStore.getState().unlocked).toBe(true);
  });

  it('removePin refuses a wrong PIN and clears everything on the right one', () => {
    usePinLockStore.getState().setPin('1234');
    const oldSalt = usePinLockStore.getState().salt;

    expect(usePinLockStore.getState().removePin('7777')).toBe(false);
    expect(usePinLockStore.getState().enabled).toBe(true);

    expect(usePinLockStore.getState().removePin('1234')).toBe(true);
    const s = usePinLockStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.pinHash).toBeNull();
    expect(s.salt).toBeNull();
    expect(s.pinLength).toBeNull();

    // A new PIN gets a fresh salt.
    usePinLockStore.getState().setPin('5678');
    expect(usePinLockStore.getState().enabled).toBe(true);
    expect(usePinLockStore.getState().salt).not.toBe(oldSalt);
    expect(usePinLockStore.getState().unlock('5678')).toBe(true);
    expect(usePinLockStore.getState().unlock('1234')).toBe(false);
  });

  it('persists the lock config but never the session flag, and rehydrates on a fresh launch', async () => {
    usePinLockStore.getState().setPin('1234');
    usePinLockStore.getState().lock();

    const raw = Storage.getItemSync('rafeeq.pinlock.v1');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(Object.keys(parsed.state).sort()).toEqual([
      'autoLockMinutes',
      'biometricEnabled',
      'enabled',
      'pinHash',
      'pinLength',
      'salt',
    ]);
    expect(parsed.state.unlocked).toBeUndefined();
    expect(raw).not.toContain('1234');

    // Simulate a fresh app launch: the JS context is gone but "disk" keeps the
    // config. setState writes through to storage, so restore the disk snapshot.
    // unlocked:false mirrors the store's initial default in a new context.
    usePinLockStore.setState({
      enabled: false,
      pinHash: null,
      salt: null,
      pinLength: null,
      biometricEnabled: false,
      autoLockMinutes: 0,
      unlocked: false,
    });
    Storage.setItemSync('rafeeq.pinlock.v1', raw!);
    await usePinLockStore.persist.rehydrate();
    const s = usePinLockStore.getState();
    expect(s.enabled).toBe(true);
    expect(s.unlocked).toBe(false); // session stays closed across launches
    expect(s.enabled && !s.unlocked).toBe(true); // → lock screen shows
  });

  it('gates the biometric shortcut behind both the lock and the user opt-in', () => {
    usePinLockStore.getState().setPin('1234');
    usePinLockStore.getState().lock();

    // Off by default: even with the lock on, no biometric unlock.
    expect(usePinLockStore.getState().unlockBiometric()).toBe(false);
    expect(usePinLockStore.getState().unlocked).toBe(false);

    usePinLockStore.getState().setBiometricEnabled(true);
    expect(usePinLockStore.getState().unlockBiometric()).toBe(true);
    expect(usePinLockStore.getState().unlocked).toBe(true);

    // The toggle is independent of the PIN: a wrong PIN still fails.
    usePinLockStore.getState().lock();
    expect(usePinLockStore.getState().unlock('9999')).toBe(false);
    expect(usePinLockStore.getState().unlocked).toBe(false);

    // Turning the lock off also kills the shortcut (no PIN → nothing to unlock).
    usePinLockStore.getState().lock();
    expect(usePinLockStore.getState().removePin('1234')).toBe(true);
    expect(usePinLockStore.getState().unlockBiometric()).toBe(false);
  });

  it('persists the biometric opt-in across a fresh launch', async () => {
    usePinLockStore.getState().setPin('1234');
    usePinLockStore.getState().setBiometricEnabled(true);
    const raw = Storage.getItemSync('rafeeq.pinlock.v1')!;

    usePinLockStore.setState({
      enabled: false,
      pinHash: null,
      salt: null,
      pinLength: null,
      biometricEnabled: false,
      unlocked: false,
    });
    Storage.setItemSync('rafeeq.pinlock.v1', raw);
    await usePinLockStore.persist.rehydrate();
    const s = usePinLockStore.getState();
    expect(s.enabled).toBe(true);
    expect(s.biometricEnabled).toBe(true);
    expect(s.unlockBiometric()).toBe(true);
    expect(usePinLockStore.getState().unlocked).toBe(true);
  });

  it('keeps the auto-lock grace window as a persisted preference', async () => {
    expect(usePinLockStore.getState().autoLockMinutes).toBe(0); // strict by default

    usePinLockStore.getState().setAutoLockMinutes(5);
    expect(usePinLockStore.getState().autoLockMinutes).toBe(5);
    const raw = Storage.getItemSync('rafeeq.pinlock.v1')!;
    expect(JSON.parse(raw).state.autoLockMinutes).toBe(5);

    // Survives a fresh launch: wipe the context defaults, restore the disk.
    usePinLockStore.setState({ autoLockMinutes: 0 });
    Storage.setItemSync('rafeeq.pinlock.v1', raw);
    await usePinLockStore.persist.rehydrate();
    expect(usePinLockStore.getState().autoLockMinutes).toBe(5);
  });
});
