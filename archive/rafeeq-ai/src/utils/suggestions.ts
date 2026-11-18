// Copyright (c) 2026 DRS AI. All rights reserved.
import type { EngineMessage } from '../llm/engine';
import { buildPromptMessages } from '../llm/prompt';
import type { ChatMessage, Role } from '../types';

/** How many candidate replies the model is asked for. */
export const SUGGESTION_COUNT = 3;
/** Small budget: candidates are one-liners, so the pass stays fast on device. */
export const SUGGESTION_MAX_TOKENS = 140;
/** A candidate longer than this is prose, not a quick reply, and gets dropped. */
export const SUGGESTION_MAX_CHARS = 120;
/** Slightly warmer than chat replies so the choices differ from one another. */
export const SUGGESTION_TEMPERATURE = 0.85;

export const SUGGESTION_SYSTEM_PROMPT =
  'You suggest quick replies inside a chat app. Read the conversation, then output exactly 3 short candidate messages the USER could send next. One candidate per line and nothing else: no numbering, no bullets, no quotes, no explanation. Each candidate is at most 12 words. Write the candidates in the same language the conversation uses.';

export const SUGGESTION_INSTRUCTION = 'Output the 3 candidate messages now.';

/**
 * Builds the side prompt for the suggestions pass: the fixed suggestion
 * instructions as the system role, as much recent history as fits, then the
 * trigger turn. Deliberately does NOT use the conversation persona — the
 * candidates must speak as the user, not as the assistant persona.
 */
export function buildSuggestionMessages(history: ChatMessage[], nCtx: number): EngineMessage[] {
  const trimmed = buildPromptMessages(history, SUGGESTION_SYSTEM_PROMPT, nCtx, SUGGESTION_MAX_TOKENS);
  return [...trimmed, { role: 'user', content: SUGGESTION_INSTRUCTION }];
}

/** "1." "2)" "٢-" bullets and quote-dashes, with or without a trailing space. */
const LIST_MARKER = /^\s*(?:[0-9\u0660-\u0669]{1,2}\s*[.:\-–—)\]]\s*|[•\-*–—#>]+\s*)/u;
/** Wrapping straight/curly/guillemet quotes around a candidate. */
const WRAP_QUOTES = /^[\s"'`«»“”„‘’]+|[\s"'`«»“”„‘’]+$/gu;

/**
 * Turns the raw engine output into clean candidates: strips list markers
 * ("1.", "2)", "٢-", "-", "•"), wrapping quotes and blank lines, drops
 * preamble lines that end in ":", over-long prose and duplicates, and caps
 * the count. Small local models number their lines often, so this parser is
 * the contract that keeps the chips clean.
 */
export function parseSuggestions(raw: string, max: number = SUGGESTION_COUNT): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    let candidate = line.trim();
    if (!candidate) continue;
    candidate = candidate.replace(LIST_MARKER, '').replace(WRAP_QUOTES, '').trim();
    if (!candidate || candidate.endsWith(':')) continue;
    if (candidate.length > SUGGESTION_MAX_CHARS) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= max) break;
  }
  return out;
}

/** Smart reply choices attached to one assistant reply, or null. */
export type SuggestionsState = { forMessageId: string; items: string[] } | null;

export type SuggestionsUiInput = {
  engineReady: boolean;
  generating: boolean;
  /** The inline rewrite editor is open, so the composer stepped aside. */
  editing: boolean;
  /** A suggestions pass is running on the engine right now. */
  suggesting: boolean;
  suggestions: SuggestionsState;
  newestId: string | null;
  newestRole: Role | null;
  newestContent: string;
};

export type SuggestionsUiState = 'hidden' | 'loading' | 'ready';

/**
 * What the composer row should show: nothing, a loader while the pass runs,
 * or the ready chips — and only while the chips still belong to the newest
 * reply (a newer turn invalidates them immediately).
 */
export function suggestionsUiState(i: SuggestionsUiInput): SuggestionsUiState {
  const newestReady = i.newestRole === 'assistant' && i.newestContent.trim().length > 0;
  if (!i.engineReady || i.generating || i.editing || !newestReady) return 'hidden';
  if (i.suggesting) return 'loading';
  if (i.suggestions && i.suggestions.forMessageId === i.newestId && i.suggestions.items.length > 0) return 'ready';
  return 'hidden';
}
