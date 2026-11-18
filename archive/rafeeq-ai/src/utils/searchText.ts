// Copyright (c) 2026 DRS AI. All rights reserved.

// Arabic combining marks (harakat, shadda, tanween, Quranic marks), the
// dagger alef and the tatweel. unicode61 splits words at these marks, so
// they must be removed before text goes into the FTS index.
const ARABIC_MARKS = /[\u0610-\u061A\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/**
 * Normalizes text for search indexing and matching: lowercases and strips
 * Arabic diacritics and tatweel, so "مُرَحِّبًا" and "مرحبا" match.
 */
export function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(ARABIC_MARKS, '');
}
