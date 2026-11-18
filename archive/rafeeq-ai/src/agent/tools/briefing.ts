// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The `briefing.today` tool — «وش عندي اليوم؟» in one read-only call: today's
 * calendar events (native, non-prompting), today's user reminders, the
 * remaining prayer times (GPS fix → Riyadh, same chain as prayer.times) and
 * the open todos, composed by briefing.composeBriefing. Everything the tool
 * touches is injectable, so tests run without a device and without stores.
 */

import { composeBriefing, type BriefingEvent, type BriefingPrayer, type BriefingReminder, type BriefingTodo } from '../briefing';
import { DEFAULT_CITY, SAUDI_CITIES, upcomingPrayerTimes } from '../prayer';
import { ToolRegistry } from '../registry';
import { useRemindersStore, type AgentReminderRecord } from '../reminders';
import { useTodosStore, type TodoRecord } from '../todos';
import type { ToolDefinition, ToolResult } from '../types';
import { getRafeeqNativeOrOverride } from './native';

export interface BriefingToolDeps {
  now?: () => Date;
  /** Resolves device coordinates (tests inject fakes); null when unavailable. */
  getLocation?: () => Promise<{ lat: number; lng: number } | null>;
  /** Today's events (tests inject); defaults to the native calendar, non-prompting. */
  listEvents?: (daysAhead: number, maxCount: number) => Promise<BriefingEvent[]>;
  /** Reminder records (tests inject); defaults to the local reminders shelf. */
  getReminders?: () => AgentReminderRecord[];
  /** Todo records (tests inject); defaults to the local todos shelf. */
  getTodos?: () => TodoRecord[];
}

/** Tolerant native calendar read: any failure just leaves the section empty. */
async function readNativeEvents(daysAhead: number, maxCount: number): Promise<BriefingEvent[]> {
  try {
    const native = getRafeeqNativeOrOverride();
    if (!native) return [];
    const res = await native.calendarListUpcoming(daysAhead, maxCount);
    if (!res.ok) return [];
    return (res.events ?? []).map((e) => ({ title: e.title, startMs: e.startMs, endMs: e.endMs }));
  } catch {
    return [];
  }
}

/** Default shelves: the local reminders and todos stores. */
function defaultGetReminders(): AgentReminderRecord[] {
  return useRemindersStore.getState().getReminders();
}
function defaultGetTodos(): TodoRecord[] {
  return useTodosStore.getState().getTodos();
}

const briefingToday = (deps: BriefingToolDeps): ToolDefinition => ({
  name: 'briefing.today',
  descriptionAr: 'يعرض ملخص اليوم: أحداث التقويم، التذكيرات، مواقيت الصلاة المتبقية والمهام المفتوحة.',
  descriptionEn: 'Summarizes the day: calendar events, reminders, remaining prayer times and open tasks.',
  category: 'productivity',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_args, ctx): Promise<ToolResult> {
    const now = (deps.now ?? (() => new Date()))();

    const events: BriefingEvent[] = deps.listEvents
      ? await deps.listEvents(1, 20).catch(() => [])
      : await readNativeEvents(1, 20);

    const reminders: BriefingReminder[] = (deps.getReminders ?? defaultGetReminders)()
      .filter((r) => r.tag === 'user')
      .map((r) => ({ title: r.title, whenMs: r.whenMs }));

    const todos: BriefingTodo[] = (deps.getTodos ?? defaultGetTodos)()
      .map((t) => ({ title: t.title, done: t.done, dueMs: t.dueMs }));

    // Prayer times: GPS fix when the app already holds the permission,
    // otherwise the Riyadh default — the same chain prayer.times uses.
    let coords = SAUDI_CITIES[DEFAULT_CITY];
    if (deps.getLocation) {
      try {
        const fix = await Promise.race([
          deps.getLocation(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
        ]);
        if (fix) coords = { lat: fix.lat, lng: fix.lng, tz: coords.tz };
      } catch {
        // Fall through to the default city.
      }
    }
    const prayers: BriefingPrayer[] = upcomingPrayerTimes(now, coords, 'umm_al_qura', 6);

    const briefing = composeBriefing({ now, locale: ctx.locale, events, reminders, prayers, todos, prayerTz: coords.tz });
    return { ok: true, data: briefing.text };
  },
});

/** Registers the briefing tool on a registry. */
export function registerBriefingTool(registry: ToolRegistry, deps: BriefingToolDeps = {}): ToolRegistry {
  registry.register(briefingToday(deps));
  return registry;
}
