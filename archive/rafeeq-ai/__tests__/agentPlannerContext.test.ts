// Copyright (c) 2026 DRS AI. All rights reserved.
import { buildAnswerMessages, buildPlanMessages, parsePlan } from '../src/agent/planner';
import { AgentRunner } from '../src/agent/loop';
import type { AgentLlm } from '../src/agent/llm';
import { useMemoryStore } from '../src/agent/memory';
import { knownContextForGoal } from '../src/store/agentStore';
import { ToolRegistry } from '../src/agent/registry';
import { registerMemoryTools } from '../src/agent/tools/memory';
import { DEFAULT_AGENT_LIMITS, type AgentEvent, type ToolDefinition } from '../src/agent/types';

const timeNow: ToolDefinition = {
  name: 'time.now',
  descriptionAr: 'الوقت',
  descriptionEn: 'Time',
  category: 'time',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  run: async () => ({ ok: true, data: '9:00' }),
};

/** The REAL memory tools (they write the store), on a fresh registry. */
function makeMemoryRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registerMemoryTools(registry, { now: () => new Date() });
  return registry;
}

function scriptedLLM(responses: (string | Error)[], capture?: { planUser?: string[]; actUser?: string[]; answerUser?: string[] }): AgentLlm {
  const queue = [...responses];
  return {
    async complete(messages, _req) {
      const last = messages[messages.length - 1];
      if (last.role === 'user' && capture) {
        if (last.content.includes('الأدوات المتاحة')) capture.planUser?.push(last.content);
        else if (last.content.includes('نفّذ الآن الخطوة')) capture.actUser?.push(last.content);
        else capture.answerUser?.push(last.content);
      }
      const next = queue.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new Error('SCRIPT_EXHAUSTED');
      return { text: next };
    },
    stop: async () => undefined,
  };
}

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

describe('planner prompts — the known-context block', () => {
  it('injects the context block ahead of the catalog in the plan prompt', () => {
    const messages = buildPlanMessages('رتّب يومي', [timeNow], 'ar', ['- [تفضيل] أحب القهوة بعد الفجر']);
    const user = messages[1].content;
    expect(user.indexOf('معلومات معروفة عن المستخدم')).toBeLessThan(user.indexOf('الأدوات المتاحة'));
    expect(user).toContain('أحب القهوة بعد الفجر');
  });

  it('omits the block when no context exists (byte-identical to before)', () => {
    const withUndefined = buildPlanMessages('goal', [timeNow], 'en');
    const withEmpty = buildPlanMessages('goal', [timeNow], 'en', []);
    expect(withUndefined).toEqual(withEmpty);
    expect(withUndefined[1].content).not.toContain('Known facts');
  });

  it('appends the context block to the answer prompt', () => {
    const messages = buildAnswerMessages('goal', [], [], 'en', ['- [person] my father is Saad']);
    expect(messages[1].content).toContain('Known facts about the user');
    expect(messages[1].content).toContain('my father is Saad');
  });
});

describe('knownContextForGoal — retrieval over the memory shelf', () => {
  afterEach(() => useMemoryStore.setState({ memories: [] }));

  it('returns the top matching memories as bounded lines', () => {
    useMemoryStore.setState({
      memories: [
        { id: 'm1', kind: 'preference', text: 'أحب القهوة بعد الفجر', source: 'agent', createdAt: 1, updatedAt: 1 },
        { id: 'm2', kind: 'person', text: 'أبوي اسمه سعد', source: 'user', createdAt: 2, updatedAt: 2 },
        { id: 'm3', kind: 'routine', text: 'شغلي ينتهي الساعة خمسة', source: 'agent', createdAt: 3, updatedAt: 3 },
      ],
    });
    const lines = knownContextForGoal('وش تعرف عن شغلي؟');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('شغلي');
    expect(lines[0].startsWith('- [')).toBe(true);
  });

  it('returns [] on an empty shelf', () => {
    useMemoryStore.setState({ memories: [] });
    expect(knownContextForGoal('أي شيء')).toEqual([]);
  });
});

describe('AgentRunner — memory flows through the loop', () => {
  it('injects retrieved memories into the plan prompt, and the answer prompt', async () => {
    const events: AgentEvent[] = [];
    const capture: { planUser: string[]; answerUser: string[] } = { planUser: [], answerUser: [] };
    const registry = new ToolRegistry();
    registry.register(timeNow);
    const PLAN = JSON.stringify({ steps: [{ title: 'اسأل الوقت', tool: 'time.now', detail: 'الساعة' }] });
    const CALL = JSON.stringify({ tool: 'time.now', arguments: {} });
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN, CALL, 'تم بناء على ذاكرتك'], capture),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
      knownContext: () => ['- [تفضيل] أحب القهوة بعد الفجر'],
    });
    const done = runner.start('وش الساعة؟');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    const outcome = await done;
    expect(outcome.status).toBe('done');
    expect(capture.planUser[0]).toContain('أحب القهوة بعد الفجر');
    expect(capture.answerUser[0]).toContain('أحب القهوة بعد الفجر');
  });

  it('runs a memory.save goal end-to-end behind the confirmation card', async () => {
    useMemoryStore.setState({ memories: [] });
    const events: AgentEvent[] = [];
    const registry = makeMemoryRegistry();
    const PLAN = JSON.stringify({
      steps: [{ title: 'أحفظ المعلومة في ذاكرتي', tool: 'memory.save', detail: 'تذكّر تفضيلك' }],
    });
    const CALL = JSON.stringify({ tool: 'memory.save', arguments: { text: 'أحب القهوة بعد الفجر' } });
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN, CALL, 'حفظتها']),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const done = runner.start('تعلّم إنني أحب القهوة بعد الفجر');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    await waitForEvent(events, 'confirmation-required');
    runner.decideConfirmation('s1', true);
    const outcome = await done;
    expect(outcome.status).toBe('done');
    const memories = useMemoryStore.getState().getMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].text).toBe('أحب القهوة بعد الفجر');
    expect(memories[0].source).toBe('agent');
  });

  it('skips the memory write when the user declines the confirmation card', async () => {
    useMemoryStore.setState({ memories: [] });
    const events: AgentEvent[] = [];
    const registry = makeMemoryRegistry();
    const PLAN = JSON.stringify({
      steps: [{ title: 'أحفظ المعلومة', tool: 'memory.save', detail: 'تذكّر' }],
    });
    const CALL = JSON.stringify({ tool: 'memory.save', arguments: { text: 'سر ما يُحفظ' } });
    const runner = new AgentRunner({
      llm: scriptedLLM([PLAN, CALL, 'لم أحفظ شيئًا']),
      tools: registry,
      locale: 'ar',
      model: null,
      onEvent: (e) => events.push(e),
    });
    const done = runner.start('تعلّم إنني أحب القهوة');
    await waitForEvent(events, 'plan-proposed');
    runner.decidePlan({ action: 'run' });
    await waitForEvent(events, 'confirmation-required');
    runner.decideConfirmation('s1', false);
    const outcome = await done;
    expect(outcome.status).toBe('done');
    expect(outcome.steps[0].status).toBe('skipped');
    expect(useMemoryStore.getState().getMemories()).toHaveLength(0);
  });

  it('parsePlan still accepts a memory-tool plan on the plain registry', () => {
    const registry = makeMemoryRegistry();
    const raw = JSON.stringify({
      steps: [{ title: 'أحفظ', tool: 'memory.save', detail: 'تذكّر' }],
    });
    const parsed = parsePlan(raw, registry.list(), DEFAULT_AGENT_LIMITS);
    expect(parsed.ok).toBe(true);
  });
});
