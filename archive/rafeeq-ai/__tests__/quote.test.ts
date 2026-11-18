// Copyright (c) 2026 DRS AI. All rights reserved.
import { QUOTE_SNIPPET_MAX, buildQuoteView, normalizeQuotedContent } from '../src/utils/quote';

describe('normalizeQuotedContent', () => {
  it.each([
    ['keeps a short single-line message as-is', 'مرحبا بك', 'مرحبا بك'],
    ['collapses newlines into single spaces', 'سطر أول\nسطر ثان\nسطر ثالث', 'سطر أول سطر ثان سطر ثالث'],
    ['collapses runs of whitespace', 'كلمات    متفرقة      جدًا', 'كلمات متفرقة جدًا'],
    ['trims both ends', '   محاطة بمسافات   ', 'محاطة بمسافات'],
    ['empties whitespace-only content', '  \n\t  ', ''],
    ['empties plain empty content', '', ''],
    [`caps a long message at ${QUOTE_SNIPPET_MAX} with an ellipsis`, 'ا'.repeat(300), `${'ا'.repeat(QUOTE_SNIPPET_MAX - 1)}…`],
    ['caps without splitting the ellipsis off a trailing space', `${'ب'.repeat(150)} `, `${'ب'.repeat(QUOTE_SNIPPET_MAX - 1)}…`],
    ['honors a custom cap', 'abcdefghij', 'abc…'],
  ])('%s', (_name, content, expected) => {
    const max = content === 'abcdefghij' ? 4 : undefined;
    expect(normalizeQuotedContent(content, max)).toBe(expected);
  });
});

describe('buildQuoteView', () => {
  const messages = [
    { id: 'm1', content: 'سؤال قصير' },
    { id: 'm2', content: 'جواب طويل\n'.repeat(40) },
    { id: 'm3', content: '   ' },
  ];
  const byId = new Map(messages.map((m) => [m.id, m]));

  it.each([
    ['resolves a short quoted message', 'm1', { id: 'm1', snippet: 'سؤال قصير', missing: false }],
    ['resolves a long quoted message into a capped snippet', 'm2', { id: 'm2', snippet: normalizeQuotedContent('جواب طويل '.repeat(40)), missing: false }],
    ['treats an empty quoted message as missing', 'm3', { id: 'm3', snippet: '', missing: true }],
    ['treats a dangling reference as missing', 'gone', { id: 'gone', snippet: '', missing: true }],
  ])('%s', (_name, replyToId, expected) => {
    expect(buildQuoteView(replyToId, byId)).toEqual(expected);
  });

  it.each([
    ['null reference', null],
    ['undefined reference (legacy rows)', undefined],
    ['empty-string reference', ''],
  ])('returns null for a %s', (_name, replyToId) => {
    expect(buildQuoteView(replyToId, byId)).toBeNull();
  });

  it('works against an empty conversation', () => {
    expect(buildQuoteView('m1', new Map())).toEqual({ id: 'm1', snippet: '', missing: true });
  });
});
