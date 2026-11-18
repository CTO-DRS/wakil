// Copyright (c) 2026 DRS AI. All rights reserved.
import { SentenceStreamer, firstSpokenSentence } from '../src/speech/sentenceStream';

/** Feeds the text in small deltas (realistic token stream) and joins what came out. */
function streamThrough(text: string, chunkSize = 3): string[] {
  const s = new SentenceStreamer();
  const out: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) out.push(...s.feed(text.slice(i, i + chunkSize)));
  const rest = s.flush();
  if (rest) out.push(rest);
  return out;
}

/** Strips everything but letters and digits — the words the user actually hears. */
function spokenWords(parts: string[]): string {
  return parts.join(' ').replace(/[^\p{L}\p{N}]+/gu, '');
}

describe('SentenceStreamer — Arabic terminators', () => {
  const cases: { name: string; text: string; expected: string[] }[] = [
    {
      name: 'arabic question mark ends a sentence',
      text: 'وش عندي بكرة؟ عندي اجتماع الساعة عشر.',
      expected: ['وش عندي بكرة؟', 'عندي اجتماع الساعة عشر.'],
    },
    {
      name: 'arabic full stop and exclamation',
      text: 'دوّنت الملاحظة! وش تبي بعد؟',
      expected: ['دوّنت الملاحظة!', 'وش تبي بعد؟'],
    },
    {
      name: 'arabic semicolon is a real pause, the arabic comma is not',
      text: 'رتّببت المواعيد؛ الاجتماع الأول الصباح، والثاني بعد العصر.',
      expected: ['رتّببت المواعيد؛', 'الاجتماع الأول الصباح، والثاني بعد العصر.'],
    },
    {
      name: 'latin question and exclamation work too',
      text: 'Done? Yes!',
      expected: ['Done?', 'Yes!'],
    },
    {
      name: 'a run of terminators stays one boundary',
      text: 'خلصنا!!! وش بعدها؟ لا شيء.',
      expected: ['خلصنا!!!', 'وش بعدها؟', 'لا شيء.'],
    },
  ];
  it.each(cases)('$name', ({ text, expected }) => {
    // Whole text at once: the segmentation is exact.
    const s = new SentenceStreamer();
    expect([...s.feed(text), s.flush()].filter(Boolean)).toEqual(expected);
    // Streamed token by token: a terminator run split across chunks may end
    // its sentence a character earlier, but no word is ever lost and the
    // boundaries still fall in the same places.
    expect(spokenWords(streamThrough(text))).toBe(spokenWords(expected));
  });
});

describe('SentenceStreamer — the classic traps', () => {
  it('never cuts inside a decimal (3.5, Arabic-Indic digits)', () => {
    // At once and streamed alike: a dot run at the buffer edge with digits
    // before it is held one token, so the decimal never splits.
    expect(streamThrough('الاجتماع من 3.5 ساعات تقريبا.')).toEqual(['الاجتماع من 3.5 ساعات تقريبا.']);
    expect(streamThrough('الموعد ٢٠٢٦.١١ بالتقويم.')).toEqual(['الموعد ٢٠٢٦.١١ بالتقويم.']);
    const s = new SentenceStreamer();
    expect([...s.feed('الموعد ٢٠٢٦.١١ بالتقويم.'), s.flush()].filter(Boolean)).toEqual(['الموعد ٢٠٢٦.١١ بالتقويم.']);
  });

  it('never speaks a list marker alone; it folds into the next sentence', () => {
    const s = new SentenceStreamer();
    const first = s.feed('1. ');
    expect(first).toEqual([]); // «1.» is not a sentence
    const rest = s.feed('اجتماع الفريق\n');
    const tail = s.flush();
    expect([...first, ...rest, tail ?? ''].join('')).toBe('1. اجتماع الفريق');
  });

  it('does not treat a year followed by a dot as a list marker', () => {
    const s = new SentenceStreamer();
    const out = s.feed('في 2026. انطلقت البطولة.');
    const tail = s.flush();
    expect([...out, tail ?? ''].filter(Boolean)).toEqual(['في 2026.', 'انطلقت البطولة.']);
  });

  it('cuts before a structural line (heading, bullet, quote, numbered list)', () => {
    const out = streamThrough('ملخص سريع:\n- الاجتماع الساعة عشر\n- الغداء الساعة واحد');
    expect(out[0]).toBe('ملخص سريع:'); // the newline before «-» is the boundary
    expect(out).toHaveLength(3);
  });

  it('an ellipsis streamed by tokens keeps every word and never speaks bare punctuation', () => {
    // Whole text at once: the run stays one boundary.
    const s = new SentenceStreamer();
    expect([...s.feed('انتظر قليلا... وجاهز.'), s.flush()].filter(Boolean)).toEqual(['انتظر قليلا...', 'وجاهز.']);
    // Streamed: the cut may fire at the first dot before the rest of the run
    // arrives — fine for speech — but no word is lost and the bare «..» tail
    // is dropped, never uttered.
    expect(spokenWords(streamThrough('انتظر قليلا... وجاهز.'))).toBe('انتظرقليلاوجاهز');
  });
});

describe('SentenceStreamer — overflow and flush', () => {
  it('cuts at the last word boundary past MAX_PENDING_CHARS so speech never stalls', () => {
    const long = 'كلمة '.repeat(60); // 360 chars, no terminator
    const s = new SentenceStreamer();
    const out = s.feed(long);
    expect(out.length).toBeGreaterThan(0);
    const emitted = out.join('');
    expect(emitted.length).toBeLessThanOrEqual(200);
    // The cut landed on a whole word, never mid-word.
    expect(emitted.startsWith('كلمة')).toBe(true);
    expect(emitted.endsWith('كلمة')).toBe(true);
  });

  it('flush emits whatever is held and empties the streamer', () => {
    const s = new SentenceStreamer();
    expect(s.feed('جاري التحضير')).toEqual([]);
    expect(s.pending()).toBe('جاري التحضير');
    expect(s.flush()).toBe('جاري التحضير');
    expect(s.flush()).toBeNull();
    expect(s.pending()).toBe('');
  });

  it('reset folds a dangling list marker back in (session restart mid-answer)', () => {
    const s = new SentenceStreamer();
    s.feed('2.');
    s.reset('2.');
    expect(s.pending()).toBe('2.');
    // The folded marker joins the next sentence instead of being spoken alone.
    const out = s.feed(' الملاحظة الثانية.');
    expect(out).toEqual(['2. الملاحظة الثانية.']);
    // A non-marker fragment is dropped on reset.
    s.reset('نصف جملة');
    expect(s.pending()).toBe('');
  });
});

describe('firstSpokenSentence', () => {
  it('returns the first complete sentence of an answer', () => {
    expect(firstSpokenSentence('حاضر، بنتفّذ خطوة واحدة: نسرّب الإنترنت؟')).toBe('حاضر، بنتفّذ خطوة واحدة: نسرّب الإنترنت؟');
    expect(firstSpokenSentence('حاضر. أبدأ الآن بالتنظيم.') ?? null).toBe('حاضر.');
  });

  it('falls back to the whole text when no terminator exists', () => {
    expect(firstSpokenSentence('حاضر، شغّال على طلبك')).toBe('حاضر، شغّال على طلبك');
    expect(firstSpokenSentence('')).toBeNull();
  });
});
