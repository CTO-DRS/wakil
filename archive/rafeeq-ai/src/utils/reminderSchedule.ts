// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * The shared reminder plumbing (moved out of the game module when the
 * arcade was retired): the pure time-key rules and the sync flow that
 * keeps one scheduled local notification alive — used by the briefing,
 * the backup nudge and the trial-diary reminders alike. Storage-free and
 * React-free — the platform scheduler rides in through the injectable
 * `ReminderIO`, so the whole flow is testable without native modules.
 */

/** A wall-clock time of day, 24-hour. */
export type ReminderTime = { readonly hour: number; readonly minute: number };

export const REMINDER_HOUR_MIN = 0;
export const REMINDER_HOUR_MAX = 23;
/** Five-minute steps keep the picker brisk. */
export const REMINDER_MINUTE_MAX = 59;

/** Clamps a raw hour/minute pair into the valid 24-hour range. */
export function clampReminderTime(hour: number, minute: number): ReminderTime {
  const h = Number.isFinite(hour) ? Math.min(REMINDER_HOUR_MAX, Math.max(REMINDER_HOUR_MIN, Math.floor(hour))) : 20;
  const m = Number.isFinite(minute) ? Math.min(REMINDER_MINUTE_MAX, Math.max(0, Math.floor(minute))) : 0;
  return { hour: h, minute: m };
}

/** Zero-padded `HH:MM` key, the persisted form. */
export function formatTimeKey(hour: number, minute: number): string {
  const t = clampReminderTime(hour, minute);
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/** Parses a `HH:MM` key; null when the shape or range is off. */
export function parseTimeKey(value: string): ReminderTime | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (hour < REMINDER_HOUR_MIN || hour > REMINDER_HOUR_MAX || minute < 0 || minute > REMINDER_MINUTE_MAX) return null;
  return { hour, minute };
}

/** Parses with a fallback, so a corrupted saved key can never break the sync. */
export function normalizeTimeKey(value: unknown, fallback = '20:00'): string {
  const parsed = typeof value === 'string' ? parseTimeKey(value) : null;
  return parsed ? formatTimeKey(parsed.hour, parsed.minute) : normalizeTimeKey(fallback);
}

/** The platform side of the reminder: permissions, one daily trigger, cancel. */
export type ReminderIO = {
  requestPermissions?: () => Promise<boolean>;
  /** A non-prompting permission check — for automatic syncs. */
  checkPermissions?: () => Promise<boolean>;
  /** One repeating daily trigger at the given wall-clock time. */
  scheduleDaily?: (hour: number, minute: number) => Promise<string>;
  /** One-shot trigger at an exact moment — the mute mode's carrier. */
  scheduleOneshot?: (when: Date) => Promise<string>;
  cancel?: (id: string) => Promise<void>;
};

export type ReminderSyncResult = {
  /** The scheduled notification id, or null when nothing is scheduled. */
  id: string | null;
};

/**
 * Reconciles the scheduled notification with the settings: disabled (or an
 * unreadable time, or denied permission) cancels the old one and schedules
 * nothing; enabled cancels the old one first so time changes never duplicate.
 */
export async function syncDailyReminder(
  enabled: boolean,
  timeKey: string,
  scheduledId: string | null,
  io: ReminderIO = {},
): Promise<ReminderSyncResult> {
  const cancel = io.cancel ?? (async () => {});
  if (scheduledId) {
    try {
      await cancel(scheduledId);
    } catch {
      // A stale id that no longer exists is not a failure.
    }
  }
  if (!enabled) return { id: null };
  const time = parseTimeKey(timeKey);
  if (!time) return { id: null };
  const requestPermissions = io.requestPermissions ?? (async () => true);
  const ok = await requestPermissions().catch(() => false);
  if (!ok) return { id: null };
  const scheduleDaily = io.scheduleDaily;
  if (!scheduleDaily) return { id: null };
  try {
    const id = await scheduleDaily(time.hour, time.minute);
    return { id: typeof id === 'string' && id.length > 0 ? id : null };
  } catch {
    return { id: null };
  }
}
