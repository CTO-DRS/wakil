// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The agent loop: goal → grammar-constrained plan → visible plan (user may
 * edit/cancel) → step execution (confirmation card before every mutating
 * tool) → observation → final answer. Every stage is bounded: LLM call caps,
 * per-call and per-tool wall-clock budgets, an overall deadline, and one
 * retry per structured call — the loop can never spin forever.
 */

import type { Language } from '../types';
import { requiresConfirmation } from './confirmation';
import { buildPlanGrammar, buildSingleToolCallGrammar } from './grammar';
import type { AgentLlm } from './llm';
import {
  ACT_MAX_TOKENS,
  ACT_TEMPERATURE,
  ANSWER_MAX_TOKENS,
  ANSWER_TEMPERATURE,
  PLAN_MAX_TOKENS,
  PLAN_TEMPERATURE,
  buildActMessages,
  buildAnswerMessages,
  buildPlanMessages,
  parsePlan,
  parseToolCall,
  type Observation,
} from './planner';
import type { ToolRegistry } from './registry';
import {
  resolveLimits,
  type AgentEvent,
  type AgentLimits,
  type AgentOutcome,
  type AgentPlan,
  type AgentStepTrace,
  type PlanDecision,
  type PlanStep,
  type StepStatus,
  type ToolContext,
  type ToolDefinition,
  type ToolResult,
} from './types';

export type { PlanDecision };

export interface AgentDeps {
  llm: AgentLlm;
  tools: ToolRegistry;
  locale: Language;
  model: { id: string; name: string } | null;
  onEvent: (event: AgentEvent) => void;
  limits?: Partial<AgentLimits>;
  now?: () => number;
  /**
   * Optional retrieval hook: returns the known-context lines (from local
   * memory) for a goal, injected into the plan and answer prompts so plans
   * can lean on what the agent already knows about the user. Bounded by the
   * caller; empty means nothing worth injecting.
   */
  knownContext?: (goal: string) => readonly string[];
  /**
   * Streams answer deltas as they are generated (voice-first: the spoken
   * reply starts on the first complete sentence while the rest generates).
   * Only the final answer streams — plan/act calls emit grammar-constrained
   * JSON that must never reach the speech queue.
   */
  onAnswerToken?: (token: string) => void;
}

/**
 * One agent run per instance. `start()` proposes the plan and resolves only
 * when the run reaches a terminal state (done / failed / cancelled); the UI
 * drives it with `decidePlan` and `decideConfirmation`.
 */
export class AgentRunner {
  private readonly deps: AgentDeps;
  private readonly limits: AgentLimits;
  private readonly clock: () => number;
  private pendingPlanResolve: ((d: PlanDecision) => void) | null = null;
  private readonly pendingConfirmations = new Map<string, (approve: boolean) => void>();
  private cancelled = false;
  private started = false;
  private llmCalls = 0;
  private deadline = Infinity;

  constructor(deps: AgentDeps) {
    this.deps = deps;
    this.limits = resolveLimits(deps.limits);
    this.clock = deps.now ?? (() => Date.now());
  }

  // -- UI entry points ------------------------------------------------------

  /** Approves the proposed plan (optionally trimmed to the kept steps) or cancels it. */
  decidePlan(decision: PlanDecision) {
    if (!this.pendingPlanResolve) return;
    const resolve = this.pendingPlanResolve;
    this.pendingPlanResolve = null;
    resolve(decision);
  }

  /** Approves or skips one mutating step that asked for confirmation. */
  decideConfirmation(stepId: string, approve: boolean) {
    const pending = this.pendingConfirmations.get(stepId);
    if (!pending) return;
    this.pendingConfirmations.delete(stepId);
    pending(approve);
  }

  /** Cancels the run at any point; in-flight LLM work is interrupted best-effort. */
  cancel() {
    this.cancelled = true;
    if (this.pendingPlanResolve) {
      const resolve = this.pendingPlanResolve;
      this.pendingPlanResolve = null;
      resolve({ action: 'cancel' });
    }
    for (const [stepId, pending] of [...this.pendingConfirmations.entries()]) {
      this.pendingConfirmations.delete(stepId);
      pending(false);
    }
    void this.deps.llm.stop?.().catch(() => undefined);
  }

  // -- The loop -------------------------------------------------------------

  async start(goal: string): Promise<AgentOutcome> {
    if (this.started) throw new Error('AGENT_ALREADY_STARTED');
    this.started = true;
    const startedAt = this.clock();
    this.deadline = startedAt + this.limits.totalTimeoutMs;
    const traces = new Map<string, AgentStepTrace>();
    const observations: Observation[] = [];

    const finish = (status: AgentOutcome['status'], answer: string | null, error: string | null): AgentOutcome => ({
      status,
      answer,
      steps: [...traces.values()],
      error,
      llmCalls: this.llmCalls,
      elapsedMs: Math.max(0, this.clock() - startedAt),
    });
    const setTrace = (step: PlanStep, patch: Partial<AgentStepTrace>) => {
      const base = traces.get(step.id) ?? { id: step.id, title: step.title, tool: step.tool, status: 'pending' as StepStatus, resultText: null };
      traces.set(step.id, { ...base, ...patch });
    };

    // 1. Plan (grammar-constrained, bounded retries on invalid output).
    const proposed = await this.proposePlan(goal);
    if (typeof proposed === 'string') {
      this.deps.onEvent({ type: 'agent-failed', error: proposed });
      return finish('failed', null, proposed);
    }
    this.deps.onEvent({ type: 'plan-proposed', plan: proposed });

    // 2. Wait for the visible-plan decision (run with edits, or cancel).
    const decision = await new Promise<PlanDecision>((resolve) => {
      this.pendingPlanResolve = resolve;
    });
    if (this.cancelled || decision.action === 'cancel') {
      this.deps.onEvent({ type: 'agent-cancelled' });
      return finish('cancelled', null, null);
    }
    const executedPlan = this.applyKeepSteps(proposed, decision.keepStepIds);
    this.deps.onEvent({ type: 'plan-approved', plan: executedPlan });
    // The trace follows the plan the user actually approved: dropped steps
    // disappear from the outcome instead of lingering as pending ghosts.
    traces.clear();
    for (const step of executedPlan.steps) setTrace(step, {});

    const ctx: ToolContext = {
      locale: this.deps.locale,
      now: () => new Date(this.clock()),
      model: this.deps.model,
    };

    // 3. Execute the approved steps.
    let executedToolSteps = 0;
    for (const step of executedPlan.steps) {
      if (this.cancelled) {
        this.deps.onEvent({ type: 'agent-cancelled' });
        return finish('cancelled', null, null);
      }
      if (executedToolSteps >= this.limits.maxSteps || this.clock() >= this.deadline || this.llmCalls >= this.limits.maxLlmCalls) {
        break;
      }
      const tool = step.tool ? this.deps.tools.get(step.tool) : undefined;
      if (step.tool && !tool) {
        // parsePlan already rejects unknown tools; defensive only.
        setTrace(step, { status: 'failed', resultText: 'UNKNOWN_TOOL' });
        this.deps.onEvent({ type: 'step-finished', stepId: step.id, status: 'failed', result: null });
        continue;
      }
      if (!tool) {
        // An answer step: nothing to call, the final composition covers it.
        setTrace(step, { status: 'done', resultText: null });
        this.deps.onEvent({ type: 'step-finished', stepId: step.id, status: 'done', result: null });
        continue;
      }

      executedToolSteps += 1;

      // One structured act call decides the arguments (with its bounded retry).
      const args = await this.callWithArgs(goal, executedPlan.steps, step, tool, observations);
      if (this.cancelled) {
        this.deps.onEvent({ type: 'agent-cancelled' });
        return finish('cancelled', null, null);
      }
      if (typeof args === 'string') {
        setTrace(step, { status: 'failed', resultText: args });
        this.deps.onEvent({ type: 'step-finished', stepId: step.id, status: 'failed', result: null });
        observations.push({ stepTitle: step.title, tool: tool.name, text: `${localeFailed(this.deps.locale)}: ${args}` });
        continue;
      }

      // Mutating tools stop for an explicit confirmation card before running.
      if (requiresConfirmation(tool)) {
        setTrace(step, { status: 'confirming' });
        this.deps.onEvent({ type: 'confirmation-required', stepId: step.id, tool: tool.name, args });
        const approved = await new Promise<boolean>((resolve) => {
          this.pendingConfirmations.set(step.id, resolve);
        });
        if (this.cancelled) {
          this.deps.onEvent({ type: 'agent-cancelled' });
          return finish('cancelled', null, null);
        }
        if (!approved) {
          setTrace(step, { status: 'skipped', resultText: null });
          this.deps.onEvent({ type: 'step-finished', stepId: step.id, status: 'skipped', result: null });
          observations.push({ stepTitle: step.title, tool: tool.name, text: localeSkipped(this.deps.locale) });
          continue;
        }
      }

      this.deps.onEvent({ type: 'step-started', stepId: step.id });
      const result = await this.runTool(tool, args, ctx);
      const status: StepStatus = result.ok ? 'done' : 'failed';
      setTrace(step, { status, resultText: result.ok ? (result.data ?? '') : (result.error ?? 'TOOL_ERROR') });
      this.deps.onEvent({ type: 'step-finished', stepId: step.id, status, result });
      observations.push({
        stepTitle: step.title,
        tool: tool.name,
        text: result.ok ? (result.data ?? '') : `${localeFailed(this.deps.locale)}: ${result.error ?? ''}`.trim(),
      });
    }

    // 4. Compose the final answer (free text; deterministic fallback when the
    //    budget ran out or the model produced nothing usable).
    const answer = await this.composeAnswer(goal, executedPlan, observations);
    if (this.cancelled) {
      this.deps.onEvent({ type: 'agent-cancelled' });
      return finish('cancelled', null, null);
    }
    this.deps.onEvent({ type: 'plan-finished', answer });
    return finish('done', answer, null);
  }

  // -- internals ------------------------------------------------------------

  private async proposePlan(goal: string): Promise<AgentPlan | string> {
    const tools = this.deps.tools.list();
    const context = this.deps.knownContext?.(goal) ?? [];
    const messages = buildPlanMessages(goal, tools, this.deps.locale, context);
    const grammar = buildPlanGrammar(tools.map((t) => t.name));
    let lastError = 'PLAN_FAILED';
    for (let attempt = 0; attempt <= this.limits.maxRetriesPerStep; attempt++) {
      if (this.cancelled) return 'CANCELLED';
      if (this.llmCalls >= this.limits.maxLlmCalls || this.clock() >= this.deadline) return 'LLM_BUDGET_EXHAUSTED';
      this.llmCalls += 1;
      try {
        const { text } = await this.deps.llm.complete(messages, {
          temperature: PLAN_TEMPERATURE,
          maxTokens: PLAN_MAX_TOKENS,
          grammar,
          timeoutMs: Math.min(this.limits.llmTimeoutMs, Math.max(1, this.deadline - this.clock())),
        });
        const parsed = parsePlan(text, tools, this.limits);
        if (parsed.ok) {
          return { goal, steps: parsed.steps, createdAt: this.clock() };
        }
        lastError = parsed.error;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    return lastError;
  }

  /** One structured act call for the step's arguments, with its bounded retry. */
  private async callWithArgs(
    goal: string,
    steps: readonly PlanStep[],
    step: PlanStep,
    tool: ToolDefinition,
    observations: readonly Observation[],
  ): Promise<Record<string, unknown> | string> {
    const messages = buildActMessages(goal, steps, step, observations, tool, this.deps.locale);
    const grammar = buildSingleToolCallGrammar(tool);
    let lastError = 'ACT_FAILED';
    for (let attempt = 0; attempt <= this.limits.maxRetriesPerStep; attempt++) {
      if (this.cancelled) return 'CANCELLED';
      if (this.llmCalls >= this.limits.maxLlmCalls || this.clock() >= this.deadline) return 'LLM_BUDGET_EXHAUSTED';
      this.llmCalls += 1;
      try {
        const { text } = await this.deps.llm.complete(messages, {
          temperature: ACT_TEMPERATURE,
          maxTokens: ACT_MAX_TOKENS,
          grammar,
          timeoutMs: Math.min(this.limits.llmTimeoutMs, Math.max(1, this.deadline - this.clock())),
        });
        const parsed = parseToolCall(text, tool);
        if (parsed.ok) return parsed.args;
        lastError = parsed.error;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    return lastError;
  }

  private async runTool(tool: ToolDefinition, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const startedAt = this.clock();
    const budget = Math.max(1, Math.min(this.limits.toolTimeoutMs, this.deadline - startedAt));
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        tool.run(args, ctx),
        new Promise<ToolResult>((_, reject) => {
          timer = setTimeout(() => reject(new Error('TOOL_TIMEOUT')), budget);
        }),
      ]);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async composeAnswer(
    goal: string,
    plan: AgentPlan,
    observations: readonly Observation[],
  ): Promise<string | null> {
    if (this.llmCalls >= this.limits.maxLlmCalls || this.clock() >= this.deadline) {
      return fallbackAnswer(plan.goal, observations, this.deps.locale);
    }
    this.llmCalls += 1;
    try {
      const context = this.deps.knownContext?.(plan.goal) ?? [];
      const { text } = await this.deps.llm.complete(buildAnswerMessages(goal, plan.steps, observations, this.deps.locale, context), {
        temperature: ANSWER_TEMPERATURE,
        maxTokens: ANSWER_MAX_TOKENS,
        timeoutMs: Math.min(this.limits.llmTimeoutMs, Math.max(1, this.deadline - this.clock())),
        onToken: this.deps.onAnswerToken,
      });
      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : fallbackAnswer(plan.goal, observations, this.deps.locale);
    } catch {
      return fallbackAnswer(plan.goal, observations, this.deps.locale);
    }
  }

  private applyKeepSteps(plan: AgentPlan, keepStepIds?: string[]): AgentPlan {
    if (!keepStepIds) return plan;
    const kept = plan.steps.filter((s) => keepStepIds.includes(s.id)).slice(0, this.limits.maxSteps);
    return { ...plan, steps: kept.length > 0 ? kept : plan.steps.slice(0, this.limits.maxSteps) };
  }
}

function localeSkipped(locale: Language): string {
  return locale === 'ar' ? 'تخطّى المستخدم هذه الخطوة.' : 'The user skipped this step.';
}

function localeFailed(locale: Language): string {
  return locale === 'ar' ? 'فشلت الخطوة' : 'Step failed';
}

/** Deterministic answer when the model cannot compose one (budget/time/model failure). */
export function fallbackAnswer(goal: string, observations: readonly Observation[], locale: Language): string {
  if (observations.length === 0) {
    return locale === 'ar' ? 'أنهيت المهمة دون نتائج مسجّلة.' : 'I finished the task with no recorded results.';
  }
  const failedPrefix = localeFailed(locale);
  const failed = observations.filter((o) => o.text.startsWith(failedPrefix) || o.text.startsWith(localeSkipped(locale)));
  const head = locale === 'ar' ? `أنجزت المهمة «${goal}» بالخطوات التالية:` : `I completed “${goal}” with these steps:`;
  const body = observations.map((o, i) => `${i + 1}. ${o.stepTitle}: ${o.text}`).join('\n');
  const tail =
    failed.length === 0
      ? ''
      : locale === 'ar'
        ? '\nبعض الخطوات لم تكتمل.'
        : '\nSome steps did not complete.';
  return `${head}\n${body}${tail}`;
}
