// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The morning briefing — the agent's answer to «وش عندي اليوم؟» before it is
 * even asked: today's calendar events, today's reminders (overdue first),
 * the remaining prayer times and the open todos, composed offline from local
 * data only. Pure composition: callers hand in already-fetched records and a
 * clock; the same function feeds the `briefing.today` tool observation, the
 * spoken read-aloud (TTS) and the tests.
 */

import { PRAYER_NAMES_AR, PRAYER_NAMES_EN, formatPrayerClock, type PrayerKey } from './prayer';

export interface BriefingEvent {
  title: string;
  startMs: number;
  endMs: number | null;
}

export interface BriefingReminder {
  title: string;
  whenMs: number;
}

export interface BriefingTodo {
  title: string;
  done: boolean;
  dueMs: number | null;
}

export interface BriefingPrayer {
  key: PrayerKey;
  when: Date;
}

export interface BriefingInput {
  now: Date;
  locale: 'ar' | 'en';
  events: readonly BriefingEvent[];
  reminders: readonly BriefingReminder[];
  prayers: readonly BriefingPrayer[];
  todos: readonly BriefingTodo[];
  /**
   * The timezone the prayer times are computed in (hours offset). Prayer
   * Dates are tz-encoded (see prayer.ts), so rendering and day-labels must
   * shift by this — defaults to the device's own offset when the caller
   * omits it (plain local-Date prayers).
   */
  prayerTz?: number;
}

export type BriefingSectionId = 'events' | 'reminders' | 'prayers' | 'todos';

export interface BriefingSection {
  id: BriefingSectionId;
  lines: string[];
}

export interface Briefing {
  text: string;
  sections: BriefingSection[];
  /** True when at least one of events/reminders/todos has a line (prayers always exist). */
  hasContent: boolean;
}

/** True when two moments fall on the same LOCAL day. */
export function sameLocalDay(a: Date | number, b: Date): boolean {
  const da = a instanceof Date ? a : new Date(a);
  return (
    da.getFullYear() === b.getFullYear() && da.getMonth() === b.getMonth() && da.getDate() === b.getDate()
  );
}

/** True when two moments share a day in the tz-shifted (prayer) frame. */
function sameWallDay(a: Date, b: Date, tz: number): boolean {
  const da = new Date(a.getTime() + tz * 3_600_000);
  const db = new Date(b.getTime() + tz * 3_600_000);
  return da.getUTCFullYear() === db.getUTCFullYear() && da.getUTCMonth() === db.getUTCMonth() && da.getUTCDate() === db.getUTCDate();
}

/** Local 24-hour `HH:MM`. */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function startOfLocalDay(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(base: Date): number {
  const d = startOfLocalDay(base);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

const SECTION_TITLES_AR: Record<BriefingSectionId, string> = {
  events: 'الأحداث',
  reminders: 'التذكيرات',
  prayers: 'مواقيت الصلاة',
  todos: 'المهام',
};
const SECTION_TITLES_EN: Record<BriefingSectionId, string> = {
  events: 'Events',
  reminders: 'Reminders',
  prayers: 'Prayer times',
  todos: 'Tasks',
};

/** All-day heuristic: starts at local midnight with no end time. */
function isAllDay(event: BriefingEvent, now: Date): boolean {
  return event.endMs === null && sameLocalDay(event.startMs, now) && formatClock(new Date(event.startMs)) === '00:00';
}

function todoGroup(todo: BriefingTodo, nowMs: number, endOfDayMs: number): 0 | 1 | 2 {
  if (todo.dueMs === null) return 2;
  if (todo.dueMs < nowMs) return 0;
  if (todo.dueMs < endOfDayMs) return 1;
  return 2;
}

/**
 * Composes the briefing. Deterministic: same inputs, same text. Events and
 * reminders are filtered to today (overdue reminders and overdue tasks stay
 * visible — an agent that hides lateness is lying politely).
 */
export function composeBriefing(input: BriefingInput): Briefing {
  const { now, locale } = input;
  const ar = locale === 'ar';
  const nowMs = now.getTime();
  const endOfDayMs = endOfLocalDay(now);

  const events = input.events
    .filter((e) => sameLocalDay(e.startMs, now))
    .sort((a, b) => a.startMs - b.startMs)
    .map((e) => (isAllDay(e, now) ? (ar ? `${e.title} — طوال اليوم` : `${e.title} — all day`) : `${formatClock(new Date(e.startMs))} — ${e.title}`));

  const reminders = input.reminders
    .filter((r) => r.whenMs < endOfDayMs)
    .sort((a, b) => a.whenMs - b.whenMs)
    .map((r) => (r.whenMs < nowMs ? (ar ? `${r.title} — متأخر` : `${r.title} — overdue`) : `${r.title} — ${formatClock(new Date(r.whenMs))}`));

  const prayers = input.prayers.map((p) => {
    const tz = input.prayerTz ?? -now.getTimezoneOffset() / 60;
    const tomorrow = !sameWallDay(p.when, now, tz);
    const tomorrowLabel = ar ? 'غدًا ' : 'tomorrow ';
    const name = ar ? PRAYER_NAMES_AR[p.key] : PRAYER_NAMES_EN[p.key];
    return `${tomorrow ? tomorrowLabel : ''}${name} — ${formatPrayerClock(p.when, tz)}`;
  });

  const openTodos = input.todos.filter((t) => !t.done);
  const todos = openTodos
    .map((t, index) => ({ t, index }))
    .sort((a, b) => {
      const groupA = todoGroup(a.t, nowMs, endOfDayMs);
      const groupB = todoGroup(b.t, nowMs, endOfDayMs);
      if (groupA !== groupB) return groupA - groupB;
      if (a.t.dueMs !== null && b.t.dueMs !== null) return a.t.dueMs - b.t.dueMs;
      // Inside the no-due-date group: undated tasks before future-dated ones.
      const aUndated = a.t.dueMs === null ? 0 : 1;
      const bUndated = b.t.dueMs === null ? 0 : 1;
      if (aUndated !== bUndated) return aUndated - bUndated;
      return a.index - b.index;
    })
    .slice(0, 5)
    .map(({ t }) => {
      if (t.dueMs === null) return t.title;
      if (t.dueMs < nowMs) return ar ? `${t.title} — متأخرة` : `${t.title} — overdue`;
      if (t.dueMs < endOfDayMs) return ar ? `${t.title} — اليوم ${formatClock(new Date(t.dueMs))}` : `${t.title} — today ${formatClock(new Date(t.dueMs))}`;
      return ar ? `${t.title} — لاحقًا` : `${t.title} — later`;
    });

  const hasContent = events.length > 0 || reminders.length > 0 || todos.length > 0;
  const titles = ar ? SECTION_TITLES_AR : SECTION_TITLES_EN;
  const sections: BriefingSection[] = [];
  if (events.length > 0) sections.push({ id: 'events', lines: events });
  if (reminders.length > 0) sections.push({ id: 'reminders', lines: reminders });
  if (prayers.length > 0) sections.push({ id: 'prayers', lines: prayers });
  if (todos.length > 0) sections.push({ id: 'todos', lines: todos });

  const header = hasContent
    ? ar
      ? 'هذا ملخص يومك:'
      : 'Here is your day:'
    : ar
      ? 'ما فيه أحداث أو مهام لليوم — يوم هادئ.'
      : 'No events or tasks for today — a quiet day.';
  const body = sections.map((s) => `${titles[s.id]}:\n${s.lines.map((l) => `• ${l}`).join('\n')}`).join('\n\n');
  return { text: `${header}${body ? `\n\n${body}` : ''}`, sections, hasContent };
}

/** The speaker-friendly form: sections joined as natural sentences for TTS. */
export function briefingForSpeech(briefing: Briefing, locale: 'ar' | 'en'): string {
  const ar = locale === 'ar';
  if (!briefing.hasContent) {
    return ar
      ? 'ما عندك شيء مجدول اليوم. يوم هادئ.'
      : 'You have nothing scheduled today. A quiet day.';
  }
  const lead = ar ? 'ملخص يومك:' : 'Your day:';
  const parts = briefing.sections.map((s) => `${ar ? SECTION_TITLES_AR[s.id] : SECTION_TITLES_EN[s.id]}: ${s.lines.join('، ')}`);
  return `${lead} ${parts.join('. ')}.`;
}
