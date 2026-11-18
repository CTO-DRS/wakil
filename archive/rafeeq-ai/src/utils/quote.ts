// Copyright (c) 2026 DRS AI. All rights reserved.

/** Longest quoted snippet shown in a bubble or the composer banner. */
export const QUOTE_SNIPPET_MAX = 140;

/** Minimal shape the resolver needs; keeps callers free to pass full messages. */
type ChatMessageLike = { id: string; content: string };

/**
 * Collapses a quoted message into the one-line snippet shown in the quote
 * block: all whitespace (newlines included) becomes single spaces, and a
 * snippet that runs past the cap ends with an ellipsis. An empty result means
 * there is nothing readable to quote.
 */
export function normalizeQuotedContent(content: string, max: number = QUOTE_SNIPPET_MAX): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** What a bubble needs to render the message it quotes. */
export type QuoteView = {
  /** Id of the quoted message, for the jump-on-tap affordance. */
  id: string;
  /** One-line snippet of the quoted content; empty when unavailable. */
  snippet: string;
  /** True when the quoted message no longer exists or carries no text. */
  missing: boolean;
};

/**
 * Resolves a message's quote reference against the conversation's messages.
 * Dangling references (the quoted message was deleted) resolve to a `missing`
 * view so the bubble can say so instead of rendering an empty block. Messages
 * without a quote resolve to null.
 */
export function buildQuoteView(
  replyToId: string | null | undefined,
  byId: ReadonlyMap<string, ChatMessageLike>,
): QuoteView | null {
  if (!replyToId) return null;
  const quoted = byId.get(replyToId);
  if (!quoted) return { id: replyToId, snippet: '', missing: true };
  const snippet = normalizeQuotedContent(quoted.content);
  return { id: replyToId, snippet, missing: snippet.length === 0 };
}
