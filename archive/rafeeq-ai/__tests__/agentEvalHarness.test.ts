// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  EVAL_ARG_TEMPLATES,
  formatEvalReport,
  isTaskSuccess,
  makeEvalClock,
  makeEvalEnvironment,
  runEvalSuite,
  runEvalTask,
  scriptedModelFor,
} from '../src/agent/eval/harness';
import { BENCHMARK_TASKS } from '../src/agent/eval/tasks';
import { makeAllTools } from '../src/agent/tools/all';
import { useMemoryStore } from '../src/agent/memory';

describe('the full-loop evaluation harness', () => {
  it('builds an offline environment with all 29 tools and seeded shelves', () => {
    const env = makeEvalEnvironment();
    const registry = makeAllTools(env.deps);
    expect(registry.size).toBe(29);
    expect(useMemoryStore.getState().getMemories().some((m) => m.id === 'm_seed1')).toBe(true);
    expect(env.deps.reminderIO).toBeTruthy();
    expect(env.deps.native).toBeTruthy();
  });

  it('runs the whole 110-task suite through the real loop with a perfect score', async () => {
    const report = await runEvalSuite({ model: 'scripted-perfect' });
    expect(report.tasks).toHaveLength(BENCHMARK_TASKS.length);
    expect(report.planValidityRate).toBe(1);
    expect(report.successRate).toBe(1);
    expect(report.misfireRate).toBe(0);
    // The safety invariant holds on every executed mutating step.
    expect(report.confirmationComplianceRate).toBe(1);
    // Every intent attempted was also completed.
    for (const [intent, slot] of Object.entries(report.byIntent)) {
      expect(slot.successes).toBe(slot.attempts);
      expect(slot.attempts).toBeGreaterThan(0);
      void intent;
    }
    // Every tool exercised at least twice, never misfiring.
    for (const slot of Object.values(report.byTool)) {
      expect(slot.attempts).toBeGreaterThanOrEqual(2);
      expect(slot.successes).toBe(slot.attempts);
      expect(slot.misfires).toBe(0);
    }
  }, 30_000);

  it('records the real side effects of mutating tasks', async () => {
    const env = makeEvalEnvironment();
    const registry = makeAllTools(env.deps);
    const t37 = BENCHMARK_TASKS.find((t) => t.id === 't37')!; // alarms.set
    const t01 = BENCHMARK_TASKS.find((t) => t.id === 't01')!; // notes.create
    const t62 = BENCHMARK_TASKS.find((t) => t.id === 't62')!; // contacts.call

    env.reset();
    const alarm = await runEvalTask(t37, registry, env.deps);
    expect(isTaskSuccess(alarm)).toBe(true);
    expect(env.state.alarms).toEqual([{ hour: 4, minute: 50, label: 'صلاة الفجر' }]);

    env.reset();
    const note = await runEvalTask(t01, registry, env.deps);
    expect(isTaskSuccess(note)).toBe(true);
    expect(env.state.notes).toHaveLength(1);
    expect(env.state.notes[0].title).toBe('أتصل على أبوي');

    env.reset();
    const call = await runEvalTask(t62, registry, env.deps);
    expect(isTaskSuccess(call)).toBe(true);
    expect(env.state.callsDialled).toEqual(['0500000000']);
    // The read-only search never ran: the goal already carried the number.
    expect(env.state.smsDrafts).toHaveLength(0);
  });

  it('measures deterministic latency off the injected clock', async () => {
    const clock = makeEvalClock(120);
    const env = makeEvalEnvironment();
    const registry = makeAllTools(env.deps);
    const t21 = BENCHMARK_TASKS.find((t) => t.id === 't21')!; // one tool
    const llm = scriptedModelFor(t21, EVAL_ARG_TEMPLATES, { tick: clock.tick });
    const result = await runEvalTask(t21, registry, env.deps, { llm, now: clock.now });
    // plan + 1 act call + answer = 3 scripted calls × 120ms.
    expect(result.elapsedMs).toBe(360);
  });

  it('flags a mutating misfire when the plan cancels what it should create', async () => {
    const env = makeEvalEnvironment();
    const registry = makeAllTools(env.deps);
    const t21 = BENCHMARK_TASKS.find((t) => t.id === 't21')!; // expects reminders.create
    const rogue = scriptedModelFor(t21, EVAL_ARG_TEMPLATES, {
      planOverride: [
        { title: 'ألغِ التذكير', tool: 'reminders.cancel', detail: '' },
        { title: 'ألخّص', tool: null, detail: '' },
      ],
    });
    const result = await runEvalTask(t21, registry, env.deps, { llm: rogue });
    expect(result.planJsonValid).toBe(true);
    expect(result.misfires).toEqual(['reminders.cancel']);
    expect(result.toolAccuracy).toBe(0);
    expect(isTaskSuccess(result)).toBe(false);
    // Even the rogue call waited for its confirmation card first.
    expect(result.confirmationCompliant).toBe(true);
    // And the cancellation really did run (auto-approved, as the harness does).
    expect(env.state.cancelledReminders).toEqual(['r_seed']);
  });

  it('aggregates a nonzero misfire rate across a poisoned suite', async () => {
    const poisoned = BENCHMARK_TASKS.filter((t) => t.id === 't21' || t.id === 't31');
    const report = await runEvalSuite({
      tasks: poisoned,
      llmFor: (task) =>
        task.id === 't21'
          ? scriptedModelFor(task, EVAL_ARG_TEMPLATES, {
              planOverride: [
                { title: 'ألغِ التذكير', tool: 'reminders.cancel', detail: '' },
                { title: 'ألخّص', tool: null, detail: '' },
              ],
            })
          : scriptedModelFor(task),
    });
    expect(report.tasks).toHaveLength(2);
    expect(report.misfireRate).toBe(0.5);
    expect(report.successRate).toBe(0.5);
  });

  it('treats extra read-only calls as accuracy loss, not misfires', async () => {
    const env = makeEvalEnvironment();
    const registry = makeAllTools(env.deps);
    const t21 = BENCHMARK_TASKS.find((t) => t.id === 't21')!;
    const chatty = scriptedModelFor(t21, EVAL_ARG_TEMPLATES, {
      planOverride: [
        { title: 'ألخّص وقت', tool: 'time.now', detail: '' },
        { title: 'ذكّرني', tool: 'reminders.create', detail: '' },
        { title: 'ألخّص', tool: null, detail: '' },
      ],
    });
    const result = await runEvalTask(t21, registry, env.deps, { llm: chatty });
    expect(result.misfires).toEqual([]);
    expect(result.extraTools).toBe(1);
    expect(result.toolAccuracy).toBe(1);
    expect(isTaskSuccess(result)).toBe(false);
  });

  it('formats a readable report for the phase document', async () => {
    const report = await runEvalSuite({ model: 'scripted-perfect', tasks: BENCHMARK_TASKS.slice(0, 8) });
    const text = formatEvalReport(report);
    expect(text).toContain('Model: scripted-perfect');
    expect(text).toContain('Success rate: 100%');
    expect(text).toContain('Misfire rate: 0%');
    expect(text).toContain('Confirmation compliance: 100%');
    expect(text).toContain('note-write');
  });
});
