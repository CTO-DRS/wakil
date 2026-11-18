// Copyright (c) 2026 DRS AI. All rights reserved.
import { stripStopWords, type EngineMessage } from '../llm/engine';
import { fitMessages } from '../llm/prompt';
import type { ChatMessage } from '../types';

/**
 * The summarizing memory keeps long conversations connected: everything the
 * context window has to drop is distilled into a rolling summary stored on
 * the conversation, and every later turn re-reads it inside the system
 * prompt. The summary is regenerated once enough NEW turns fell out of the
 * window — so the cost stays a rare, small background pass instead of one
 * after every turn.
 */

/** New out-of-context turns needed before the summary is regenerated. */
export const SUMMARY_NEW_MESSAGES = 8;
/** Small budget: a summary is one paragraph, not an essay. */
export const SUMMARY_MAX_TOKENS = 200;
/** Low temperature: facts over creativity. */
export const SUMMARY_TEMPERATURE = 0.3;
/** Runaway guard on the stored summary itself. */
export const SUMMARY_MAX_CHARS = 1200;
/** The summarizer reads the newest of the covered turns, capped, from the end. */
export const SUMMARY_INPUT_MAX_CHARS = 3000;

export const SUMMARY_SYSTEM_PROMPT =
  'You maintain a running memory for a chat app. Summarize the conversation so far in at most 120 words. Keep names, facts, decisions, open questions and what the user is trying to achieve. Write the summary in the same language the conversation uses. Output only the summary text and nothing else.';

export const SUMMARY_INSTRUCTION = 'Output the summary now.';

/**
 * How many of the earliest usable messages would NOT fit in the context
 * window for a turn built from this history. Purely arithmetic — shares the
 * exact budget of the real prompt builder through fitMessages.
 */
export function countDroppedMessages(history: ChatMessage[], nCtx: number, maxTokens: number, systemPrompt: string): number {
  return fitMessages(history, systemPrompt, nCtx, maxTokens).dropped;
}

/**
 * Whether a new summary pass is due: enough turns beyond the already-covered
 * prefix have fallen out of the window. A negative gap (history shrank after
 * an edit or a regenerate) never triggers; the stale coverage simply waits
 * for the window to overflow again.
 */
export function shouldSummarize(dropped: number, covered: number | null | undefined): boolean {
  const c = Math.max(0, covered ?? 0);
  return dropped > c && dropped - c >= SUMMARY_NEW_MESSAGES;
}

/**
 * Merges the rolling summary into the effective system prompt: one system
 * message total, so strict chat templates keep working. An empty summary
 * leaves the prompt untouched (trimmed).
 */
export function withSummary(systemPrompt: string, summary: string | null | undefined): string {
  const base = systemPrompt.trim();
  const clean = summary?.trim();
  if (!clean) return base;
  return base ? `${base}\n\n[Earlier in this conversation]\n${clean}` : `[Earlier in this conversation]\n${clean}`;
}

/**
 * Builds the side prompt for a summary pass: fixed instructions, then one
 * user turn carrying the previous summary (so the memory rolls forward) plus
 * the uncovered turns, capped from the end so a huge backlog cannot blow the
 * small budget.
 */
export function buildSummaryMessages(previous: string | null, turns: EngineMessage[]): EngineMessage[] {
  const label = (role: EngineMessage['role']) => (role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : 'System');
  let fresh = '';
  for (let i = turns.length - 1; i >= 0; i--) {
    const line = `${label(turns[i].role)}: ${turns[i].content}`;
    if (fresh && fresh.length + line.length + 1 > SUMMARY_INPUT_MAX_CHARS) break;
    fresh = fresh ? `${line}\n${fresh}` : line;
  }
  const prev = previous?.trim();
  const body = prev
    ? `Summary so far:\n${prev}\n\nNew turns since that summary:\n${fresh}`
    : `Conversation so far:\n${fresh}`;
  return [
    { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
    { role: 'user', content: `${body}\n\n${SUMMARY_INSTRUCTION}` },
  ];
}

/**
 * Turns one raw engine pass into a storable summary: trailing stop markers
 * are stripped, empty output and repeats of the previous summary are
 * rejected, and the text is capped. Returns null when the pass is unusable.
 */
export function sanitizeSummary(raw: string, previous: string | null): string | null {
  const text = stripStopWords(raw);
  if (!text) return null;
  const capped = text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS).trimEnd()}…` : text;
  if (previous && previous.trim() === capped.trim()) return null;
  return capped;
}
