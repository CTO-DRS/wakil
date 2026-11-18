// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Planner: builds the three prompt families the agent loop needs (plan, act,
 * answer) and parses/validates the model's structured output against the
 * registry. Parsing is strict — the grammar makes valid output likely, and
 * this layer guarantees only sane plans and calls survive.
 */

import type { Language } from '../types';
import type { EngineMessage } from '../llm/engine';
import { renderToolCatalog } from './registry';
import { validateArgs } from './schema';
import type { AgentLimits, PlanStep, ToolDefinition } from './types';

export const PLAN_MAX_TOKENS = 512;
export const ACT_MAX_TOKENS = 256;
export const ANSWER_MAX_TOKENS = 700;
export const PLAN_TEMPERATURE = 0.2;
export const ACT_TEMPERATURE = 0.1;
export const ANSWER_TEMPERATURE = 0.6;

export const TITLE_MAX = 120;
export const DETAIL_MAX = 400;

const LIMITS_TEXT_AR = 'لا تتجاوز ست خطوات، واختر الأدوات من القائمة فقط.';
const LIMITS_TEXT_EN = 'Use at most six steps and choose tools from the list only.';

/** Builds the plan prompt: identity, rules, catalog, known context, and the goal itself. */
export function buildPlanMessages(
  goal: string,
  tools: readonly ToolDefinition[],
  locale: Language,
  context?: readonly string[],
): EngineMessage[] {
  const catalog = renderToolCatalog(tools, locale);
  const system =
    locale === 'ar'
      ? [
          'أنت «رفيق»، وكيل ذكي يعمل بالكامل على الهاتف دون إنترنت.',
          'مهمتك: تحويل طلب المستخدم إلى خطة قصيرة من خطوات واضحة.',
          LIMITS_TEXT_AR,
          'لكل خطوة: اختر أداة من القائمة، أو null إذا كانت الخطوة صياغة الجواب النهائي فقط.',
          'اكتب العناوين بالعربية بأسلوب سعودي واضح.',
          'أعد JSON فقط بهذا الشكل: {"steps":[{"title":"...","tool":"...","detail":"..."}]}',
        ].join(' ')
      : [
          'You are Rafeeq, an AI agent that runs fully offline on the phone.',
          'Your task: turn the user request into a short plan of clear steps.',
          LIMITS_TEXT_EN,
          'Each step picks one tool from the list, or null when the step is only composing the final answer.',
          'Return JSON only, in this shape: {"steps":[{"title":"...","tool":"...","detail":"..."}]}',
        ].join(' ');
  const contextBlock = context && context.length > 0
    ? `${locale === 'ar' ? 'معلومات معروفة عن المستخدم (من ذاكرته المحلية)' : 'Known facts about the user (from local memory)'}:\n${context.join('\n')}\n\n`
    : '';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${contextBlock}${locale === 'ar' ? 'الأدوات المتاحة' : 'Available tools'}:\n${catalog}\n\n${locale === 'ar' ? 'الطلب' : 'Request'}: ${goal}` },
  ];
}

export type PlanParse =
  | { ok: true; steps: PlanStep[] }
  | { ok: false; error: string };

/**
 * Parses the plan JSON: every step needs a non-empty title, a detail line and
 * either a registered tool or null; the total is capped at maxPlanSteps and
 * at least one step must survive.
 */
export function parsePlan(text: string, tools: readonly ToolDefinition[], limits: AgentLimits): PlanParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'PLAN_NOT_JSON' };
  }
  const body = parsed as { steps?: unknown };
  if (!body || typeof body !== 'object' || !Array.isArray(body.steps)) {
    return { ok: false, error: 'PLAN_NO_STEPS' };
  }
  if (body.steps.length === 0) return { ok: false, error: 'PLAN_EMPTY' };
  if (body.steps.length > limits.maxPlanSteps) return { ok: false, error: 'PLAN_TOO_LONG' };
  const steps: PlanStep[] = [];
  for (let i = 0; i < body.steps.length; i++) {
    const raw = body.steps[i] as { title?: unknown; tool?: unknown; detail?: unknown };
    const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
    const detail = typeof raw?.detail === 'string' ? raw.detail.trim() : '';
    const tool = typeof raw?.tool === 'string' ? raw.tool : null;
    if (!title) return { ok: false, error: `STEP_${i}_NO_TITLE` };
    if (title.length > TITLE_MAX) return { ok: false, error: `STEP_${i}_TITLE_TOO_LONG` };
    if (tool !== null && !tools.some((t) => t.name === tool)) return { ok: false, error: `STEP_${i}_UNKNOWN_TOOL` };
    if (detail.length > DETAIL_MAX) return { ok: false, error: `STEP_${i}_DETAIL_TOO_LONG` };
    steps.push({
      id: `s${i + 1}`,
      title: title.slice(0, TITLE_MAX),
      tool,
      detail: detail.slice(0, DETAIL_MAX),
    });
  }
  return { ok: true, steps };
}

export interface Observation {
  stepTitle: string;
  tool: string | null;
  text: string;
}

/** Renders prior observations for the act/answer prompts, oldest first. */
export function renderObservations(observations: readonly Observation[]): string {
  if (observations.length === 0) return '';
  return observations
    .map((o, i) => `${i + 1}. ${o.stepTitle}${o.tool ? ` (${o.tool})` : ''} → ${o.text}`)
    .join('\n');
}

/** Builds the act prompt for one step: goal, plan, prior observations, and the tool contract. */
export function buildActMessages(
  goal: string,
  steps: readonly PlanStep[],
  step: PlanStep,
  observations: readonly Observation[],
  tool: ToolDefinition,
  locale: Language,
): EngineMessage[] {
  const catalog = renderToolCatalog([tool], locale);
  const required = tool.parameters.required.length
    ? tool.parameters.required.join(', ')
    : locale === 'ar'
      ? 'لا شيء'
      : 'none';
  const system =
    locale === 'ar'
      ? [
          'أنت «رفيق» تنفّذ خطوة واحدة من الخطة باستخدام الأداة المحددة.',
          'أعد JSON فقط بهذا الشكل: {"tool":"<اسم الأداة>","arguments":{...}}',
          `المدخلات الإلزامية: ${required}. لا تخترع مدخلات غير موجودة في العقد.`,
        ].join(' ')
      : [
          'You are Rafeeq executing exactly one plan step with the given tool.',
          'Return JSON only: {"tool":"<tool name>","arguments":{...}}',
          `Required arguments: ${required}. Never invent arguments outside the contract.`,
        ].join(' ');
  const planText = steps.map((s, i) => `${i + 1}. ${s.title} → ${s.tool ?? 'answer'}`).join('\n');
  const observed = renderObservations(observations);
  const user = [
    `${locale === 'ar' ? 'الطلب الأصلي' : 'Original request'}: ${goal}`,
    `${locale === 'ar' ? 'الخطة' : 'Plan'}:\n${planText}`,
    observed ? `${locale === 'ar' ? 'نتائج سابقة' : 'Earlier results'}:\n${observed}` : '',
    `${locale === 'ar' ? 'نفّذ الآن الخطوة' : 'Now execute step'}: ${step.title}${step.detail ? ` — ${step.detail}` : ''}`,
    `${locale === 'ar' ? 'الأداة' : 'Tool'}:\n${catalog}`,
  ]
    .filter((part) => part.length > 0)
    .join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export type ToolCallParse =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

/** Parses and validates one tool-call envelope against the fixed tool. */
export function parseToolCall(text: string, tool: ToolDefinition): ToolCallParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'CALL_NOT_JSON' };
  }
  const body = parsed as { tool?: unknown; arguments?: unknown };
  if (!body || typeof body !== 'object') return { ok: false, error: 'CALL_NOT_OBJECT' };
  if (body.tool !== tool.name) return { ok: false, error: 'CALL_WRONG_TOOL' };
  const check = validateArgs(tool.parameters, body.arguments);
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, args: (body.arguments ?? {}) as Record<string, unknown> };
}

/** Builds the final free-text answer prompt from the goal and every observation. */
export function buildAnswerMessages(
  goal: string,
  steps: readonly PlanStep[],
  observations: readonly Observation[],
  locale: Language,
  context?: readonly string[],
): EngineMessage[] {
  const system =
    locale === 'ar'
      ? [
          'أنت «رفيق». اكتب جوابًا نهائيًا قصيرًا وواضحًا بالعربية (أسلوب سعودي).',
          'اعتمد فقط على النتائج المذكورة أدناه ولا تخترع معلومات.',
          'اذكر ما تم إنجازه فعلاً وما فشل إن وُجد.',
        ].join(' ')
      : [
          'You are Rafeeq. Write a short, clear final answer in English.',
          'Rely only on the results below; never invent information.',
          'State what was actually done and what failed, if anything.',
        ].join(' ');
  const planText = steps.map((s, i) => `${i + 1}. ${s.title} → ${s.tool ?? 'answer'}`).join('\n');
  const user = [
    `${locale === 'ar' ? 'الطلب' : 'Request'}: ${goal}`,
    planText ? `${locale === 'ar' ? 'الخطة المنفذة' : 'Executed plan'}:\n${planText}` : '',
    observations.length > 0
      ? `${locale === 'ar' ? 'النتائج' : 'Results'}:\n${renderObservations(observations)}`
      : locale === 'ar'
        ? 'لم تُنفّذ أي خطوات.'
        : 'No steps were executed.',
    context && context.length > 0 ? `${locale === 'ar' ? 'معلومات معروفة عن المستخدم' : 'Known facts about the user'}:\n${context.join('\n')}` : '',
  ].filter((part) => part.length > 0).join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
