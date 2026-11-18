// Copyright (c) 2026 DRS AI. All rights reserved.
import { normalizeSearchText } from './searchText';

/** Same floor as the global search: one letter matches far too much. */
export const IN_CHAT_MIN_QUERY = 2;

/**
 * In-conversation search: returns the ids of the messages whose content
 * contains the query, in conversation order. Matching uses the exact same
 * normalization as the global search (case-insensitive, Arabic diacritics and
 * tatweel stripped), so "مُرَحِّبًا" is found by "مرحبا" in both.
 */
export function findMessageMatches(
  messages: readonly { id: string; content: string }[],
  query: string,
  minQuery = IN_CHAT_MIN_QUERY,
): string[] {
  const needle = normalizeSearchText(query.trim());
  if (needle.length < minQuery) return [];
  const hits: string[] = [];
  for (const message of messages) {
    if (normalizeSearchText(message.content).includes(needle)) hits.push(message.id);
  }
  return hits;
}
