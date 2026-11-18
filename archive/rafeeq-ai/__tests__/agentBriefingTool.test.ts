// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRemindersStore } from '../src/agent/reminders';
import { useTodosStore } from '../src/agent/todos';
import { registerBriefingTool } from '../src/agent/tools/briefing';
import { ToolRegistry } from '../src/agent/registry';
import type { ToolResult } from '../src/agent/types';

/** 2026-11-08, 07:10 local. */
const NOW = new Date(2026, 10, 8, 7, 10, 0, 0);
const NOW_MS = NOW.getTime();
const H = 3_600_000;

function makeRegistry(deps: Parameters<typeof registerBriefingTool>[1] = {}): ToolRegistry {
  const registry = new ToolRegistry();
  registerBriefingTool(registry, deps);
  return registry;
}

async function run(registry: ToolRegistry, locale: 'ar' | 'en' = 'ar'): Promise<ToolResult> {
  return registry.get('briefing.today')!.run({}, { locale, now: () => NOW, model: null });
}

describe('briefing.today', () => {
  afterEach(() => {
    useRemindersStore.setState({ reminders: [] });
    useTodosStore.setState({ todos: [] });
  });

  it('composes the day from injected sources, with prayers via the city chain', async () => {
    const registry = makeRegistry({
      now: () => NOW,
      getLocation: async () => ({ lat: 21.4858, lng: 39.1925 }), // Makkah coords
      listEvents: async () => [{ title: 'اجتماع الفريق', startMs: NOW_MS + 2 * H, endMs: null }],
      getReminders: () => [{ id: 'r1', title: 'اتصل على أبوي', body: '', whenMs: NOW_MS + 3 * H, tag: 'user' }],
      getTodos: () => [{ id: 't1', title: 'تجهيز التقرير', done: false, dueMs: NOW_MS - H, createdAt: NOW_MS }],
    });
    const res = await run(registry);
    expect(res.ok).toBe(true);
    const text = res.data ?? '';
    expect(text).toContain('هذا ملخص يومك');
    expect(text).toContain('اجتماع الفريق');
    expect(text).toContain('اتصل على أبوي');
    expect(text).toContain('تجهيز التقرير');
    expect(text).toContain('متأخرة');
    expect(text).toContain('الظهر');
  });

  it('reads the default shelves when no deps are injected (a quiet day)', async () => {
    useRemindersStore.setState({
      reminders: [{ id: 'r1', title: 'تذكير الصلاة', body: '', whenMs: NOW_MS + 3 * H, tag: 'prayer' }],
    });
    useTodosStore.setState({ todos: [] });
    const registry = makeRegistry({ now: () => NOW, getLocation: async () => null }); // no GPS → Riyadh default
    const res = await run(registry);
    expect(res.ok).toBe(true);
    // Prayer-tagged reminders stay out of the briefing; a quiet day is said honestly.
    expect(res.data).toContain('يوم هادئ');
    expect(res.data).toContain('الظهر');
  });

  it('survives a failing calendar read and a failing GPS fix', async () => {
    const registry = makeRegistry({
      now: () => NOW,
      getLocation: async () => { throw new Error('gps denied'); },
      listEvents: async () => { throw new Error('calendar unavailable'); },
    });
    const res = await run(registry);
    expect(res.ok).toBe(true);
    expect(res.data).toContain('يوم هادئ');
  });

  it('renders the English form when asked', async () => {
    const registry = makeRegistry({
      now: () => NOW,
      listEvents: async () => [{ title: 'Team sync', startMs: NOW_MS + 2 * H, endMs: null }],
      getReminders: () => [],
      getTodos: () => [],
    });
    const res = await run(registry, 'en');
    expect(res.ok).toBe(true);
    expect(res.data).toContain('Here is your day:');
    expect(res.data).toContain('Team sync');
  });

  it('is read-only by policy', () => {
    const registry = makeRegistry();
    expect(registry.get('briefing.today')!.mutating).toBe(false);
  });
});
