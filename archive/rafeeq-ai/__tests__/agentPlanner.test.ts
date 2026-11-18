// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  ACT_MAX_TOKENS,
  ANSWER_MAX_TOKENS,
  buildActMessages,
  buildAnswerMessages,
  buildPlanMessages,
  parsePlan,
  parseToolCall,
  PLAN_MAX_TOKENS,
  renderObservations,
} from '../src/agent/planner';
import { DEFAULT_AGENT_LIMITS, type ToolDefinition } from '../src/agent/types';

const notesCreate: ToolDefinition = {
  name: 'notes.create',
  descriptionAr: 'يحفظ مذكرة',
  descriptionEn: 'Saves a note',
  category: 'notes',
  mutating: true,
  parameters: {
    type: 'object',
    properties: { title: { type: 'string', description: 't' }, body: { type: 'string', description: 'b' } },
    required: ['title'],
  },
  run: async () => ({ ok: true }),
};

const timeNow: ToolDefinition = {
  name: 'time.now',
  descriptionAr: 'الوقت',
  descriptionEn: 'Time',
  category: 'time',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  run: async () => ({ ok: true, data: 'الآن' }),
};

const tools = [notesCreate, timeNow];

describe('buildPlanMessages', () => {
  it('carries the catalog and the goal for Arabic', () => {
    const messages = buildPlanMessages('دوّن مذكرة', tools, 'ar');
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('رفيق');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('notes.create');
    expect(messages[1].content).toContain('دوّن مذكرة');
    expect(messages[1].content).toContain('[يغيّر بيانات]');
  });

  it('switches to English for en', () => {
    const messages = buildPlanMessages('save a note', tools, 'en');
    expect(messages[0].content).toContain('offline');
    expect(messages[1].content).toContain('Available tools');
  });
});

describe('parsePlan', () => {
  it.each([
    {
      name: 'a valid two-step plan passes with ids',
      text: JSON.stringify({ steps: [{ title: 'اطلب الوقت', tool: 'time.now', detail: 'الأداة' }, { title: 'اكتب الجواب', tool: null, detail: 'الصياغة' }] }),
      ok: true,
      steps: 2,
    },
    {
      name: 'non-JSON text fails',
      text: 'أكيد!',
      ok: false,
      steps: 0,
    },
    {
      name: 'JSON without steps fails',
      text: JSON.stringify({ plan: [] }),
      ok: false,
      steps: 0,
    },
    {
      name: 'an empty step list fails',
      text: JSON.stringify({ steps: [] }),
      ok: false,
      steps: 0,
    },
    {
      name: 'a plan over the cap fails',
      text: JSON.stringify({ steps: Array.from({ length: 7 }, (_, i) => ({ title: `t${i}`, tool: null, detail: '' })) }),
      ok: false,
      steps: 0,
    },
    {
      name: 'an unknown tool fails',
      text: JSON.stringify({ steps: [{ title: 'x', tool: 'calendar.create', detail: '' }] }),
      ok: false,
      steps: 0,
    },
    {
      name: 'a missing title fails',
      text: JSON.stringify({ steps: [{ tool: 'time.now', detail: '' }] }),
      ok: false,
      steps: 0,
    },
  ])('$name', ({ text, ok, steps }) => {
    const parsed = parsePlan(text, tools, DEFAULT_AGENT_LIMITS);
    expect(parsed.ok).toBe(ok);
    if (parsed.ok) expect(parsed.steps).toHaveLength(steps);
  });

  it('assigns sequential step ids', () => {
    const parsed = parsePlan(
      JSON.stringify({ steps: [{ title: 'a', tool: 'time.now', detail: '' }, { title: 'b', tool: null, detail: '' }] }),
      tools,
      DEFAULT_AGENT_LIMITS,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.steps.map((s) => s.id)).toEqual(['s1', 's2']);
    if (parsed.ok) expect(parsed.steps[0].tool).toBe('time.now');
    if (parsed.ok) expect(parsed.steps[1].tool).toBeNull();
  });
});

describe('parseToolCall', () => {
  it.each([
    { name: 'a valid call passes', text: JSON.stringify({ tool: 'notes.create', arguments: { title: 'موعد' } }), ok: true },
    { name: 'wrong tool name fails', text: JSON.stringify({ tool: 'time.now', arguments: {} }), ok: false },
    { name: 'missing required arg fails', text: JSON.stringify({ tool: 'notes.create', arguments: {} }), ok: false },
    { name: 'unknown arg fails', text: JSON.stringify({ tool: 'notes.create', arguments: { title: 'x', z: 1 } }), ok: false },
    { name: 'non-JSON fails', text: 'nice', ok: false },
  ])('$name', ({ text, ok }) => {
    const parsed = parseToolCall(text, notesCreate);
    expect(parsed.ok).toBe(ok);
  });

  it('passes through validated arguments', () => {
    const parsed = parseToolCall(JSON.stringify({ tool: 'notes.create', arguments: { title: 'A', body: 'B' } }), notesCreate);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.args).toEqual({ title: 'A', body: 'B' });
  });
});

describe('observation rendering', () => {
  it('numbers observations oldest first', () => {
    const text = renderObservations([
      { stepTitle: 'اطلب الوقت', tool: 'time.now', text: '٩:٠٠' },
      { stepTitle: 'اكتب الجواب', tool: null, text: 'تم' },
    ]);
    expect(text).toBe('1. اطلب الوقت (time.now) → ٩:٠٠\n2. اكتب الجواب → تم');
  });

  it('renders nothing for an empty list', () => {
    expect(renderObservations([])).toBe('');
  });
});

describe('act and answer prompts', () => {
  const steps = [{ id: 's1', title: 'سجّل مذكرة', tool: 'notes.create', detail: 'دوّن الاتصال' }];

  it('locks the act prompt to the single tool contract', () => {
    const messages = buildActMessages('دوّن مذكرة', steps, steps[0], [], notesCreate, 'ar');
    expect(messages[0].content).toContain('{"tool":"<اسم الأداة>","arguments":{...}}');
    expect(messages[1].content).toContain('notes.create');
    expect(messages[1].content).toContain('سجّل مذكرة');
  });

  it('carries earlier observations into the act prompt', () => {
    const messages = buildActMessages('goal', steps, steps[0], [{ stepTitle: 'الوقت', tool: 'time.now', text: '9:00' }], notesCreate, 'en');
    expect(messages[1].content).toContain('Earlier results');
    expect(messages[1].content).toContain('9:00');
  });

  it('the answer prompt forbids invention and lists results', () => {
    const messages = buildAnswerMessages('goal', steps, [{ stepTitle: 'سجّل', tool: 'notes.create', text: 'حُفظت' }], 'ar');
    expect(messages[0].content).toContain('لا تخترع');
    expect(messages[1].content).toContain('حُفظت');
  });

  it('keeps the token budgets tight for small models', () => {
    expect(PLAN_MAX_TOKENS).toBeLessThanOrEqual(600);
    expect(ACT_MAX_TOKENS).toBeLessThanOrEqual(300);
    expect(ANSWER_MAX_TOKENS).toBeLessThanOrEqual(800);
  });
});
