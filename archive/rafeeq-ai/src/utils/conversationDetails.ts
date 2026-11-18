// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage, Conversation } from '../types';

/** One label/value line of the conversation details panel. */
export type DetailRow = { label: string; value: string };

/**
 * The strings the pure builder needs; the caller resolves them through i18n so
 * this module never touches translation internals.
 */
export type DetailLabels = {
  created: string;
  messages: string;
  yours: string;
  replies: string;
  words: string;
  tokens: string;
  model: string;
  instructions: string;
  yes: string;
  no: string;
};

/** Whitespace-separated word count; empty or blank text counts as zero. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Placeholder for values the conversation simply does not have (no tokens counted, no model). */
export const DETAILS_DASH = '—';

/**
 * Builds the details rows of a conversation as pure data, so the panel stays a
 * dumb renderer and the arithmetic is fully table-testable. Token totals only
 * count assistant replies that reported an exact generated-token figure — the
 * same honesty rule the settings insights follow.
 */
export function buildConversationDetails(input: {
  conversation: Pick<Conversation, 'createdAt' | 'modelId' | 'systemPrompt'>;
  messages: ChatMessage[];
  /** Display name of the conversation's model, or null when unknown/none. */
  modelName: string | null;
  formatDate: (ms: number) => string;
  labels: DetailLabels;
}): DetailRow[] {
  const { conversation, messages, modelName, formatDate, labels } = input;
  let yours = 0;
  let replies = 0;
  let words = 0;
  let tokens = 0;
  let countedReplies = 0;
  for (const m of messages) {
    if (m.role === 'user') yours += 1;
    else if (m.role === 'assistant') replies += 1;
    words += countWords(m.content);
    if (m.role === 'assistant' && typeof m.tokenCount === 'number' && m.tokenCount > 0) {
      tokens += m.tokenCount;
      countedReplies += 1;
    }
  }
  const hasInstructions =
    typeof conversation.systemPrompt === 'string' && conversation.systemPrompt.trim().length > 0;
  return [
    { label: labels.created, value: formatDate(conversation.createdAt) },
    { label: labels.messages, value: messages.length.toLocaleString() },
    { label: labels.yours, value: yours.toLocaleString() },
    { label: labels.replies, value: replies.toLocaleString() },
    { label: labels.words, value: words.toLocaleString() },
    { label: labels.tokens, value: countedReplies > 0 ? tokens.toLocaleString() : DETAILS_DASH },
    { label: labels.model, value: modelName ?? DETAILS_DASH },
    { label: labels.instructions, value: hasInstructions ? labels.yes : labels.no },
  ];
}
