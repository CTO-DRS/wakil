// Copyright (c) 2026 DRS AI. All rights reserved.
import { registerPrayerTools } from '../src/agent/tools/prayer';
import { ToolRegistry } from '../src/agent/registry';
import { useRemindersStore } from '../src/agent/reminders';
import type { AgentReminderIO } from '../src/agent/reminders';
import type { ToolContext } from '../src/agent/types';

const RIYADH_NOW = new Date(Date.UTC(2026, 10, 8, 9, 0, 0)); // 2026-11-08 12:00 Riyadh

const ctx: ToolContext = {
  locale: 'ar',
  now: () => RIYADH_NOW,
  model: null,
};

function makeFakeIO(overrides: Partial<AgentReminderIO> = {}): AgentReminderIO & { scheduled: { when: Date; title: string }[]; cancelled: string[] } {
  let next = 0;
  const scheduled: { when: Date; title: string }[] = [];
  const cancelled: string[] = [];
  return {
    scheduled,
    cancelled,
    requestPermissions: async () => true,
    scheduleOneshot: async (when, title) => {
      scheduled.push({ when, title });
      next += 1;
      return `nid_${next}`;
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    ...overrides,
  } as AgentReminderIO & { scheduled: { when: Date; title: string }[]; cancelled: string[] };
}

beforeEach(() => {
  useRemindersStore.getState().reminders.forEach((r) => useRemindersStore.getState().removeReminder(r.id));
});

describe('prayer.times tool', () => {
  it('computes today Riyadh times offline and mentions the convention', async () => {
    const registry = registerPrayerTools(new ToolRegistry(), { now: () => RIYADH_NOW });
    const result = await registry.get('prayer.times')!.run({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('الرياض');
    expect(result.data).toContain('الفجر: 04:44');
    expect(result.data).toContain('العشاء: 18:39');
    expect(result.data).toContain('أم القرى');
  });

  it('uses the device fix when the location dep provides one', async () => {
    const registry = registerPrayerTools(new ToolRegistry(), {
      now: () => RIYADH_NOW,
      getLocation: async () => ({ lat: 21.3891, lng: 39.8579 }), // Makkah
    });
    const result = await registry.get('prayer.times')!.run({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('موقعك الحالي');
  });

  it('falls back to the city chain when the fix is unavailable', async () => {
    const registry = registerPrayerTools(new ToolRegistry(), {
      now: () => RIYADH_NOW,
      getLocation: async () => null,
    });
    const result = await registry.get('prayer.times')!.run({ city: 'jeddah' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('جدة');
  });

  it('supports tomorrow through day_offset', async () => {
    const registry = registerPrayerTools(new ToolRegistry(), { now: () => RIYADH_NOW });
    const result = await registry.get('prayer.times')!.run({ day_offset: 1 }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('بعد 1 يوم');
  });
});

describe('prayer.reminders_set tool', () => {
  it('schedules the next five prayers, persists them and reports the list', async () => {
    const io = makeFakeIO();
    const registry = registerPrayerTools(new ToolRegistry(), { now: () => RIYADH_NOW, reminderIO: io });
    const result = await registry.get('prayer.reminders_set')!.run({}, ctx);
    expect(result.ok).toBe(true);
    expect(io.scheduled).toHaveLength(5);
    expect(io.scheduled[0].title).toContain('العصر');
    expect(io.scheduled[1].title).toContain('المغرب');
    expect(io.scheduled[2].title).toContain('العشاء');
    expect(useRemindersStore.getState().getReminders()).toHaveLength(5);
    expect(result.data).toContain('سجّلت 5');
  });

  it('replaces the previous prayer reminders instead of stacking', async () => {
    const io = makeFakeIO();
    const registry = registerPrayerTools(new ToolRegistry(), { now: () => RIYADH_NOW, reminderIO: io });
    await registry.get('prayer.reminders_set')!.run({}, ctx);
    const firstIds = useRemindersStore.getState().getReminders().map((r) => r.id);
    await registry.get('prayer.reminders_set')!.run({}, ctx);
    expect(io.cancelled).toEqual(firstIds);
    expect(useRemindersStore.getState().getReminders()).toHaveLength(5);
    expect(io.scheduled).toHaveLength(10);
  });

  it('reports denied notification permissions honestly', async () => {
    const io = makeFakeIO({ requestPermissions: async () => false });
    const registry = registerPrayerTools(new ToolRegistry(), { now: () => RIYADH_NOW, reminderIO: io });
    const result = await registry.get('prayer.reminders_set')!.run({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('فعّل إشعارات');
    expect(useRemindersStore.getState().getReminders()).toHaveLength(0);
  });

  it('works in English too', async () => {
    const io = makeFakeIO();
    const registry = registerPrayerTools(new ToolRegistry(), { now: () => RIYADH_NOW, reminderIO: io });
    const result = await registry.get('prayer.reminders_set')!.run({}, { ...ctx, locale: 'en' });
    expect(result.ok).toBe(true);
    expect(io.scheduled[0].title).toContain('Asr');
    expect(result.data).toContain('Scheduled 5');
  });
});
