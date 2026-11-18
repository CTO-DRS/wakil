// Copyright (c) 2026 DRS AI. All rights reserved.
import { AgentRunner, fallbackAnswer } from '../src/agent/loop';
import type { AgentLlm } from '../src/agent/llm';
import { ToolRegistry } from '../src/agent/registry';
import type { AgentEvent, ToolDefinition, ToolResult } from '../src/agent/types';

const notesCreate: ToolDefinition = {
  name: 'notes.create',
  descriptionAr: 'يحفظ مذكرة',
  descriptionEn: 'Saves a note',
  category: 'notes',
  mutating: true,
  parameters: {
    type: 'object',
    properties: { title: { type: 'string', description: 't' } },
    required: ['title'],
  },
  run: async (args) => ({ ok: true, data: `حُفظت: ${String(args.title)}` }),
};

const timeNow: ToolDefinition = {
  name: 'time.now',
  descriptionAr: 'الوقت',
  descriptionEn: 'Time',
  category: 'time',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  run: async () => ({ ok: true, data: '9:00' }),
};

function makeRegistry(tools: ToolDefinition[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const t of tools) registry.register(t);
  return registry;
}

/** Scripted LLM: pops one response per call, in order. */
function scriptedLLM(responses: (string | Error)[], log?: { calls: number; grammars: (string | undefined)[] }): AgentLlm {
  const queue = [...responses];
  return {
    async complete(_messages, req) {
      if (log) {
        log.calls += 1;
        log.grammars.push(req.grammar);
      }
      const next = queue.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new Error('SCRIPT_EXHAUSTED');
      return { text: next };
    },
    stop: async () => undefined,
  };
}

const PLAN = JSON.stringify({
  steps: [
    { title: 'اطلب الوقت', tool: 'time.now', detail: 'ساعة الجهاز' },
    { title: 'سجّل مذكرة', tool: 'notes.create', detail: 'دوّن الاتصال' },
    { title: 'اكتب الجواب', tool: null, detail: 'الصياغة' },
  ],
});
const CALL_TIME = JSON.stringify({ tool: 'time.now', arguments: {} });
const CALL_NOTE = JSON.stringify({ tool: 'notes.create', arguments: { title: 'أتصل على أبوي' } });
const ANSWER = 'أنهيت المهمة';

/** Drains microtasks until the expected event lands (bounded by macrotasks). */
function waitForEvent(events: AgentEvent[], type: AgentEvent['type'], timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (events.some((e) => e.type === type)) return resolve();
      if (Date.now() - startedAt > timeoutMs) return reject(new Error(`EVENT_TIMEOUT: ${type}`));
      setTimeout(check, 0);
    };
    check();
  });
}

describe('AgentRunner — happy paths', () => {
  it('plans, executes read-only and mutating steps, and answers', async () => {
    const registry = makeRegistry([timeNow, notesCreate]);
    const log = { calls: 0, grammars: [] as (string | undefined)[] };
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN, CALL_TIME, CALL_NOTE, ANSWER], log),
      tools: registry,
      locale: 'ar',
      model: { id: 'm', name: 'test-model' },
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('دوّن مذكرة الاتصال');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    await waitForEvent(events, 'confirmation-required');
    runner.decideConfirmation('s2', true);
    const outcome = await pending;

    expect(outcome.status).toBe('done');
    expect(outcome.answer).toBe(ANSWER);
    expect(outcome.llmCalls).toBe(4);
    expect(outcome.steps.map((s) => s.status)).toEqual(['done', 'done', 'done']);
    expect(outcome.steps[1].resultText).toBe('حُفظت: أتصل على أبوي');
    // Every structured call rode a grammar; the final answer did not.
    expect(log.grammars[0]).toContain('root ::=');
    expect(log.grammars[1]).toContain(String.raw`"\"time.now\"`);
    expect(log.grammars[2]).toContain(String.raw`"\"notes.create\""`);
    expect(log.grammars[3]).toBeUndefined();
    // The plan comes first, the confirmation only for the mutating step,
    // and the finished answer closes the trace.
    expect(events[0].type).toBe('plan-proposed');
    expect(events[1].type).toBe('plan-approved');
    const confirming = events.find((e) => e.type === 'confirmation-required');
    expect(confirming).toBeTruthy();
    if (confirming?.type === 'confirmation-required') {
      expect(confirming.tool).toBe('notes.create');
      expect(confirming.args).toEqual({ title: 'أتصل على أبوي' });
    }
    const firstDone = events.findIndex((e) => e.type === 'step-finished');
    const confirmIdx = events.findIndex((e) => e.type === 'confirmation-required');
    expect(firstDone).toBeLessThan(confirmIdx);
    expect(events[events.length - 1].type).toBe('plan-finished');
  });

  it('the read-only step never asks for confirmation', async () => {
    const registry = makeRegistry([timeNow]);
    const plan = JSON.stringify({ steps: [{ title: 'الوقت', tool: 'time.now', detail: '' }] });
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([plan, CALL_TIME, ANSWER]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    const outcome = await pending;
    expect(outcome.status).toBe('done');
    expect(events.some((e) => e.type === 'confirmation-required')).toBe(false);
    expect(outcome.steps[0].status).toBe('done');
    expect(outcome.steps[0].resultText).toBe('9:00');
  });

  it('skipping a mutating step records it and keeps going', async () => {
    const registry = makeRegistry([timeNow, notesCreate]);
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN, CALL_TIME, CALL_NOTE, ANSWER]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    await waitForEvent(events, 'confirmation-required');
    runner.decideConfirmation('s2', false);
    const outcome = await pending;
    expect(outcome.status).toBe('done');
    expect(outcome.steps[1].status).toBe('skipped');
    expect(outcome.answer).toBe(ANSWER);
  });
});

describe('AgentRunner — plan editing and cancellation', () => {
  it('runs only the kept steps when the user edits the plan', async () => {
    const registry = makeRegistry([timeNow, notesCreate]);
    const events: AgentEvent[] = [];
    const log = { calls: 0, grammars: [] as (string | undefined)[] };
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN, CALL_NOTE, ANSWER], log),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run', keepStepIds: ['s2'] });
    await waitForEvent(events, 'confirmation-required');
    runner.decideConfirmation('s2', true);
    const outcome = await pending;
    expect(outcome.steps.map((s) => s.id)).toEqual(['s2']);
    expect(outcome.llmCalls).toBe(3);
    expect(outcome.answer).toBe(ANSWER);
  });

  it('a cancelled plan ends as cancelled before any tool runs', async () => {
    const registry = makeRegistry([timeNow, notesCreate]);
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'cancel' });
    const outcome = await pending;
    expect(outcome.status).toBe('cancelled');
    expect(outcome.answer).toBeNull();
    expect(outcome.steps).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(['plan-proposed', 'agent-cancelled']);
  });

  it('cancel() during the plan decision resolves the run', async () => {
    const registry = makeRegistry([timeNow, notesCreate]);
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.cancel();
    const outcome = await pending;
    expect(outcome.status).toBe('cancelled');
  });

  it('cannot start twice', async () => {
    const registry = makeRegistry([timeNow, notesCreate]);
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const first = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    await expect(runner.start('goal')).rejects.toThrow('AGENT_ALREADY_STARTED');
    runner.cancel();
    await first;
  });
});

describe('AgentRunner — failure handling', () => {
  it('an invalid plan retries once, then fails gracefully', async () => {
    const registry = makeRegistry([timeNow]);
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM(['ليس JSON', 'ليس JSON']),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
      limits: { totalTimeoutMs: 5000 },
    });
    const outcome = await runner.start('goal');
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toBe('PLAN_NOT_JSON');
    expect(outcome.llmCalls).toBe(2);
    expect(events).toEqual([{ type: 'agent-failed', error: 'PLAN_NOT_JSON' }]);
  });

  it('an unknown tool inside the plan is rejected by the parser', async () => {
    const registry = makeRegistry([timeNow]);
    const badPlan = JSON.stringify({ steps: [{ title: 'x', tool: 'calendar.create', detail: '' }] });
    const runner = new AgentRunner({
      llm: scriptedLLM([badPlan, badPlan]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: () => undefined,
    });
    const outcome = await runner.start('goal');
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toBe('STEP_0_UNKNOWN_TOOL');
  });

  it('a step whose call keeps failing is marked failed and the plan continues', async () => {
    const registry = makeRegistry([timeNow]);
    const plan = JSON.stringify({ steps: [{ title: 'الوقت', tool: 'time.now', detail: '' }] });
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([plan, 'bad', 'bad']),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    await waitForEvent(events, 'plan-finished');
    const outcome = await pending;
    expect(outcome.status).toBe('done');
    expect(outcome.steps[0].status).toBe('failed');
    expect(outcome.steps[0].resultText).toBe('CALL_NOT_JSON');
    // Fallback answer composed deterministically, mentioning the failed step.
    expect(outcome.answer).toContain('1. الوقت');
    expect(outcome.answer).toContain('لم تكتمل');
  });

  it('the LLM call cap stops the loop and falls back to a deterministic answer', async () => {
    const registry = makeRegistry([timeNow]);
    const plan = JSON.stringify({ steps: [{ title: 'الوقت', tool: 'time.now', detail: '' }] });
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([plan]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
      limits: { maxLlmCalls: 1 },
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    await waitForEvent(events, 'plan-finished');
    const outcome = await pending;
    expect(outcome.status).toBe('done');
    expect(outcome.llmCalls).toBe(1);
    expect(outcome.answer).toContain('أنهيت المهمة');
  });

  it('a tool error lands as a failed observation', async () => {
    const boom: ToolDefinition = {
      name: 'time.now',
      descriptionAr: 'الوقت',
      descriptionEn: 'Time',
      category: 'time',
      mutating: false,
      parameters: { type: 'object', properties: {}, required: [] },
      run: async () => ({ ok: false, error: 'CLOCK_BROKEN' }),
    };
    const registry = makeRegistry([boom]);
    const plan = JSON.stringify({ steps: [{ title: 'الوقت', tool: 'time.now', detail: '' }] });
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([plan, CALL_TIME, ANSWER]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    const outcome = await pending;
    expect(outcome.steps[0].status).toBe('failed');
    expect(outcome.steps[0].resultText).toBe('CLOCK_BROKEN');
    expect(outcome.answer).toBe(ANSWER);
  });

  it('a tool that never returns is cut off by the tool timeout', async () => {
    const slow: ToolDefinition = {
      name: 'time.now',
      descriptionAr: 'الوقت',
      descriptionEn: 'Time',
      category: 'time',
      mutating: false,
      parameters: { type: 'object', properties: {}, required: [] },
      run: () => new Promise<ToolResult>(() => undefined),
    };
    const registry = makeRegistry([slow]);
    const plan = JSON.stringify({ steps: [{ title: 'الوقت', tool: 'time.now', detail: '' }] });
    const events: AgentEvent[] = [];
    const runner = new AgentRunner({
      llm: scriptedLLM([plan, CALL_TIME, ANSWER]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
      limits: { toolTimeoutMs: 40, totalTimeoutMs: 5000 },
    });
    const pending = runner.start('goal');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    const outcome = await pending;
    expect(outcome.steps[0].status).toBe('failed');
    expect(outcome.steps[0].resultText).toBe('TOOL_TIMEOUT');
  });

  it('an LLM failure mid-plan retries once then fails with the last error', async () => {
    const registry = makeRegistry([timeNow]);
    const runner = new AgentRunner({
      llm: scriptedLLM([new Error('LLM_TIMEOUT'), new Error('LLM_TIMEOUT')]),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: () => undefined,
      limits: { totalTimeoutMs: 5000 },
    });
    const outcome = await runner.start('goal');
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toBe('LLM_TIMEOUT');
    expect(outcome.llmCalls).toBe(2); // one attempt + one retry
  });
});

describe('fallbackAnswer', () => {
  it('reports an empty run honestly', () => {
    expect(fallbackAnswer('goal', [], 'ar')).toContain('دون نتائج');
  });

  it('lists every observation and flags incomplete ones', () => {
    const text = fallbackAnswer(
      'المهمة',
      [
        { stepTitle: 'الوقت', tool: 'time.now', text: '9:00' },
        { stepTitle: 'المذكرة', tool: 'notes.create', text: 'فشلت الخطوة: X' },
      ],
      'ar',
    );
    expect(text).toContain('المهمة');
    expect(text).toContain('1. الوقت: 9:00');
    expect(text).toContain('2. المذكرة');
    expect(text).toContain('لم تكتمل');
  });

  it('switches to English for en', () => {
    expect(fallbackAnswer('goal', [], 'en')).toBe('I finished the task with no recorded results.');
  });
});
