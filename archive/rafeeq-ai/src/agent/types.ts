// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The agent's shared vocabulary: tool definitions, plans, events and limits.
 * Everything here is pure data — the loop (loop.ts), the planner (planner.ts)
 * and the UI (components/agent) all speak these types.
 */

/** Coarse bucket of what a tool touches; drives grouping in the catalog. */
export type ToolCategory = 'time' | 'device' | 'notes' | 'memory' | 'communication' | 'productivity' | 'system';

/** Parameter types the mini grammar can constrain. Kept deliberately small. */
export type ToolParamType = 'string' | 'number' | 'integer' | 'boolean';

export interface ToolParam {
  type: ToolParamType;
  /** Human-readable description shown in the tool catalog prompt. */
  description: string;
  /** Closed set of allowed values; rendered as a GBNF literal alternation. */
  enum?: readonly string[];
  /** For array-typed parameters, the element type. */
  items?: ToolParam;
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, ToolParam>;
  /** Property names the model MUST provide; the grammar locks their order. */
  required: readonly string[];
}

export interface ToolResult {
  ok: boolean;
  /** Human-readable observation fed back to the model and shown in the plan card. */
  data?: string;
  error?: string;
}

export interface ToolContext {
  locale: 'ar' | 'en';
  now: () => Date;
  /** The currently loaded chat model, when one is loaded. */
  model: { id: string; name: string } | null;
}

export interface ToolDefinition {
  /** Dotted, lowercase, ASCII identifier (e.g. `notes.create`) — a grammar literal. */
  name: string;
  descriptionAr: string;
  descriptionEn: string;
  category: ToolCategory;
  /**
   * Mutating tools change something on the device; the loop must obtain an
   * explicit user confirmation (confirmation.ts) before running them.
   * Read-only tools run directly.
   */
  mutating: boolean;
  parameters: ToolSchema;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlanStep {
  id: string;
  /** Short imperative title shown on the plan card. */
  title: string;
  /** Tool to call, or null for a "compose the answer" step. */
  tool: string | null;
  /** One-line explanation of why this step exists. */
  detail: string;
}

export interface AgentPlan {
  goal: string;
  steps: PlanStep[];
  createdAt: number;
}

export type StepStatus = 'pending' | 'confirming' | 'running' | 'done' | 'failed' | 'skipped';

/** The user's decision on the visible plan: run (possibly trimmed) or cancel. */
export type PlanDecision = { action: 'run'; keepStepIds?: string[] } | { action: 'cancel' };

// ---------------------------------------------------------------------------
// Events — the loop's observable trace, consumed by the store and the UI
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: 'plan-proposed'; plan: AgentPlan }
  | { type: 'plan-approved'; plan: AgentPlan }
  | { type: 'step-started'; stepId: string }
  | { type: 'confirmation-required'; stepId: string; tool: string; args: Record<string, unknown> }
  | { type: 'step-finished'; stepId: string; status: StepStatus; result: ToolResult | null }
  | { type: 'plan-finished'; answer: string | null }
  | { type: 'agent-cancelled' }
  | { type: 'agent-failed'; error: string };

export type AgentOutcomeStatus = 'done' | 'failed' | 'cancelled';

export interface AgentStepTrace {
  id: string;
  title: string;
  tool: string | null;
  status: StepStatus;
  resultText: string | null;
}

export interface AgentOutcome {
  status: AgentOutcomeStatus;
  /** Final spoken answer; null when the agent failed before composing one. */
  answer: string | null;
  steps: AgentStepTrace[];
  error: string | null;
  /** Structured LLM/completion calls spent (plan + acts + answer). */
  llmCalls: number;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Limits — the guard rails that guarantee the loop always terminates
// ---------------------------------------------------------------------------

export interface AgentLimits {
  /** Hard cap on plan steps accepted from the model. */
  maxPlanSteps: number;
  /** Hard cap on executed steps per run. */
  maxSteps: number;
  /** Hard cap on LLM calls (plan + every act retry + answer). */
  maxLlmCalls: number;
  /** Wall-clock budget for one LLM call. */
  llmTimeoutMs: number;
  /** Wall-clock budget for one tool run. */
  toolTimeoutMs: number;
  /** Wall-clock budget for the whole run (plan + steps + answer). */
  totalTimeoutMs: number;
  /** Retries allowed per act call when the model emits invalid JSON. */
  maxRetriesPerStep: number;
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxPlanSteps: 6,
  maxSteps: 8,
  maxLlmCalls: 14,
  llmTimeoutMs: 45_000,
  toolTimeoutMs: 20_000,
  totalTimeoutMs: 150_000,
  maxRetriesPerStep: 1,
};

/** Merges a partial override over the defaults (tests and future settings). */
export function resolveLimits(partial?: Partial<AgentLimits>): AgentLimits {
  return { ...DEFAULT_AGENT_LIMITS, ...(partial ?? {}) };
}
