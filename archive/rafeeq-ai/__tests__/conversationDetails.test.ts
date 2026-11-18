// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage } from '../src/types';
import {
  DETAILS_DASH,
  buildConversationDetails,
  countWords,
  type DetailLabels,
} from '../src/utils/conversationDetails';

const LABELS: DetailLabels = {
  created: 'أُنشئت',
  messages: 'الرسائل',
  yours: 'منك',
  replies: 'ردود رفيق',
  words: 'الكلمات',
  tokens: 'توكنات مولّدة',
  model: 'الموديل',
  instructions: 'تعليمات خاصة',
  yes: 'نعم',
  no: 'لا',
};

let seq = 0;
function msg(partial: Partial<ChatMessage>): ChatMessage {
  seq += 1;
  return {
    id: `m${seq}`,
    conversationId: 'c1',
    role: 'user',
    content: '',
    createdAt: 1000 + seq,
    tokensPerSecond: null,
    tokenCount: null,
    ...partial,
  };
}

describe('countWords', () => {
  it.each([
    ['', 0],
    ['   ', 0],
    ['مرحبا', 1],
    ['مرحبا بالعالم', 2],
    ['hello   world  again', 3],
    ['سطر\nجديد مع\tتبويب', 4],
    ['  leading and trailing  ', 3],
  ])('counts %j -> %i', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});

describe('buildConversationDetails', () => {
  const conversation = {
    createdAt: 1700000000000,
    modelId: 'qwen2.5-0.5b-instruct-q4_k_m',
    systemPrompt: '  أجب باختصار  ',
  };
  const messages: ChatMessage[] = [
    msg({ role: 'user', content: 'مرحبا بالعالم' }),
    msg({ role: 'assistant', content: 'وعليكم السلام!', tokenCount: 12 }),
    msg({ role: 'user', content: 'اشرح أكثر' }),
    msg({ role: 'assistant', content: 'Explanation with six words', tokenCount: 30, tokensPerSecond: 9.5 }),
    msg({ role: 'assistant', content: 'no count reported' }),
    msg({ role: 'system', content: 'ignored system text' }),
  ];

  it('builds every row from a fully populated conversation', () => {
    const rows = buildConversationDetails({
      conversation,
      messages,
      modelName: 'Qwen2.5 0.5B Instruct',
      formatDate: (ms) => `D:${ms}`,
      labels: LABELS,
    });
    expect(rows).toEqual([
      { label: 'أُنشئت', value: 'D:1700000000000' },
      { label: 'الرسائل', value: '6' },
      { label: 'منك', value: '2' },
      { label: 'ردود رفيق', value: '3' },
      { label: 'الكلمات', value: '16' },
      { label: 'توكنات مولّدة', value: '42' },
      { label: 'الموديل', value: 'Qwen2.5 0.5B Instruct' },
      { label: 'تعليمات خاصة', value: 'نعم' },
    ]);
  });

  it('shows dashes for missing tokens and unknown models', () => {
    const rows = buildConversationDetails({
      conversation: { ...conversation, modelId: null },
      messages: [msg({ role: 'user', content: 'سؤال' })],
      modelName: null,
      formatDate: (ms) => `D:${ms}`,
      labels: LABELS,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['توكنات مولّدة']).toBe(DETAILS_DASH);
    expect(byLabel['الموديل']).toBe(DETAILS_DASH);
  });

  it('treats blank instructions and zero-count tokens as absent', () => {
    const rows = buildConversationDetails({
      conversation: { ...conversation, systemPrompt: '   ' },
      messages: [msg({ role: 'assistant', content: 'رد', tokenCount: 0 })],
      modelName: 'X',
      formatDate: (ms) => `D:${ms}`,
      labels: LABELS,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['تعليمات خاصة']).toBe('لا');
    expect(byLabel['توكنات مولّدة']).toBe(DETAILS_DASH);
  });

  it('handles an empty conversation with zeros', () => {
    const rows = buildConversationDetails({
      conversation: { ...conversation, systemPrompt: undefined },
      messages: [],
      modelName: 'Y',
      formatDate: (ms) => `D:${ms}`,
      labels: LABELS,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['الرسائل']).toBe('0');
    expect(byLabel['منك']).toBe('0');
    expect(byLabel['ردود رفيق']).toBe('0');
    expect(byLabel['الكلمات']).toBe('0');
    expect(byLabel['تعليمات خاصة']).toBe('لا');
  });

  it('reports the exact zero-token dash only when no reply was ever counted', () => {
    const rows = buildConversationDetails({
      conversation,
      messages: [msg({ role: 'assistant', content: 'a b', tokenCount: 5 })],
      modelName: 'Z',
      formatDate: (ms) => `D:${ms}`,
      labels: LABELS,
    });
    expect(rows.find((r) => r.label === 'توكنات مولّدة')?.value).toBe('5');
  });
});
