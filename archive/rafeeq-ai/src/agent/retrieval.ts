// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * On-device retrieval — how the agent finds the right memory for a goal
 * without any server. Two engines behind one ranking contract:
 *
 *  1. Lexical (always available, deterministic): Arabic-aware normalization
 *     (diacritics, alef/yeh/ta-marbuta unification, Arabic-Indic digits,
 *     tatweel), stopword filtering, light prefix stripping for Arabic
 *     morphology (ال/وال/بال/لل), and an overlap score.
 *  2. Embedding (when an embedding model is loaded): cosine similarity over
 *     vectors produced on-device by llama.rn's embedding API. The ranking is
 *     pure and tested with synthetic vectors; the model hookup rides the same
 *     interface (EmbeddingClient), so swapping it in needs no ranking change.
 *
 * The lexical engine is the floor — retrieval always works, the embedding
 * engine only raises its ceiling. Both are pure functions: no network, no
 * store access, fully table-driven testable.
 */

const DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL_RE = /\u0640/g;
const ARABIC_INDIC_RE = /[\u0660-\u0669\u06F0-\u06F9]/g;
const NON_LETTER_RE = /[^\p{L}\p{N}]+/gu;

/** Arabic-Indic and extended Arabic-Indic digits → ASCII digits. */
function toAsciiDigits(text: string): string {
  return text.replace(ARABIC_INDIC_RE, (d) => {
    const code = d.codePointAt(0) ?? 0;
    const base = code <= 0x0669 ? 0x0660 : 0x06f0;
    return String(code - base);
  });
}

/**
 * Search-space normalization for Arabic (and Latin) text: strips diacritics
 * and tatweel, unifies alef forms (أ إ آ ٱ → ا), yeh forms (ى → ي),
 * ta-marbuta (ة → ه), hamza carriers (ؤ → و, ئ → ي), lowercases Latin, and
 * collapses non-letter runs. Not for display — for matching.
 */
export function normalizeForSearch(text: string): string {
  return toAsciiDigits(text)
    .replace(DIACRITICS_RE, '')
    .replace(TATWEEL_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(NON_LETTER_RE, ' ')
    .trim();
}

/**
 * Function-word stopwords (Arabic + a small English set). Filtered before
 * scoring so «وش عندي بكرة» doesn't drown the ranking innoise tokens.
 */
export const SEARCH_STOPWORDS: readonly string[] = [
  'في', 'من', 'على', 'عن', 'الى', 'إلى', 'مع', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي',
  'وش', 'وشلون', 'كيف', 'لي', 'ليه', 'لماذا', 'ان', 'أن', 'إن', 'هل', 'ماذا', 'اذكر',
  'ارني', 'أرني', 'اعرض', 'شو', 'ايش', 'وين', 'متى', 'بعد', 'قبل', 'كل', 'علي',
  'عندي', 'عندك', 'عنده', 'ما', 'لا', 'قد', 'يا', 'ممكن', 'ابغى', 'ابي', 'هذاك',
  'the', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'is', 'are', 'on', 'in', 'at',
  'my', 'me', 'show', 'list', 'what', 'when', 'how',
];

/** Common Arabic prefixes stripped (when a token stays ≥ 3 chars after). */
const PREFIXES: readonly string[] = ['وال', 'بال', 'كال', 'فال', 'ال', 'لل', 'و', 'ب', 'ف', 'ل', 'ك'];

function stripPrefix(token: string): string {
  if (token.length <= 3) return token;
  for (const p of PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 3) return token.slice(p.length);
  }
  return token;
}

/**
 * Query/document tokens: normalized, stopword-free, prefix-stripped. Empty
 * tokens and one-letter leftovers are dropped.
 */
export function tokenizeForSearch(text: string): string[] {
  const normalized = normalizeForSearch(text);
  if (!normalized) return [];
  const out: string[] = [];
  for (const raw of normalized.split(' ')) {
    if (raw.length < 2) continue;
    if (SEARCH_STOPWORDS.includes(raw)) continue;
    const stem = stripPrefix(raw);
    if (stem.length < 2) continue;
    out.push(stem);
  }
  return out;
}

export interface ScoredRecord<T> {
  item: T;
  /** 0..1 — share of the query tokens found in the record. */
  score: number;
}

/**
 * Lexical ranking: each query token scores a full hit on an exact stem match
 * and a half hit on a prefix match (Arabic trilateral roots make prefixes
 * frequent). Score = weighted hits / query tokens, so a short query matching
 * fully beats a long query matching partially. Ties keep record order.
 */
export function rankLexical<T>(
  query: string,
  records: readonly T[],
  getText: (item: T) => string,
  max: number,
): ScoredRecord<T>[] {
  const queryTokens = tokenizeForSearch(query);
  if (queryTokens.length === 0 || max <= 0) return [];
  const scored: ScoredRecord<T>[] = [];
  for (const item of records) {
    const tokens = tokenizeForSearch(getText(item));
    if (tokens.length === 0) continue;
    const tokenSet = new Set(tokens);
    let weight = 0;
    for (const q of queryTokens) {
      if (tokenSet.has(q)) weight += 1;
      else if (tokens.some((t) => t.startsWith(q) || q.startsWith(t))) weight += 0.5;
    }
    if (weight <= 0) continue;
    scored.push({ item, score: weight / queryTokens.length });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Cosine similarity over two equal-length vectors; 0 for mismatched/zero vectors. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Embedding ranking: cosine over the query vector and each record's vector
 * (records without a vector are skipped — they still surface via the lexical
 * engine). Ties keep record order; negative similarities are dropped.
 */
export function rankByEmbedding<T>(
  queryVector: readonly number[],
  records: readonly T[],
  getVector: (item: T) => readonly number[] | null | undefined,
  max: number,
): ScoredRecord<T>[] {
  if (queryVector.length === 0 || max <= 0) return [];
  const scored: ScoredRecord<T>[] = [];
  for (const item of records) {
    const vector = getVector(item);
    if (!vector || vector.length !== queryVector.length) continue;
    const score = cosineSimilarity(queryVector, vector);
    if (score <= 0) continue;
    scored.push({ item, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}

/**
 * The on-device embedding side of retrieval. Implemented over llama.rn's
 * embedding API when an embedding model is loaded; null-vector results make
 * every caller fall back to the lexical engine.
 */
export interface EmbeddingClient {
  /** Returns the embedding vector, or null when the model is unavailable. */
  embed(text: string): Promise<readonly number[] | null>;
}

/**
 * Combined retrieval: embedding first when a client answers, lexical always.
 * Merges by id (or index) keeping the best score, so a record found by both
 * engines ranks once.
 */
export async function retrieveRelevant<T>(
  query: string,
  records: readonly T[],
  opts: {
    key: (item: T) => string;
    getText: (item: T) => string;
    max?: number;
    embedding?: EmbeddingClient;
    getVector?: (item: T) => readonly number[] | null | undefined;
  },
): Promise<ScoredRecord<T>[]> {
  const max = opts.max ?? 3;
  const merged = new Map<string, ScoredRecord<T>>();
  for (const hit of rankLexical(query, records, opts.getText, max)) {
    merged.set(opts.key(hit.item), hit);
  }
  const client = opts.embedding;
  if (client) {
    try {
      const vector = await client.embed(query);
      if (vector && vector.length > 0) {
        for (const hit of rankByEmbedding(vector, records, (item) => opts.getVector?.(item) ?? null, max)) {
          const key = opts.key(hit.item);
          const existing = merged.get(key);
          if (!existing || hit.score > existing.score) merged.set(key, hit);
        }
      }
    } catch {
      // A failed embed never breaks retrieval — lexical already ran.
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, max);
}
