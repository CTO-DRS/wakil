// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Word-error-rate scoring for the Saudi-dialect speech evaluation, with the
 * Arabic text normalization the score depends on: two transcriptions of the
 * same words must score as equal even when they disagree on diacritics, alef
 * seats, ta-marbuta, Arabic-Indic digits or punctuation. Pure, dependency-free
 * and table-driven tested.
 */

/** Diacritics, Quranic marks and tatweel: purely decorative for scoring. */
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/**
 * Normalizes Arabic (or any) text for WER scoring: diacritics and tatweel
 * stripped, alef seats unified (أ إ آ ٱ → ا), ى → ي, ة → ه, ؤ → و, ئ → ي,
 * Arabic-Indic and extended digits to ASCII, punctuation to spaces, whitespace
 * collapsed. Returns lower-cased word tokens.
 */
export function normalizeWordsForEval(text: string): string[] {
  let out = text.normalize('NFC');
  out = out.replace(DIACRITICS, '');
  out = out
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  out = out.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) =>
    String.fromCharCode(d.charCodeAt(0) - (d.charCodeAt(0) > 0x066f ? 0x06f0 : 0x0660) + 0x30),
  );
  out = out.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return out
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
}

export type WerResult = {
  /** Word error rate in [0, ∞); 1.0 = every reference word wrong. */
  wer: number;
  refWords: number;
  hypWords: number;
  substitutions: number;
  deletions: number;
  insertions: number;
};

/**
 * Word-level WER with Levenshtein backtrace (S/D/I separated so reports can
 * say *how* the model failed, not just how much). Returns null when the
 * reference is empty — an unscored sample, never a fake zero.
 */
export function werDetails(reference: string, hypothesis: string): WerResult | null {
  const ref = normalizeWordsForEval(reference);
  const hyp = normalizeWordsForEval(hypothesis);
  if (ref.length === 0) return null;
  // DP over word pairs; each cell keeps the cheapest (cost, kind) path.
  const m = ref.length;
  const n = hyp.length;
  const costs: number[][] = [];
  const kinds: ('=' | 's' | 'd' | 'i')[][] = [];
  for (let i = 0; i <= m; i++) {
    costs.push(new Array<number>(n + 1).fill(0));
    kinds.push(new Array<'=' | 's' | 'd' | 'i'>(n + 1).fill('='));
    costs[i]![0] = i;
    kinds[i]![0] = 'd';
  }
  for (let j = 1; j <= n; j++) {
    costs[0]![j] = j;
    kinds[0]![j] = 'i';
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        costs[i]![j] = costs[i - 1]![j - 1]!;
        kinds[i]![j] = '=';
        continue;
      }
      const sub = costs[i - 1]![j - 1]! + 1;
      const del = costs[i - 1]![j]! + 1;
      const ins = costs[i]![j - 1]! + 1;
      const min = Math.min(sub, del, ins);
      costs[i]![j] = min;
      kinds[i]![j] = min === sub ? 's' : min === del ? 'd' : 'i';
    }
  }
  // Backtrace from (m, n), counting each edit kind.
  let s = 0;
  let d = 0;
  let ins = 0;
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const kind = kinds[i]![j]!;
    if (kind === '=') {
      i--;
      j--;
    } else if (kind === 's') {
      s++;
      i--;
      j--;
    } else if (kind === 'd') {
      d++;
      i--;
    } else {
      ins++;
      j--;
    }
  }
  const errors = s + d + ins;
  return {
    wer: errors / m,
    refWords: m,
    hypWords: n,
    substitutions: s,
    deletions: d,
    insertions: ins,
  };
}

/** Aggregate WER over a sample set: total errors ÷ total reference words. */
export function corpusWer(samples: readonly { reference: string; hypothesis: string }[]): WerResult | null {
  let refWords = 0;
  let s = 0;
  let d = 0;
  let ins = 0;
  for (const { reference, hypothesis } of samples) {
    const r = werDetails(reference, hypothesis);
    if (!r) continue;
    refWords += r.refWords;
    s += r.substitutions;
    d += r.deletions;
    ins += r.insertions;
  }
  if (refWords === 0) return null;
  const errors = s + d + ins;
  return {
    wer: errors / refWords,
    refWords,
    hypWords: samples.reduce((acc, x) => acc + normalizeWordsForEval(x.hypothesis).length, 0),
    substitutions: s,
    deletions: d,
    insertions: ins,
  };
}
