// Copyright (c) 2026 DRS AI. All rights reserved.
import { runAgentBenchmark, toolSequenceAccuracy } from '../src/agent/benchmark';
import type { AgentLlm } from '../src/agent/llm';
import { makeAllTools } from '../src/agent/tools/all';
import { BENCHMARK_TASKS } from '../src/agent/eval/tasks';

/** Pops one scripted plan per task, in benchmark order. */
function queueLLM(plans: string[]): AgentLlm {
  const queue = [...plans];
  return {
    async complete() {
      const next = queue.shift();
      if (next === undefined) throw new Error('SCRIPT_EXHAUSTED');
      return { text: next };
    },
  };
}

function plansForTasks(render: (task: (typeof BENCHMARK_TASKS)[number]) => string): string[] {
  return BENCHMARK_TASKS.map(render);
}

describe('toolSequenceAccuracy', () => {
  it.each([
    { name: 'an exact ordered match scores 1', planned: ['time.now', 'notes.create'], expected: ['time.now', 'notes.create'], accuracy: 1, extras: 0 },
    { name: 'a reordered plan scores partially', planned: ['notes.create', 'time.now'], expected: ['time.now', 'notes.create'], accuracy: 0.5, extras: 0 },
    { name: 'a missing tool lowers the score', planned: ['time.now'], expected: ['time.now', 'notes.create'], accuracy: 0.5, extras: 0 },
    { name: 'extra tools are counted separately', planned: ['time.now', 'notes.list', 'notes.create'], expected: ['time.now', 'notes.create'], accuracy: 1, extras: 1 },
    { name: 'an empty plan against an empty expectation is perfect', planned: [], expected: [], accuracy: 1, extras: 0 },
    { name: 'an empty plan against an expectation scores zero', planned: [], expected: ['time.now'], accuracy: 0, extras: 0 },
  ])('$name', ({ planned, expected, accuracy, extras }) => {
    const result = toolSequenceAccuracy(planned, expected);
    expect(result.accuracy).toBeCloseTo(accuracy);
    expect(result.extras).toBe(extras);
  });
});

describe('runAgentBenchmark', () => {
  // The benchmark only plans — no tool runs — so fakes are enough.
  const registry = makeAllTools({
    reminderIO: {
      requestPermissions: async () => true,
      scheduleOneshot: async () => 'test-id',
      cancel: async () => undefined,
    },
    getLocation: async () => ({ lat: 24.7136, lng: 46.6753 }),
  });

  it('scores a perfect scripted model at 1.0 across every task', async () => {
    const plans = plansForTasks((task) =>
      JSON.stringify({ steps: task.expectedTools.map((tool, i) => ({ title: `خطوة ${i + 1}`, tool, detail: '' })) }),
    );
    let clock = 0;
    const report = await runAgentBenchmark('scripted-perfect', queueLLM(plans), registry, BENCHMARK_TASKS, {
      now: () => {
        clock += 100;
        return clock;
      },
    });
    expect(report.planJsonValidRate).toBe(1);
    expect(report.meanToolAccuracy).toBeCloseTo(1);
    expect(report.avgLatencyMs).toBe(100);
    expect(report.tasks).toHaveLength(BENCHMARK_TASKS.length);
    expect(report.totalMs).toBeGreaterThan(0);
  });

  it('counts invalid plans as zeros instead of throwing', async () => {
    const plans = plansForTasks(() => 'نص عادي');
    const report = await runAgentBenchmark('scripted-broken', queueLLM(plans), registry, BENCHMARK_TASKS, { now: () => 5 });
    expect(report.planJsonValidRate).toBe(0);
    expect(report.meanToolAccuracy).toBe(0);
    expect(report.p95LatencyMs).toBe(0);
  });

  it('measures latency spread with p95 above the mean', async () => {
    const plans = plansForTasks((task) =>
      JSON.stringify({ steps: [{ title: 's', tool: task.expectedTools[0], detail: '' }] }),
    );
    let clock = 0;
    const report = await runAgentBenchmark('latency', queueLLM(plans), registry, BENCHMARK_TASKS, {
      now: () => {
        clock += 10;
        return clock;
      },
    });
    expect(report.p95LatencyMs).toBeGreaterThanOrEqual(report.avgLatencyMs);
    expect(report.tasks.every((t) => t.planJsonValid)).toBe(true);
  });
});
