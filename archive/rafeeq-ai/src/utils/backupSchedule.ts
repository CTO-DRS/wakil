// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * The scheduled-backup reminder: once a full month has passed since the last
 * full export, one local notification nudges the user to export a fresh one —
 * and stays quiet for a cooldown week after each nudge so an ignored reminder
 * never stacks. The time rules here are pure; the platform scheduler rides in
 * through the same injectable `ReminderIO` the daily reminder uses, so the
 * flow is testable without native modules.
 */

import type { ReminderIO } from './reminderSchedule';

/** A full month, as thirty days — the stretch that turns an export stale. */
export const BACKUP_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** The one-shot fires an hour after a sync finds the backup overdue. */
export const BACKUP_REMINDER_DELAY_MS = 60 * 60 * 1000;

/** After one nudge, the next waits at least a week — never one per app start. */
export const BACKUP_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type BackupReminderInput = {
  readonly now: number;
  /** Epoch ms of the last full-backup export; null before the first one. */
  readonly lastBackupAt: number | null;
  /** Epoch ms the reminder last scheduled; null when it never did. */
  readonly remindedAt: number | null;
};

export type BackupReminderPlan = {
  /** A month has passed since the last full export. */
  readonly due: boolean;
  /** Due and past the cooldown — this sync should schedule the nudge. */
  readonly remind: boolean;
  /** Whole days since the last full export (null before the first one). */
  readonly daysSince: number | null;
};

/**
 * The reminder's decision: a month since the last full export makes the backup
 * due; the nudge itself only fires when the cooldown week has passed since the
 * previous one. A device that never exported a full backup has nothing anchored
 * to measure a month against, so it stays quiet — the first export starts the
 * clock.
 */
export function backupReminderPlan(input: BackupReminderInput): BackupReminderPlan {
  const daysSince =
    input.lastBackupAt !== null && Number.isFinite(input.lastBackupAt)
      ? Math.max(0, Math.floor((input.now - input.lastBackupAt) / 86_400_000))
      : null;
  const due = daysSince !== null && input.now - (input.lastBackupAt as number) >= BACKUP_MONTH_MS;
  const cooled =
    input.remindedAt === null || !Number.isFinite(input.remindedAt) || input.now - input.remindedAt >= BACKUP_REMINDER_COOLDOWN_MS;
  return { due, remind: due && cooled, daysSince };
}

export type BackupReminderSyncResult = {
  /** The scheduled notification id after the sync (null when nothing is scheduled). */
  readonly id: string | null;
  readonly plan: BackupReminderPlan;
};

/**
 * Schedules the monthly nudge when the plan calls for one: a non-prompting
 * permission check first (a denied notice just means the in-app hint carries
 * the message), then one one-shot an hour out. Anything else leaves whatever
 * is already scheduled untouched.
 */
export async function syncBackupReminder(
  enabled: boolean,
  input: BackupReminderInput,
  io: ReminderIO = {},
): Promise<BackupReminderSyncResult> {
  const plan = backupReminderPlan(input);
  if (!enabled || !plan.remind) return { id: null, plan };
  const allowed = io.checkPermissions ? await io.checkPermissions().catch(() => false) : true;
  if (!allowed) return { id: null, plan };
  const scheduleOneshot = io.scheduleOneshot;
  if (!scheduleOneshot) return { id: null, plan };
  try {
    const id = await scheduleOneshot(new Date(input.now + BACKUP_REMINDER_DELAY_MS));
    return { id: typeof id === 'string' && id.length > 0 ? id : null, plan };
  } catch {
    return { id: null, plan };
  }
}
