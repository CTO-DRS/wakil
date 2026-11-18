// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Builds a short snippet of a message around the first case-insensitive
 * occurrence of the query, split for UI highlighting. When the query is not
 * present (e.g. token-level FTS hits), the head of the content is returned.
 */
export function matchSnippet(
  content: string,
  query: string,
  radius = 60,
): { before: string; match: string; after: string } {
  const needle = query.trim().toLowerCase();
  const idx = needle ? content.toLowerCase().indexOf(needle) : -1;
  if (idx < 0) {
    const head = content.slice(0, radius * 2);
    return { before: head, match: '', after: content.length > head.length ? '…' : '' };
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + needle.length + radius);
  return {
    before: (start > 0 ? '…' : '') + content.slice(start, idx),
    match: content.slice(idx, idx + needle.length),
    after: content.slice(idx + needle.length, end) + (end < content.length ? '…' : ''),
  };
}
