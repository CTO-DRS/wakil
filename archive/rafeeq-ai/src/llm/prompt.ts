// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage } from '../types';
import type { EngineMessage } from './engine';

/** Very rough chars-per-token budget that works for mixed Arabic/English text. */
export const CHARS_PER_TOKEN = 3;

/**
 * Picks as much recent history as fits in the context window after reserving
 * room for the reply, and reports how many of the earliest usable messages
 * did NOT fit. The summarizing memory (utils/summary) covers exactly that
 * dropped prefix, so the two must share one budget arithmetic — this is the
 * single source of truth.
 */
export function fitMessages(
  history: ChatMessage[],
  systemPrompt: string,
  nCtx: number,
  maxTokens: number,
): { picked: EngineMessage[]; dropped: number } {
  const usable = history.filter((m) => m.role !== 'system' && m.content.trim().length > 0);
  // Clamp at 0: a short context with large maxTokens (or a long system prompt) can drive
  // the naive arithmetic below negative, which would corrupt the trimming loop.
  const budgetChars = Math.max(0, Math.max(256, (nCtx - maxTokens) * CHARS_PER_TOKEN) - systemPrompt.length);
  const picked: EngineMessage[] = [];
  let used = 0;
  for (let i = usable.length - 1; i >= 0; i--) {
    const m = usable[i];
    const cost = m.content.length + 16;
    if (picked.length > 0 && used + cost > budgetChars) break;
    picked.unshift({ role: m.role, content: m.content });
    used += cost;
  }
  // Templates generally expect the first non-system turn to be from the user.
  while (picked.length > 1 && picked[0].role !== 'user') picked.shift();
  const dropped = usable.length - picked.length;
  return { picked, dropped };
}

/**
 * Builds the message list sent to the model: system prompt + as much recent history as
 * fits in the context window after reserving room for the reply. The newest user message
 * is always kept.
 */
export function buildPromptMessages(
  history: ChatMessage[],
  systemPrompt: string,
  nCtx: number,
  maxTokens: number,
): EngineMessage[] {
  const { picked } = fitMessages(history, systemPrompt, nCtx, maxTokens);
  const sys = systemPrompt.trim();
  return sys ? [{ role: 'system', content: sys }, ...picked] : picked;
}
