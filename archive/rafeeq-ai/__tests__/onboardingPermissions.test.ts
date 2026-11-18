// Copyright (c) 2026 DRS AI. All rights reserved.
import { PERMISSIONS, PERMISSION_ORDER, CORE_PERMISSION_IDS, TOOL_PERMISSION_IDS, permissionEntry, readAllPermissionStates } from '../src/onboarding/permissions';
import { resources } from '../src/i18n';

describe('permissions registry integrity', () => {
  it('lists exactly the real permission set in a stable order', () => {
    expect(PERMISSION_ORDER).toEqual([
      'notifications',
      'microphone',
      'location',
      'biometric',
      'contacts',
      'calendar',
      'callPhone',
      'dndPolicy',
      'writeSettings',
    ]);
  });

  it('splits into the onboarding core and the tool-driven center set', () => {
    expect(CORE_PERMISSION_IDS).toHaveLength(4);
    expect(TOOL_PERMISSION_IDS).toHaveLength(5);
    expect([...CORE_PERMISSION_IDS, ...TOOL_PERMISSION_IDS]).toEqual(PERMISSION_ORDER);
    for (const p of PERMISSIONS) {
      expect(p.core).toBe(CORE_PERMISSION_IDS.includes(p.id));
    }
  });

  it('carries bilingual copy for every permission (name, why, feature)', () => {
    for (const p of PERMISSIONS) {
      for (const lang of ['ar', 'en'] as const) {
        const dict = resources[lang].translation as unknown as Record<string, any>;
        const item = dict.permissions.item as Record<string, Record<string, string>>;
        expect(item[p.id].name.trim()).not.toBe('');
        expect(item[p.id].why.trim()).not.toBe('');
        expect(item[p.id].feature.trim()).not.toBe('');
      }
    }
  });

  it('special-access permissions have no runtime request — they open their page', () => {
    expect(permissionEntry('dndPolicy')?.io.request).toBeNull();
    expect(permissionEntry('writeSettings')?.io.request).toBeNull();
    expect(permissionEntry('biometric')?.io.request).toBeNull();
    expect(permissionEntry('notifications')?.io.request).not.toBeNull();
    expect(permissionEntry('microphone')?.io.request).not.toBeNull();
  });

  it('has bilingual copy for every PermissionState chip (the UI interpolates by state)', () => {
    const states = ['granted', 'denied', 'blocked', 'unavailable', 'special'] as const;
    for (const lang of ['ar', 'en'] as const) {
      const dict = resources[lang].translation as unknown as Record<string, any>;
      for (const state of states) {
        expect(typeof dict.permissions.state[state]).toBe('string');
        expect(dict.permissions.state[state].length).toBeGreaterThan(2);
      }
    }
  });
});

describe('readAllPermissionStates', () => {
  it('never throws: a failing check degrades to denied', async () => {
    // The real registry IO is not executed in node; patch one entry to blow up.
    const entry = permissionEntry('notifications')!;
    const original = entry.io.check;
    entry.io.check = async () => {
      throw new Error('native module missing');
    };
    const states = await readAllPermissionStates(['notifications', 'microphone']);
    entry.io.check = original;
    expect(states.notifications).toBe('denied');
  });

  it('maps check results through unchanged', async () => {
    const entry = permissionEntry('notifications')!;
    const original = entry.io.check;
    entry.io.check = async () => 'granted';
    const states = await readAllPermissionStates(['notifications']);
    entry.io.check = original;
    expect(states.notifications).toBe('granted');
  });
});
