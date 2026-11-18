// Copyright (c) 2026 DRS AI. All rights reserved.
import { BENCHMARK_TASKS } from '../src/agent/eval/tasks';
import { makeAllTools } from '../src/agent/tools/all';
import { TITLE_MAX, DETAIL_MAX } from '../src/agent/planner';

describe('the Phase-5 evaluation suite', () => {
  const registry = makeAllTools({
    reminderIO: {
      requestPermissions: async () => true,
      scheduleOneshot: async () => 'test-id',
      cancel: async () => undefined,
    },
    getLocation: async () => ({ lat: 24.7136, lng: 46.6753 }),
  });

  it('holds at least one hundred tasks', () => {
    expect(BENCHMARK_TASKS.length).toBeGreaterThanOrEqual(100);
  });

  it('is Saudi Arabic first with English controls', () => {
    const arabic = BENCHMARK_TASKS.filter((t) => t.locale === 'ar').length;
    const english = BENCHMARK_TASKS.filter((t) => t.locale === 'en').length;
    expect(arabic).toBeGreaterThanOrEqual(90);
    expect(english).toBeGreaterThanOrEqual(10);
  });

  it('references only registered tools, in valid shapes', () => {
    for (const task of BENCHMARK_TASKS) {
      expect(task.goal.trim().length).toBeGreaterThan(0);
      expect(task.goal.length).toBeLessThanOrEqual(TITLE_MAX + DETAIL_MAX);
      expect(task.expectedTools.length).toBeGreaterThan(0);
      for (const tool of task.expectedTools) {
        expect(registry.has(tool)).toBe(true);
      }
      expect(task.intent.length).toBeGreaterThan(0);
    }
  });

  it('covers every registered tool at least twice', () => {
    const counts = new Map<string, number>();
    for (const task of BENCHMARK_TASKS) {
      for (const tool of new Set(task.expectedTools)) {
        counts.set(tool, (counts.get(tool) ?? 0) + 1);
      }
    }
    for (const tool of registry.list()) {
      expect(counts.get(tool.name) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps every task id unique', () => {
    const ids = BENCHMARK_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the competition example tasks verbatim', () => {
    // The three examples the championship brief names must be in the suite.
    const goals = BENCHMARK_TASKS.map((t) => t.goal);
    expect(goals).toContain('ذكّرني أتصل على أبوي بعد العصر');
    expect(goals).toContain('رتّب لي يومي');
    expect(goals).toContain('وش عندي الأسبوع الجاي؟');
  });

  it('keeps read-only intents read-only', () => {
    const readIntents = new Set(['reminder-read', 'calendar-read', 'todo-read', 'memory-read', 'prayer-read', 'notes-read', 'time-query', 'model-info']);
    for (const task of BENCHMARK_TASKS.filter((t) => readIntents.has(t.intent))) {
      for (const tool of task.expectedTools) {
        expect(registry.get(tool)!.mutating).toBe(false);
      }
    }
    // Cancel/forget/complete intents must be handled by mutating tools.
    for (const task of BENCHMARK_TASKS.filter((t) => t.intent.endsWith('cancel') || t.intent.endsWith('forget') || t.intent.endsWith('complete'))) {
      expect(task.expectedTools.some((tool) => registry.get(tool)!.mutating)).toBe(true);
    }
  });
});
