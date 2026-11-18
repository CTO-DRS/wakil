// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  cosineSimilarity,
  normalizeForSearch,
  rankByEmbedding,
  rankLexical,
  retrieveRelevant,
  tokenizeForSearch,
} from '../src/agent/retrieval';

describe('normalizeForSearch — Arabic-aware normalization', () => {
  const cases: [string, string][] = [
    ['أحب القهوة', 'احب القهوه'], // alef unification + ta-marbuta
    ['إيمان', 'ايمان'],
    ['مدرسة', 'مدرسه'], // ta-marbuta
    ['على', 'علي'], // final yeh
    ['قُرْآنٌ كَرِيم', 'قران كريم'], // diacritics stripped
    ['طــويل', 'طويل'], // tatweel stripped
    ['ذكّرني في الساعة ٣', 'ذكرني في الساعه 3'], // diacritic + digit + ta-marbuta
    ['Hello, World!', 'hello world'], // lowercase + punctuation
    ['—', ''], // punctuation-only collapses to empty
  ];
  for (const [input, expected] of cases) {
    it(`normalizes “${input}”`, () => {
      expect(normalizeForSearch(input)).toBe(expected);
    });
  }
});

describe('tokenizeForSearch', () => {
  it('drops stopwords, short tokens and keeps content stems', () => {
    // 'بكرة' sheds its Light 'ب' prefix the same way on both sides of a match —
    // consistency is what makes the strip useful, not linguistic depth.
    expect(tokenizeForSearch('وش عندي بكرة')).toEqual(['كره']);
  });

  it('strips the definite article and conjunction prefixes', () => {
    expect(tokenizeForSearch('المدرسة')).toEqual(['مدرسه']);
    expect(tokenizeForSearch('والعمل')).toEqual(['عمل']);
    expect(tokenizeForSearch('للبيت')).toEqual(['بيت']);
  });

  it('keeps prefix-only words intact when stripping would gut them', () => {
    // 'العز': stripping 'ال' would leave only 2 chars — the word stays whole.
    expect(tokenizeForSearch('العز')).toEqual(['العز']);
  });

  it('returns [] for stopword-only or empty queries', () => {
    expect(tokenizeForSearch('')).toEqual([]);
    expect(tokenizeForSearch('وش')).toEqual([]);
    expect(tokenizeForSearch('!!!')).toEqual([]);
  });
});

describe('rankLexical', () => {
  const records = [
    { id: 'r1', text: 'أحب القهوة بعد الفجر' },
    { id: 'r2', text: 'أبوي اسمه سعد' },
    { id: 'r3', text: 'القهوة تتبع الصلاة' },
  ];

  it('ranks the exact match above the partial one', () => {
    const ranked = rankLexical('القهوة', records, (r) => r.text, 5);
    expect(ranked[0].item.id).toBe('r1');
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it('matches through prefixes: الشغل finds شغلي', () => {
    const withWork = [...records, { id: 'r4', text: 'شغلي ينتهي الساعة خمسة' }];
    const ranked = rankLexical('الشغل', withWork, (r) => r.text, 5);
    expect(ranked[0].item.id).toBe('r4');
  });

  it('returns [] when nothing matches or the query is noise', () => {
    expect(rankLexical('طائرة', records, (r) => r.text, 5)).toEqual([]);
    expect(rankLexical('وش', records, (r) => r.text, 5)).toEqual([]);
  });

  it('caps the result count', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, text: `القهوة ${i}` }));
    expect(rankLexical('القهوة', many, (r) => r.text, 3)).toHaveLength(3);
  });
});

describe('cosineSimilarity', () => {
  const cases: [number[], number[], number][] = [
    [[1, 0], [1, 0], 1],
    [[1, 0], [0, 1], 0],
    [[1, 2, 3], [1, 2, 3], 1],
    [[2, 0], [1, 0], 1], // magnitude-invariant
    [[], [1], 0],
    [[1, 2], [1], 0], // length mismatch
    [[0, 0], [1, 1], 0], // zero vector
  ];
  for (const [a, b, expected] of cases) {
    it(`cos(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${expected}`, () => {
      expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
    });
  }
});

describe('rankByEmbedding', () => {
  it('ranks by cosine and skips vector-less records', () => {
    const records = [
      { id: 'a', vec: [1, 0, 0] },
      { id: 'b', vec: [0.9, 0.1, 0] },
      { id: 'c', vec: [0, 1, 0] },
      { id: 'd', vec: null },
    ];
    const ranked = rankByEmbedding([1, 0, 0], records, (r) => r.vec, 4);
    // 'c' is orthogonal (cos = 0) and 'd' has no vector — both stay out.
    expect(ranked.map((r) => r.item.id)).toEqual(['a', 'b']);
    expect(ranked[0].score).toBeCloseTo(1, 5);
  });

  it('drops non-positive similarities', () => {
    const ranked = rankByEmbedding([1, 0], [{ id: 'neg', vec: [-1, 0] }], (r) => r.vec, 3);
    expect(ranked).toEqual([]);
  });
});

describe('retrieveRelevant — the merged two-engine path', () => {
  const records = [
    { id: 'r1', text: 'أحب القهوة بعد الفجر', vec: [1, 0] },
    { id: 'r2', text: 'أبوي اسمه سعد', vec: [0, 1] },
  ];

  it('merges lexical and embedding hits keeping the best score', async () => {
    const embedding = { embed: async (text: string) => (text.includes('قهوة') ? [1, 0.2] : [0, 1]) };
    const hits = await retrieveRelevant('القهوة', records, {
      key: (r) => r.id,
      getText: (r) => r.text,
      max: 2,
      embedding,
      getVector: (r) => r.vec,
    });
    expect(hits[0].item.id).toBe('r1');
    // The embedding score for r1 (cos([1,0.2],[1,0]) ≈ 0.98) beats lexical (1.0)? No —
    // lexical full match is 1.0; merged keeps max, r1 stays on top, r2 follows.
    expect(hits).toHaveLength(2);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });

  it('falls back to lexical when the embedding client fails', async () => {
    const embedding = { embed: async () => { throw new Error('model not loaded'); } };
    const hits = await retrieveRelevant('القهوة', records, {
      key: (r) => r.id,
      getText: (r) => r.text,
      max: 3,
      embedding,
    });
    expect(hits[0].item.id).toBe('r1');
  });

  it('works with no embedding client at all (the lexical floor)', async () => {
    const hits = await retrieveRelevant('سعد', records, {
      key: (r) => r.id,
      getText: (r) => r.text,
      max: 3,
    });
    expect(hits.map((h) => h.item.id)).toEqual(['r2']);
  });
});
