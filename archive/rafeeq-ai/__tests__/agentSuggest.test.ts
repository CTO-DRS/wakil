// Copyright (c) 2026 DRS AI. All rights reserved.
import { computeSuggestions, PRAYER_SOON_MINUTES } from '../src/agent/suggest';
import type { TodoRecord } from '../src/agent/todos';
import type { AgentReminderRecord } from '../src/agent/reminders';

/** 2026-11-08, 09:00 local. */
const NOW = new Date(2026, 10, 8, 9, 0, 0, 0);
const NOW_MS = NOW.getTime();
const M = 60_000;
const H = 3_600_000;

function todo(partial: Partial<TodoRecord>): TodoRecord {
  return { id: 't1', title: 'مهمة', done: false, dueMs: null, createdAt: NOW_MS, ...partial };
}
function reminder(partial: Partial<AgentReminderRecord>): AgentReminderRecord {
  return { id: 'r1', title: 'تذكير', body: '', whenMs: NOW_MS + 2 * H, tag: 'user', ...partial };
}

const EMPTY = {
  now: NOW,
  todos: [] as TodoRecord[],
  reminders: [] as AgentReminderRecord[],
  prayers: null,
  events: [],
};

describe('computeSuggestions — the local-data rules', () => {
  it('returns nothing when the shelves are empty and nothing is scheduled', () => {
    expect(computeSuggestions(EMPTY)).toEqual([]);
  });

  it('nudges about overdue tasks with the top priority', () => {
    const out = computeSuggestions({ ...EMPTY, todos: [todo({ dueMs: NOW_MS - H })] });
    expect(out.map((s) => s.id)).toEqual(['overdue-todos']);
    expect(out[0].ar).toContain('المهام المتأخرة');
    expect(out[0].en).toContain('overdue');
  });

  it('surfaces an approaching prayer inside the 30-minute window, in Arabic', () => {
    const soon = { key: 'asr', when: new Date(NOW_MS + 20 * M) };
    const out = computeSuggestions({ ...EMPTY, prayers: [soon] });
    expect(out.map((s) => s.id)).toEqual(['prayer-soon']);
    expect(out[0].ar).toBe('متى أذان العصر؟');
    expect(out[0].en).toBe('When is the Asr adhan?');
  });

  it('stays quiet for a sunrise chip and for prayers beyond the window', () => {
    const out = computeSuggestions({
      ...EMPTY,
      prayers: [{ key: 'sunrise', when: new Date(NOW_MS + 10 * M) }],
    });
    expect(out).toEqual([]);
    const later = computeSuggestions({
      ...EMPTY,
      prayers: [{ key: 'maghrib', when: new Date(NOW_MS + (PRAYER_SOON_MINUTES + 5) * M) }],
    });
    expect(later).toEqual([]);
  });

  it('chips today\'s events and tasks and today\'s reminders, in priority order', () => {
    const out = computeSuggestions({
      ...EMPTY,
      todos: [todo({ dueMs: NOW_MS + 3 * H })],
      reminders: [reminder({})],
      events: [{ title: 'اجتماع', startMs: NOW_MS + 2 * H }],
    });
    expect(out.map((s) => s.id)).toEqual(['events-today', 'todos-today', 'reminders-today']);
  });

  it('ignores tomorrow\'s events, tasks and reminders', () => {
    const out = computeSuggestions({
      ...EMPTY,
      todos: [todo({ dueMs: NOW_MS + 26 * H })],
      reminders: [reminder({ whenMs: NOW_MS + 30 * H })],
      events: [{ title: 'غدًا', startMs: NOW_MS + 26 * H }],
    });
    expect(out).toEqual([]);
  });

  it('ignores prayer-tagged reminders (the adhan nudge belongs to the prayer rule)', () => {
    const out = computeSuggestions({ ...EMPTY, reminders: [reminder({ tag: 'prayer' })] });
    expect(out).toEqual([]);
  });

  it('caps the chips at three so the agent never nags', () => {
    const out = computeSuggestions({
      ...EMPTY,
      todos: [todo({ id: 't-over', dueMs: NOW_MS - H }), todo({ id: 't-today', dueMs: NOW_MS + H })],
      reminders: [reminder({})],
      events: [{ title: 'اجتماع', startMs: NOW_MS }],
      prayers: [{ key: 'dhuhr', when: new Date(NOW_MS + 10 * M) }],
    });
    expect(out).toHaveLength(3);
    // Priority order: overdue tasks > approaching prayer > today's events.
    expect(out.map((s) => s.id)).toEqual(['overdue-todos', 'prayer-soon', 'events-today']);
  });
});
