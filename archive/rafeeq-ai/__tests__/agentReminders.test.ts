// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  REMINDERS_CAP,
  capReminders,
  normalizeReminderText,
  scheduleReminderBatch,
  summarizeReminders,
  useRemindersStore,
  type AgentReminderIO,
  type AgentReminderRecord,
} from '../src/agent/reminders';
import { registerReminderTools } from '../src/agent/tools/reminders';
import { ToolRegistry } from '../src/agent/registry';
import { requiresConfirmation } from '../src/agent/confirmation';
import type { ToolContext } from '../src/agent/types';

const NOW = new Date(2026, 10, 8, 12, 0, 0);

const ctx: ToolContext = {
  locale: 'ar',
  now: () => NOW,
  model: null,
};

function makeFakeIO(overrides: Partial<AgentReminderIO> = {}): AgentReminderIO & { scheduled: { when: Date; title: string; body: string }[]; cancelled: string[] } {
  let next = 0;
  const scheduled: { when: Date; title: string; body: string }[] = [];
  const cancelled: string[] = [];
  return {
    scheduled,
    cancelled,
    requestPermissions: async () => true,
    scheduleOneshot: async (when, title, body) => {
      scheduled.push({ when, title, body });
      next += 1;
      return `nid_${next}`;
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    ...overrides,
  } as AgentReminderIO & { scheduled: { when: Date; title: string; body: string }[]; cancelled: string[] };
}

function resetStore() {
  useRemindersStore.setState({ reminders: [] });
}

beforeEach(resetStore);

describe('normalizeReminderText', () => {
  it.each([
    { name: 'a plain title passes', title: 'أتصل على أبوي', body: undefined, ok: true },
    { name: 'an empty title fails', title: '  ', body: undefined, ok: false },
    { name: 'a non-string title fails', title: 7, body: undefined, ok: false },
    { name: 'a non-string body fails', title: 'مهم', body: 9, ok: false },
  ])('$name', ({ title, body, ok }) => {
    expect(normalizeReminderText(title, body).ok).toBe(ok);
  });
});

describe('capReminders and summarizeReminders', () => {
  it('sorts soonest first and caps the shelf', () => {
    const records: AgentReminderRecord[] = [
      { id: 'a', title: 'أ', body: '', whenMs: 3000, tag: 'user' },
      { id: 'b', title: 'ب', body: '', whenMs: 1000, tag: 'user' },
      { id: 'c', title: 'ج', body: '', whenMs: 2000, tag: 'user' },
    ];
    const capped = capReminders([...records, ...Array.from({ length: REMINDERS_CAP }, (_, i) => ({ id: `x${i}`, title: `x${i}`, body: '', whenMs: 5000 + i, tag: 'user' as const }))]);
    expect(capped).toHaveLength(REMINDERS_CAP);
    expect(capped[0].id).toBe('b');
  });

  it('renders pending reminders with ids and hides past ones', () => {
    const text = summarizeReminders(
      [
        { id: 'n1', title: 'أتصل على أبوي', body: 'مهم', whenMs: Date.now() + 60_000, tag: 'user' },
        { id: 'n0', title: 'قديم', body: '', whenMs: Date.now() - 60_000, tag: 'user' },
      ],
      'ar',
    );
    expect(text).toContain('[n1] أتصل على أبوي');
    expect(text).not.toContain('قديم');
  });
});

describe('scheduleReminderBatch', () => {
  it('schedules every entry and returns the ids in order', async () => {
    const io = makeFakeIO();
    const result = await scheduleReminderBatch(
      [
        { id: 'u1', title: 'أول', body: '', when: new Date(NOW.getTime() + 60_000), tag: 'user' },
        { id: 'u2', title: 'ثانٍ', body: '', when: new Date(NOW.getTime() + 120_000), tag: 'user' },
      ],
      io,
    );
    expect(result.ok).toBe(true);
    expect(result.ids).toEqual(['nid_1', 'nid_2']);
    expect(io.scheduled[0].title).toBe('أول');
  });

  it('refuses the whole batch when notifications are not allowed', async () => {
    const io = makeFakeIO({ requestPermissions: async () => false });
    const result = await scheduleReminderBatch(
      [{ id: 'u1', title: 'أول', body: '', when: new Date(NOW.getTime() + 60_000), tag: 'user' }],
      io,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('REMINDER_PERMISSION_DENIED');
    expect(io.scheduled).toHaveLength(0);
  });

  it('keeps scheduling after one failure', async () => {
    let first = true;
    const io = makeFakeIO({
      scheduleOneshot: async (when, title) => {
        if (first) {
          first = false;
          throw new Error('boom');
        }
        return 'nid_ok';
      },
    });
    const result = await scheduleReminderBatch(
      [
        { id: 'u1', title: 'أول', body: '', when: new Date(NOW.getTime() + 60_000), tag: 'user' },
        { id: 'u2', title: 'ثانٍ', body: '', when: new Date(NOW.getTime() + 120_000), tag: 'user' },
      ],
      io,
    );
    expect(result.ids).toEqual(['nid_ok']);
  });
});

describe('reminder tools', () => {
  it('reminders.create schedules from an ISO time and lands in the shelf', async () => {
    const io = makeFakeIO();
    const registry = registerReminderTools(new ToolRegistry(), { now: () => NOW, reminderIO: io });
    const result = await registry.get('reminders.create')!.run({ title: 'أتصل على أبوي بعد العصر', when_iso: '2026-11-08T18:30', body: 'مهم' }, ctx);
    expect(result.ok).toBe(true);
    expect(io.scheduled).toHaveLength(1);
    expect(io.scheduled[0].when.getHours()).toBe(18);
    expect(useRemindersStore.getState().getReminders()).toHaveLength(1);
    expect(result.data).toContain('أتصل على أبوي');
  });

  it('reminders.create accepts minutes-from-now too', async () => {
    const io = makeFakeIO();
    const registry = registerReminderTools(new ToolRegistry(), { now: () => NOW, reminderIO: io });
    const result = await registry.get('reminders.create')!.run({ title: 'مؤقت الشاي', in_minutes: 15 }, ctx);
    expect(result.ok).toBe(true);
    expect(io.scheduled[0].when.getTime() - NOW.getTime()).toBe(15 * 60_000);
  });

  it('reminders.create explains exactly what is wrong with the time', async () => {
    const io = makeFakeIO();
    const registry = registerReminderTools(new ToolRegistry(), { now: () => NOW, reminderIO: io });
    expect((await registry.get('reminders.create')!.run({ title: 'x' }, ctx)).error).toContain('ينقص الوقت');
    expect((await registry.get('reminders.create')!.run({ title: 'x', when_iso: '2026-11-01T09:00' }, ctx)).error).toContain('مضى');
    expect((await registry.get('reminders.create')!.run({ title: 'x', when_iso: '2026-11-09T09:00', in_minutes: 5 }, ctx)).error).toContain('واحدًا فقط');
    expect((await registry.get('reminders.create')!.run({ title: 'x', when_iso: 'بعد العصر' }, ctx)).error).toContain('غير مفهومة');
    expect(io.scheduled).toHaveLength(0);
  });

  it('reminders.create reports denied permissions without storing anything', async () => {
    const io = makeFakeIO({ requestPermissions: async () => false });
    const registry = registerReminderTools(new ToolRegistry(), { now: () => NOW, reminderIO: io });
    const result = await registry.get('reminders.create')!.run({ title: 'مهم', in_minutes: 10 }, ctx);
    expect(result.ok).toBe(false);
    expect(useRemindersStore.getState().getReminders()).toHaveLength(0);
  });

  it('reminders.list renders the shelf', async () => {
    const io = makeFakeIO();
    const registry = registerReminderTools(new ToolRegistry(), { now: () => NOW, reminderIO: io });
    await registry.get('reminders.create')!.run({ title: 'دواء', in_minutes: 60 }, ctx);
    const result = await registry.get('reminders.list')!.run({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('دواء');
  });

  it('reminders.cancel cancels the notification and clears the shelf entry', async () => {
    const io = makeFakeIO();
    const registry = registerReminderTools(new ToolRegistry(), { now: () => NOW, reminderIO: io });
    await registry.get('reminders.create')!.run({ title: 'دواء', in_minutes: 60 }, ctx);
    const id = useRemindersStore.getState().getReminders()[0].id;
    const result = await registry.get('reminders.cancel')!.run({ id }, ctx);
    expect(result.ok).toBe(true);
    expect(io.cancelled).toEqual([id]);
    expect(useRemindersStore.getState().getReminders()).toHaveLength(0);
  });

  it('reminders.cancel rejects unknown ids', async () => {
    const io = makeFakeIO();
    const registry = registerReminderTools(new ToolRegistry(), { now: () => NOW, reminderIO: io });
    const result = await registry.get('reminders.cancel')!.run({ id: 'nope' }, ctx);
    expect(result.ok).toBe(false);
    expect(io.cancelled).toHaveLength(0);
  });

  it('the mutating flags follow the confirmation policy', () => {
    const registry = registerReminderTools(new ToolRegistry());
    expect(requiresConfirmation(registry.get('reminders.create')!)).toBe(true);
    expect(requiresConfirmation(registry.get('reminders.list')!)).toBe(false);
    expect(requiresConfirmation(registry.get('reminders.cancel')!)).toBe(true);
  });
});
