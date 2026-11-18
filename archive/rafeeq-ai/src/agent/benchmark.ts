// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The model benchmark harness: runs the golden task set against a candidate
 * model through the same plan prompt + grammar the agent loop uses, and
 * reports the numbers the model-selection document is built on:
 *   - plan JSON validity (grammar + parser acceptance)
 *   - tool-choice accuracy (ordered coverage of the expected tools)
 *   - plan latency (mean / p95) straight off an injectable clock
 *
 * On CI/tests it runs against a scripted client; on the target phone it runs
 * against each candidate GGUF loaded through the real engine (see
 * docs/agent-model-benchmark.md for the device procedure).
 */

import type { Language } from '../types';
import type { AgentLlm } from './llm';
import { PLAN_MAX_TOKENS, PLAN_TEMPERATURE, buildPlanMessages, parsePlan } from './planner';
import type { ToolRegistry } from './registry';
import { buildPlanGrammar } from './grammar';
import { DEFAULT_AGENT_LIMITS, resolveLimits, type AgentLimits } from './types';

export interface BenchmarkTask {
  id: string;
  goal: string;
  locale: Language;
  expectedTools: readonly string[];
}

export interface BenchmarkTaskResult {
  taskId: string;
  /** The parser accepted the plan JSON. */
  planJsonValid: boolean;
  /** Ordered coverage of expected tools (|correct prefix matches| / |expected|). */
  toolAccuracy: number;
  /** Extra tools called beyond the expected set (0 is best). */
  extraTools: number;
  stepsPlanned: number;
  latencyMs: number;
}

export interface BenchmarkReport {
  candidates: string;
  tasks: BenchmarkTaskResult[];
  planJsonValidRate: number;
  meanToolAccuracy: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  /** Total benchmark wall-clock across tasks. */
  totalMs: number;
}

/**
 * Ordered-coverage score: walks the planned tool sequence against the
 * expected one; each expected tool matched in order (skipping extras) scores,
 * then the score is normalized by the expected count. Extras are planned calls
 * naming a tool that was never expected at all.
 */
export function toolSequenceAccuracy(planned: readonly string[], expected: readonly string[]): { accuracy: number; extras: number } {
  if (expected.length === 0) return { accuracy: planned.length === 0 ? 1 : 0, extras: planned.length };
  let matched = 0;
  let cursor = 0;
  for (const tool of planned) {
    if (cursor < expected.length && tool === expected[cursor]) {
      matched += 1;
      cursor += 1;
    }
  }
  const expectedSet = new Set(expected);
  const extras = planned.filter((tool) => !expectedSet.has(tool)).length;
  return { accuracy: matched / expected.length, extras };
}

export async function runAgentBenchmark(
  candidate: string,
  llm: AgentLlm,
  tools: ToolRegistry,
  tasks: readonly BenchmarkTask[],
  opts: { limits?: Partial<AgentLimits>; now?: () => number } = {},
): Promise<BenchmarkReport> {
  const limits = resolveLimits(opts.limits ?? { maxLlmCalls: tasks.length * 4, totalTimeoutMs: Infinity });
  const clock = opts.now ?? (() => Date.now());
  const registry = tools.list();
  const grammar = buildPlanGrammar(registry.map((t) => t.name));
  const results: BenchmarkTaskResult[] = [];
  const totalStart = clock();

  for (const task of tasks) {
    const messages = buildPlanMessages(task.goal, registry, task.locale);
    const startedAt = clock();
    let planJsonValid = false;
    let plannedTools: string[] = [];
    let stepsPlanned = 0;
    try {
      const { text } = await llm.complete(messages, {
        temperature: PLAN_TEMPERATURE,
        maxTokens: PLAN_MAX_TOKENS,
        grammar,
        timeoutMs: limits.llmTimeoutMs,
      });
      const parsed = parsePlan(text, registry, limits);
      if (parsed.ok) {
        planJsonValid = true;
        stepsPlanned = parsed.steps.length;
        plannedTools = parsed.steps.map((s) => s.tool).filter((t): t is string => typeof t === 'string');
      }
    } catch {
      planJsonValid = false;
    }
    const { accuracy, extras } = toolSequenceAccuracy(plannedTools, task.expectedTools);
    results.push({
      taskId: task.id,
      planJsonValid,
      toolAccuracy: accuracy,
      extraTools: extras,
      stepsPlanned,
      latencyMs: Math.max(0, clock() - startedAt),
    });
  }

  const validCount = results.filter((r) => r.planJsonValid).length;
  const latencies = [...results.map((r) => r.latencyMs)].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
  return {
    candidates: candidate,
    tasks: results,
    planJsonValidRate: results.length > 0 ? validCount / results.length : 0,
    meanToolAccuracy: results.length > 0 ? results.reduce((sum, r) => sum + r.toolAccuracy, 0) / results.length : 0,
    avgLatencyMs: results.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    p95LatencyMs: latencies[p95Index] ?? 0,
    totalMs: Math.max(0, clock() - totalStart),
  };
}

/** Guard so imports of the limits default stay honest in future callers. */
export const BENCHMARK_DEFAULT_LIMITS = DEFAULT_AGENT_LIMITS;
