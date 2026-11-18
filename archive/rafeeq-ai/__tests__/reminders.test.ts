// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  REMINDER_MAX_HORIZON_MS,
  REMINDER_MIN_LEAD_MS,
  dueReminders,
  normalizeRemindAt,
  reminderPresets,
  upcomingReminders,
} from '../src/utils/reminders';

const NOW = new Date(2026, 10, 5, 14, 30, 0, 0).getTime(); // Friday, 2:30 PM local

describe('normalizeRemindAt', () => {
  it.each([
    ['null stays null', null, null],
    ['undefined stays null', undefined, null],
    ['NaN collapses to none', Number.NaN, null],
    ['Infinity collapses to none', Number.POSITIVE_INFINITY, null],
    ['a past stamp collapses to none', NOW - 5_000, null],
    ['below the minimum lead collapses to none', NOW + REMINDER_MIN_LEAD_MS - 1, null],
    ['beyond the horizon collapses to none', NOW + REMINDER_MAX_HORIZON_MS + 1, null],
  ])('%s', (_name, raw, expected) => {
    expect(normalizeRemindAt(raw as number | null | undefined, NOW)).toBe(expected);
  });

  it.each([
    ['exactly at the minimum lead', NOW + REMINDER_MIN_LEAD_MS],
    ['an hour ahead', NOW + 3_600_000],
    ['exactly at the horizon', NOW + REMINDER_MAX_HORIZON_MS],
  ])('accepts a stamp %s', (_name, raw) => {
    expect(normalizeRemindAt(raw, NOW)).toBe(raw);
  });
});

describe('reminderPresets', () => {
  const presets = reminderPresets(NOW);
  const byKey = new Map(presets.map((p) => [p.key, p.at]));

  it('offers the three choices in a fixed order', () => {
    expect(presets.map((p) => p.key)).toEqual(['inHour', 'tomorrow', 'nextWeek']);
  });

  it('lands one hour ahead exactly', () => {
    expect(byKey.get('inHour')).toBe(NOW + 3_600_000);
  });

  it.each([
    ['tomorrow', 1],
    ['nextWeek', 7],
  ])('lands %s on 09:00 local time, strictly in the future', (_name, days) => {
    const at = byKey.get(_name as 'tomorrow' | 'nextWeek')!;
    expect(at).toBeGreaterThan(NOW);
    const d = new Date(at);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    const expectedDay = new Date(NOW);
    expectedDay.setDate(expectedDay.getDate() + days);
    expect(d.getDate()).toBe(expectedDay.getDate());
    expect(d.getMonth()).toBe(expectedDay.getMonth());
  });

  it('builds strictly future presets even late at night', () => {
    const late = new Date(2026, 10, 5, 23, 59, 0, 0).getTime();
    for (const p of reminderPresets(late)) {
      expect(p.at).toBeGreaterThan(late);
      expect(normalizeRemindAt(p.at, late)).toBe(p.at);
    }
  });
});

const item = (remindAt: number | null | undefined, extra: { deletedAt?: number | null } = {}) => ({
  remindAt,
  deletedAt: (extra.deletedAt ?? null) as number | null | undefined,
});

describe('dueReminders', () => {
  const list = [
    item(NOW + 1_000), // future → not due
    item(NOW - 3_600_000), // overdue by an hour
    item(NOW), // boundary stamp counts as due
    item(null),
    item(undefined),
    item(NOW - 7_200_000, { deletedAt: NOW - 100 }), // trashed → hidden
    item(NOW - 100), // barely overdue
  ];

  it('returns only alive conversations whose stamp is at or before now, most overdue first', () => {
    expect(dueReminders(list, NOW).map((c) => c.remindAt)).toEqual([NOW - 3_600_000, NOW - 100, NOW]);
  });

  it('excludes trashed conversations from the result entirely', () => {
    expect(dueReminders(list, NOW)).toHaveLength(3);
    expect(dueReminders(list, NOW).every((c) => !c.deletedAt)).toBe(true);
  });

  it('returns an empty list when nothing is scheduled', () => {
    expect(dueReminders([item(null), item(undefined)], NOW)).toEqual([]);
  });

  it('keeps archived conversations visible to reminders', () => {
    const archived = { remindAt: NOW - 100, deletedAt: null, archived: true };
    expect(dueReminders([archived], NOW)).toHaveLength(1);
  });
});

describe('upcomingReminders', () => {
  it('lists future reminders soonest first and stops at the due boundary', () => {
    const list = [item(NOW + 7_200_000), item(NOW + 3_600_000), item(NOW), item(NOW + 60_000)];
    expect(upcomingReminders(list, NOW).map((c) => c.remindAt)).toEqual([NOW + 60_000, NOW + 3_600_000, NOW + 7_200_000]);
  });

  it('never lists trashed conversations', () => {
    const list = [item(NOW + 3_600_000, { deletedAt: NOW })];
    expect(upcomingReminders(list, NOW)).toEqual([]);
  });
});
