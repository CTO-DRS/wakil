// Copyright (c) 2026 DRS AI. All rights reserved.
import { stripStopWords, type EngineMessage } from '../llm/engine';
import { buildPromptMessages } from '../llm/prompt';
import type { ChatMessage, Role } from '../types';

/** Total variants offered for one reply, including the streamed original. */
export const VARIANT_COUNT = 3;
/** Extra warmth added per variant so the drafts actually differ from each other. */
export const VARIANT_TEMPERATURE_STEP = 0.2;
/** Ceiling for the warmed-up sampling: full replies, not word salad. */
export const VARIANT_MAX_TEMPERATURE = 1.4;
/** Runaway guard: a variant longer than this is broken output and gets dropped. */
export const VARIANT_MAX_CHARS = 6000;
/** How much of each earlier variant the "be different" instruction echoes back. */
const VARIANT_ECHO_CHARS = 160;

/**
 * Sampling temperature for one variant pass: the streamed original used the
 * user's own setting, each extra draft gets progressively warmer sampling so
 * two passes cannot land on the same wording. Result is clamped and rounded
 * to two decimals so it maps cleanly onto engine options.
 */
export function variantTemperature(base: number, index: number): number {
  const raw = Number.isFinite(base) ? base : 0.7;
  const warmed = raw + VARIANT_TEMPERATURE_STEP * index;
  const clamped = Math.min(VARIANT_MAX_TEMPERATURE, Math.max(0, warmed));
  return Math.round(clamped * 100) / 100;
}

/** Fixed per-index phrasing, in English like every fixed side-prompt. */
const VARIANT_INSTRUCTIONS: readonly string[] = [
  '', // index 0 is the streamed reply itself; it is never re-generated here.
  'Write your reply to the conversation again with a clearly different structure or approach to the same request. Reply in the same language the conversation uses. Output only the reply text and nothing else.',
  'Write your reply to the conversation once more, now with a noticeably different tone and level of detail. Reply in the same language the conversation uses. Output only the reply text and nothing else.',
];

const FALLBACK_INSTRUCTION = VARIANT_INSTRUCTIONS[VARIANT_INSTRUCTIONS.length - 1];

/**
 * Builds the trigger turn for one variant pass: the fixed phrasing for this
 * index plus short echoes of every earlier variant, so a small local model
 * can actually steer away from them instead of paraphrasing the same sentence.
 */
export function buildVariantInstruction(previous: string[], index: number): string {
  const base = VARIANT_INSTRUCTIONS[index] ?? FALLBACK_INSTRUCTION;
  const echoes = previous
    .map((p) => p.replace(/\s+/g, ' ').trim().slice(0, VARIANT_ECHO_CHARS))
    .filter((p) => p.length > 0)
    .map((p) => `«${p}»`);
  const avoid = echoes.length > 0 ? ` Avoid repeating these earlier versions: ${echoes.join(' ')}.` : '';
  return `${base}${avoid}`;
}

/**
 * Builds the side prompt for one variant pass: the full chat prompt (persona
 * included — variants must sound like the same assistant) plus the trigger
 * turn that asks for a different version of the last reply.
 */
export function buildVariantMessages(
  history: ChatMessage[],
  systemPrompt: string,
  nCtx: number,
  maxTokens: number,
  previous: string[],
  index: number,
): EngineMessage[] {
  const base = buildPromptMessages(history, systemPrompt, nCtx, maxTokens);
  return [...base, { role: 'user', content: buildVariantInstruction(previous, index) }];
}

/** Collapses whitespace and case so "same wording in different spacing" still matches. */
function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Turns one raw engine pass into a keepable variant: trailing stop markers
 * are stripped, empty or runaway output is dropped, and anything that merely
 * repeats an earlier variant (spacing/case aside) is rejected so the switcher
 * never offers the "same" reply twice. Returns null when the pass is unusable.
 */
export function sanitizeVariant(raw: string, previous: string[]): string | null {
  const text = stripStopWords(raw);
  if (!text) return null;
  if (text.length > VARIANT_MAX_CHARS) return null;
  const key = normalizeForCompare(text);
  if (!key) return null;
  for (const p of previous) {
    if (normalizeForCompare(p) === key) return null;
  }
  return text;
}

/** Engine stats captured alongside one variant (original keeps its own). */
export type VariantStat = { tokensPerSecond: number | null; tokenCount: number | null };

/**
 * Alternate drafts attached to one assistant reply. items[0] is always the
 * persisted reply itself; extras are appended as they are produced. The
 * switcher previews items[activeIndex] in the bubble, and keepVariant only
 * then writes the chosen text over the message — navigating without keeping
 * leaves storage untouched.
 */
export type VariantsState = {
  forMessageId: string;
  items: string[];
  stats: VariantStat[];
  activeIndex: number;
} | null;

export type VariantsUiInput = {
  engineReady: boolean;
  generating: boolean;
  /** The inline rewrite editor is open, so the composer stepped aside. */
  editing: boolean;
  /** A variants pass is running on the engine right now. */
  variantsBusy: boolean;
  variants: VariantsState;
  newestId: string | null;
  newestRole: Role | null;
  newestContent: string;
};

export type VariantsUiState = 'hidden' | 'loading' | 'ready';

/**
 * What the switcher under the newest reply shows: nothing, a loader while
 * extra drafts are being prepared, or the ready switcher — and only while the
 * drafts still belong to the newest reply. A single-item list (every extra
 * pass was rejected as a duplicate) stays hidden.
 */
export function variantsUiState(i: VariantsUiInput): VariantsUiState {
  const newestReady = i.newestRole === 'assistant' && i.newestContent.trim().length > 0;
  if (!i.engineReady || i.generating || i.editing || !newestReady) return 'hidden';
  if (!i.variants || i.variants.forMessageId !== i.newestId) return 'hidden';
  if (i.variantsBusy) return 'loading';
  if (i.variants.items.length > 1) return 'ready';
  return 'hidden';
}
