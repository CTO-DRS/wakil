// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Agent reminders — one-shot local notifications the user asks for ("ذكّرني
 * أتصل على أبوي بعد العصر"). The pure layer (resolve / plan / summarize)
 * never touches native code; the platform rides the injectable
 * `AgentReminderIO` (expo-notifications DATE triggers on device), so the
 * whole flow is table-driven testable.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';

export interface AgentReminderRecord {
  id: string;
  title: string;
  body: string;
  whenMs: number;
  /** Prayer reminders and user reminders share the shelf; tags mark the source. */
  tag: 'user' | 'prayer';
}

export const REMINDERS_STORAGE_KEY = 'rafeeq.agent.reminders.v1';
export const REMINDERS_CAP = 100;
export const REMINDER_TITLE_MAX = 160;
export const REMINDER_BODY_MAX = 400;

export type ReminderText = { ok: true; title: string; body: string } | { ok: false; error: string };

export function normalizeReminderText(title: unknown, body: unknown): ReminderText {
  if (typeof title !== 'string' || title.trim().length === 0) return { ok: false, error: 'REMINDER_TITLE_REQUIRED' };
  if (body !== undefined && body !== null && typeof body !== 'string') return { ok: false, error: 'REMINDER_BODY_TYPE' };
  const safeBody = typeof body === 'string' ? body.trim().slice(0, REMINDER_BODY_MAX) : '';
  return { ok: true, title: title.trim().slice(0, REMINDER_TITLE_MAX), body: safeBody };
}

/** Soonest first, capped. Pure. */
export function capReminders(records: readonly AgentReminderRecord[]): AgentReminderRecord[] {
  return [...records].sort((a, b) => a.whenMs - b.whenMs).slice(0, REMINDERS_CAP);
}

type RemindersState = {
  reminders: AgentReminderRecord[];
  addReminder: (record: AgentReminderRecord) => void;
  getReminders: () => AgentReminderRecord[];
  removeReminder: (id: string) => void;
};

/** KV-backed reminder shelf; the reminder tools read and write through it. */
export const useRemindersStore = create<RemindersState>()(
  persist(
    (set, get) => ({
      reminders: [],
      addReminder: (record) => set((s) => ({ reminders: capReminders([record, ...s.reminders]) })),
      getReminders: () => get().reminders,
      removeReminder: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),
    }),
    { name: REMINDERS_STORAGE_KEY, storage: createJSONStorage(() => kvStorage), version: 1 },
  ),
);

// ——— the platform side ————————————————————————————————————————————————

/** The platform side of an agent reminder: schedule one exact one-shot. */
export type AgentReminderIO = {
  requestPermissions?: () => Promise<boolean>;
  /** One-shot notification at an absolute moment. */
  scheduleOneshot: (when: Date, title: string, body: string) => Promise<string>;
  cancel: (id: string) => Promise<void>;
};

// ——— pure scheduling helpers ———————————————————————————————————————————

export type ScheduleResult = {
  ok: boolean;
  /** The notification ids actually scheduled (empty on permission failure). */
  ids: string[];
  error?: string;
};

/**
 * Cancels stale ids, then schedules each entry; a single scheduling failure
 * never aborts the rest. Records persist only when at least one schedule
 * succeeded — handled by the caller, which receives the ids in order.
 */
export async function scheduleReminderBatch(
  entries: readonly { id: string; title: string; body: string; when: Date; tag: 'user' | 'prayer' }[],
  io: AgentReminderIO,
): Promise<ScheduleResult> {
  const allowed = io.requestPermissions ? await io.requestPermissions().catch(() => false) : true;
  if (!allowed) return { ok: false, ids: [], error: 'REMINDER_PERMISSION_DENIED' };
  const ids: string[] = [];
  for (const entry of entries) {
    try {
      const id = await io.scheduleOneshot(entry.when, entry.title, entry.body);
      if (typeof id === 'string' && id.length > 0) ids.push(id);
    } catch {
      // One missed reminder beats a broken batch.
    }
  }
  return { ok: ids.length > 0 || entries.length === 0, ids };
}

/**
 * Renders the pending reminders as the tool's observation. The "upcoming"
 * filter runs on the injected clock (`nowMs`) — defaulting to the real one —
 * so a fixed-clock test (or an on-device clock skew) can never silently
 * empty the shelf. This was a wall-clock leak: the tool's own ctx.now()
 * existed, but this filter read the raw Date.now(), and the fixture suite
 * started failing the day the real calendar crossed the fixture date.
 */
export function summarizeReminders(
  records: readonly AgentReminderRecord[],
  locale: 'ar' | 'en',
  max = 10,
  nowMs: number = Date.now(),
): string {
  const pending = records.filter((r) => r.whenMs > nowMs);
  if (pending.length === 0) {
    return locale === 'ar' ? 'لا توجد تنبيهات قادمة.' : 'No upcoming reminders.';
  }
  return pending
    .slice(0, max)
    .map((r, i) => {
      const when = new Date(r.whenMs).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      const body = r.body ? ` — ${r.body}` : '';
      return `${i + 1}. [${r.id}] ${r.title}${body} (${when})`;
    })
    .join('\n');
}
