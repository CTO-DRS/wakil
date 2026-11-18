// Copyright (c) 2026 DRS AI. All rights reserved.
import { corpusWer, normalizeWordsForEval, werDetails } from '../src/speech/wer';

describe('normalizeWordsForEval', () => {
  const cases: { name: string; text: string; words: string[] }[] = [
    { name: 'plain saudi sentence', text: 'ذكّرني أتصل على أبوي بعد العصر', words: ['ذكرني', 'اتصل', 'علي', 'ابوي', 'بعد', 'العصر'] },
    { name: 'diacritics stripped', text: 'ذَكِّرْنِي', words: ['ذكرني'] },
    { name: 'tatweel stripped', text: 'رٍفــيــق', words: ['رفيق'] },
    { name: 'alef seats unified', text: 'أإآٱب', words: ['ااااب'] },
    { name: 'alef maqsura to ya, ta marbuta to ha', text: 'مستشفى كبيرة', words: ['مستشفي', 'كبيره'] },
    { name: 'hamza seats unified', text: 'ؤلئك', words: ['وليك'] },
    { name: 'arabic-indic digits to ascii', text: 'الساعة ٩:٤٥', words: ['الساعه', '9', '45'] },
    { name: 'punctuation becomes spaces', text: 'حاضر، بنتفّذ.', words: ['حاضر', 'بنتفذ'] },
    { name: 'whitespace collapsed', text: '  أهلاً   وسهلاً  ', words: ['اهلا', 'وسهلا'] },
    { name: 'empty and punctuation-only give no words', text: '؟ ، .', words: [] },
  ];
  it.each(cases)('$name', ({ text, words }) => {
    expect(normalizeWordsForEval(text)).toEqual(words);
  });
});

describe('werDetails', () => {
  it('scores a perfect transcription as zero with no edits', () => {
    const r = werDetails('ذكّرني أتصل على أبوي', 'ذكرني اتصل على ابوي');
    expect(r).toEqual({ wer: 0, refWords: 4, hypWords: 4, substitutions: 0, deletions: 0, insertions: 0 });
  });

  it('scores a wrong word as a substitution', () => {
    const r = werDetails('أتصل على أبوي', 'أتصل على أمي');
    expect(r?.wer).toBeCloseTo(1 / 3, 5);
    expect(r?.substitutions).toBe(1);
    expect(r?.deletions).toBe(0);
    expect(r?.insertions).toBe(0);
  });

  it('counts deletions when the hypothesis drops words', () => {
    const r = werDetails('ذكّرني أتصل على أبوي بعد العصر', 'ذكّرني أتصل أبوي');
    expect(r?.refWords).toBe(6);
    expect(r?.hypWords).toBe(3);
    expect(r?.deletions).toBe(3);
    expect(r?.wer).toBeCloseTo(0.5, 5);
  });

  it('counts insertions when the model hallucinates words', () => {
    const r = werDetails('أطفئ الضوء', 'أطفئ كل الضوء');
    expect(r?.insertions).toBe(1);
    expect(r?.wer).toBeCloseTo(0.5, 5);
  });

  it('normalizes away spelling disagreement on the same words', () => {
    // Diacritics, alef seats and ta-marbuta differ; the words do not.
    const r = werDetails('أخبر أمي أنّ المُحاضَرَة تبدأ بالسّاعة', 'اخبر امي ان المحاضره تبدأ بالساعة');
    expect(r?.wer).toBe(0);
  });

  it('an empty reference is unscored (null), not a fake zero', () => {
    expect(werDetails('', 'أي شيء')).toBeNull();
    expect(werDetails('؟ ،', 'كلمة')).toBeNull();
  });

  it('an empty hypothesis scores as a full deletion', () => {
    const r = werDetails('أتصل على أبوي', '');
    expect(r?.wer).toBe(1);
    expect(r?.deletions).toBe(3);
  });
});

describe('corpusWer', () => {
  it('aggregates: total errors over total reference words', () => {
    const r = corpusWer([
      { reference: 'أتصل على أبوي', hypothesis: 'أتصل على أبوي' }, // 0 errors / 3
      { reference: 'رتّب لي بكرة', hypothesis: 'رتّب بكرة' }, // 1 deletion / 3
      { reference: 'وش عندي بكرة', hypothesis: 'وش عندي أمس' }, // 1 sub / 3
    ]);
    expect(r?.refWords).toBe(9);
    expect(r?.wer).toBeCloseTo(2 / 9, 5);
    expect(r?.deletions).toBe(1);
    expect(r?.substitutions).toBe(1);
    expect(r?.insertions).toBe(0);
  });

  it('skips unscored samples instead of crashing the report', () => {
    const r = corpusWer([
      { reference: '', hypothesis: 'أي شيء' },
      { reference: 'حاضر', hypothesis: 'حاضر' },
    ]);
    expect(r?.refWords).toBe(1);
    expect(r?.wer).toBe(0);
  });

  it('null when nothing is scoreable', () => {
    expect(corpusWer([])).toBeNull();
    expect(corpusWer([{ reference: '', hypothesis: 'نص' }])).toBeNull();
  });
});
