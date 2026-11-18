// Copyright (c) 2026 DRS AI. All rights reserved.

/** Minimum lead time before a reminder may be scheduled: one minute. */
export const REMINDER_MIN_LEAD_MS = 60_000;

/** Reminders never reach further than a year ahead. */
export const REMINDER_MAX_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;

/** Local hour the day-based presets land on (09:00 in the device timezone). */
export const REMINDER_PRESET_HOUR = 9;

/** The scheduling choices offered in the conversation menu. */
export type ReminderPresetKey = 'inHour' | 'tomorrow' | 'nextWeek';

/**
 * Cleans a requested reminder time: non-finite values and anything closer than
 * the minimum lead (or beyond the horizon) collapse to null — "no reminder".
 * Pure so the store, the picker menu and the tests share one definition of a
 * schedulable time. Stamps from a restored backup are not normalized: a past
 * one simply surfaces as due immediately.
 */
export function normalizeRemindAt(raw: number | null | undefined, now: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < now + REMINDER_MIN_LEAD_MS) return null;
  if (raw > now + REMINDER_MAX_HORIZON_MS) return null;
  return raw;
}

/**
 * The three scheduling choices, computed from the current wall clock: in one
 * hour, tomorrow morning and a week out — both day-based ones at
 * REMINDER_PRESET_HOUR local time. Pure and strictly future by construction.
 */
export function reminderPresets(now: number): { key: ReminderPresetKey; at: number }[] {
  const base = new Date(now);
  return [
    { key: 'inHour', at: now + 60 * 60 * 1000 },
    {
      key: 'tomorrow',
      at: new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, REMINDER_PRESET_HOUR, 0, 0, 0).getTime(),
    },
    {
      key: 'nextWeek',
      at: new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7, REMINDER_PRESET_HOUR, 0, 0, 0).getTime(),
    },
  ];
}

/** A conversation shape the reminder queries need; everything else is irrelevant. */
type Remindable = { remindAt?: number | null; deletedAt?: number | null };

/**
 * Conversations whose reminder has come due, most overdue first. Trashed ones
 * never surface (their reminder returns if the conversation is restored);
 * archived ones do — resurfacing is the whole point of a reminder.
 */
export function dueReminders<T extends Remindable>(list: readonly T[], now: number): (T & { remindAt: number })[] {
  return list
    .filter((c): c is T & { remindAt: number } => !c.deletedAt && typeof c.remindAt === 'number' && c.remindAt <= now)
    .sort((a, b) => a.remindAt - b.remindAt);
}

/** Conversations with a reminder still ahead, soonest first. */
export function upcomingReminders<T extends Remindable>(list: readonly T[], now: number): (T & { remindAt: number })[] {
  return list
    .filter((c): c is T & { remindAt: number } => !c.deletedAt && typeof c.remindAt === 'number' && c.remindAt > now)
    .sort((a, b) => a.remindAt - b.remindAt);
}
