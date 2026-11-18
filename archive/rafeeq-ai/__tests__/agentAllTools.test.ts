// Copyright (c) 2026 DRS AI. All rights reserved.
import { makeAllTools } from '../src/agent/tools/all';
import { PHONE_TOOL_RISKS } from '../src/agent/tools/phone';
import { requiresConfirmation } from '../src/agent/confirmation';
import { buildPlanGrammar, buildSingleToolCallGrammar } from '../src/agent/grammar';
import { parsePlan } from '../src/agent/planner';
import { DEFAULT_AGENT_LIMITS } from '../src/agent/types';

describe('the full Phase-2 registry', () => {
  const registry = makeAllTools({
    reminderIO: {
      requestPermissions: async () => true,
      scheduleOneshot: async () => 'test-id',
      cancel: async () => undefined,
    },
  });

  it('grows from four tools to twenty-nine with no duplicates', () => {
    expect(registry.size).toBe(29);
    const names = registry.list().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps every Phase-1 capability in place', () => {
    for (const name of ['time.now', 'device.model_info', 'notes.create', 'notes.list']) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it('registers all thirteen phone tools with the documented risk', () => {
    for (const [name, risk] of Object.entries(PHONE_TOOL_RISKS)) {
      const tool = registry.get(name)!;
      expect(tool).toBeTruthy();
      expect(requiresConfirmation(tool)).toBe(risk === 'mutating');
    }
  });

  it('registers the Phase-3 memory and briefing family', () => {
    for (const name of ['memory.save', 'memory.forget', 'memory.search', 'briefing.today']) {
      const tool = registry.get(name);
      expect(tool).toBeTruthy();
      expect(tool!.category).toBe(name === 'briefing.today' ? 'productivity' : 'memory');
    }
    expect(requiresConfirmation(registry.get('memory.save')!)).toBe(true);
    expect(requiresConfirmation(registry.get('memory.forget')!)).toBe(true);
    expect(requiresConfirmation(registry.get('memory.search')!)).toBe(false);
    expect(requiresConfirmation(registry.get('briefing.today')!)).toBe(false);
  });

  it('gates every mutating tool behind the confirmation card policy', () => {
    const mutating = registry.list().filter((t) => t.mutating).map((t) => t.name);
    expect(mutating).toEqual(expect.arrayContaining([
      'notes.create', 'contacts.call', 'messages.sms_draft', 'messages.whatsapp_draft',
      'alarms.set', 'timers.set', 'calendar.create', 'calendar.move',
      'device.torch', 'device.dnd', 'device.brightness', 'device.wifi_panel',
      'prayer.reminders_set', 'todos.add', 'todos.complete',
      'reminders.create', 'reminders.cancel', 'memory.save', 'memory.forget',
    ]));
    for (const name of mutating) {
      expect(requiresConfirmation(registry.get(name)!)).toBe(true);
    }
    for (const tool of registry.list().filter((t) => !t.mutating)) {
      expect(requiresConfirmation(tool)).toBe(false);
    }
  });

  it('builds the plan grammar and per-tool grammars without throwing', () => {
    const tools = registry.list();
    const grammar = buildPlanGrammar(tools.map((t) => t.name));
    expect(grammar).toContain('root ::= ');
    expect(grammar).toContain('prayer.times');
    for (const tool of tools) {
      expect(buildSingleToolCallGrammar(tool)).toContain('root ::= ');
    }
  });

  it('renders a compact catalog that stays inside the prompt budget', () => {
    const catalog = registry.catalog('ar');
    const lines = catalog.split('\n');
    expect(lines).toHaveLength(29);
    // Small models lose focus with verbose catalogs: no line grows past 200
    // chars, and the whole 29-tool catalog stays under ~6.5 KB (~1500 tokens),
    // well inside the 4K+ context budget of the selected 3B models.
    for (const line of lines) {
      expect(line.length).toBeLessThan(200);
    }
    expect(catalog.length).toBeLessThan(6500);
    expect(registry.catalog('en').length).toBeLessThan(6500);
  });

  it('parses a Saudi plan that mixes memory, phone, prayer and answer steps', () => {
    const tools = registry.list();
    const raw = JSON.stringify({
      steps: [
        { title: 'أبحث في الذاكرة', tool: 'memory.search', detail: 'أشوف وش تعرف عن شغلي' },
        { title: 'أقرأ الوقت الحالي', tool: 'time.now', detail: 'لأعرف تاريخ الغد' },
        { title: 'أبحث عن أبوي', tool: 'contacts.search', detail: 'أبحث بالاسم' },
        { title: 'أجهّز الرسالة', tool: 'messages.whatsapp_draft', detail: 'صياغة نص جاهز' },
        { title: 'أصيغ الجواب', tool: null, detail: 'ألخّص النتائج' },
      ],
    });
    const parsed = parsePlan(raw, tools, DEFAULT_AGENT_LIMITS);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.steps.map((s) => s.tool)).toEqual([
        'memory.search', 'time.now', 'contacts.search', 'messages.whatsapp_draft', null,
      ]);
    }
  });

  it('rejects a plan that invents a tool outside the registry', () => {
    const tools = registry.list();
    const raw = JSON.stringify({
      steps: [{ title: 'خطوة', tool: 'phonehack.root', detail: 'غير موجود' }],
    });
    const parsed = parsePlan(raw, tools, DEFAULT_AGENT_LIMITS);
    expect(parsed.ok).toBe(false);
  });
});
