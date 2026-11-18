// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Proactive suggestions — the agent's local-data nudge chips: computed from
 * what is already on the phone (overdue tasks, an approaching prayer, today's
 * events), never from a server and never from a model. Each suggestion is a
 * ready goal the user can tap into the composer; the whole feature flips off
 * with one settings switch. Pure and table-driven testable.
 */

import { PRAYER_NAMES_AR, PRAYER_NAMES_EN, type PrayerKey } from './prayer';
import type { TodoRecord } from './todos';
import type { AgentReminderRecord } from './reminders';

export interface AgentSuggestion {
  /** Stable rule id (tests, dedupe, UI keys). */
  id: string;
  /** Arabic goal text, Saudi phrasing — what lands in the composer. */
  ar: string;
  en: string;
  priority: number;
}

export interface SuggestInput {
  now: Date;
  todos: readonly TodoRecord[];
  reminders: readonly AgentReminderRecord[];
  /** Upcoming prayers (key + time), or null when no location/city is known. */
  prayers: readonly { key: string; when: Date }[] | null;
  events: readonly { title: string; startMs: number }[];
}

/** A prayer within this window earns a chip. */
export const PRAYER_SOON_MINUTES = 30;

function isSameLocalDay(a: Date | number, b: Date): boolean {
  const da = a instanceof Date ? a : new Date(a);
  return da.getFullYear() === b.getFullYear() && da.getMonth() === b.getMonth() && da.getDate() === b.getDate();
}

const RULES = {
  overdueTodo: 20,
  prayerSoon: 18,
  eventsToday: 16,
  todosDueToday: 14,
  remindersToday: 12,
} as const;

/**
 * Computes the suggestion chips: priority-ordered, capped, deterministic.
 * `max` (default 3) keeps the bar brisk — a wall of nudges is spam, and the
 * agent must never feel like it nags.
 */
export function computeSuggestions(input: SuggestInput, opts: { max?: number } = {}): AgentSuggestion[] {
  const max = opts.max ?? 3;
  const { now } = input;
  const nowMs = now.getTime();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const endOfDayMs = endOfDay.getTime();

  const out: AgentSuggestion[] = [];

  // 1. Overdue open tasks — the most honest nudge.
  if (input.todos.some((t) => !t.done && t.dueMs !== null && t.dueMs < nowMs)) {
    out.push({
      id: 'overdue-todos',
      ar: 'أرني المهام المتأخرة ورتّبها',
      en: 'Show my overdue tasks and sort them',
      priority: RULES.overdueTodo,
    });
  }

  // 2. A prayer inside the 30-minute window.
  if (input.prayers && input.prayers.length > 0) {
    const soon = input.prayers.find(
      (p) => p.key !== 'sunrise' && p.when.getTime() > nowMs && p.when.getTime() - nowMs <= PRAYER_SOON_MINUTES * 60_000,
    );
    if (soon) {
      const labelAr = PRAYER_NAMES_AR[soon.key as PrayerKey] ?? soon.key;
      const labelEn = PRAYER_NAMES_EN[soon.key as PrayerKey] ?? soon.key;
      out.push({
        id: 'prayer-soon',
        ar: `متى أذان ${labelAr}؟`,
        en: `When is the ${labelEn} adhan?`,
        priority: RULES.prayerSoon,
      });
    }
  }

  // 3. Something on today's calendar.
  if (input.events.some((e) => isSameLocalDay(e.startMs, now))) {
    out.push({ id: 'events-today', ar: 'وش عندي اليوم؟', en: "What's on my day today?", priority: RULES.eventsToday });
  }

  // 4. Tasks due before tonight.
  if (input.todos.some((t) => !t.done && t.dueMs !== null && t.dueMs >= nowMs && t.dueMs <= endOfDayMs)) {
    out.push({ id: 'todos-today', ar: 'وش المطلوب مني اليوم؟', en: "What's due today?", priority: RULES.todosDueToday });
  }

  // 5. Reminders landing today (user-tagged only — prayer reminders stay silent).
  if (input.reminders.some((r) => r.tag === 'user' && r.whenMs >= nowMs && r.whenMs <= endOfDayMs)) {
    out.push({ id: 'reminders-today', ar: 'وش تذكيرات اليوم؟', en: "What are today's reminders?", priority: RULES.remindersToday });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, max);
}
