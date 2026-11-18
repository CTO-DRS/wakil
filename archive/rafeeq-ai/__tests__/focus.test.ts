// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage } from '../src/types';
import { focusTarget } from '../src/utils/focus';

const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  conversationId: 'c1',
  role: 'assistant',
  content: 'الجواب',
  createdAt: 0,
  tokensPerSecond: null,
  tokenCount: null,
  ...overrides,
});

const cases: { name: string; messages: ChatMessage[]; expectedId: string | null }[] = [
  { name: 'no messages at all', messages: [], expectedId: null },
  { name: 'last message is the user turn', messages: [message({ id: 'a', content: 'رد' }), message({ id: 'u', role: 'user' })], expectedId: null },
  { name: 'assistant reply still empty (first token not in)', messages: [message({ content: '' })], expectedId: null },
  { name: 'assistant reply is whitespace only', messages: [message({ content: '  \n ' })], expectedId: null },
  { name: 'streaming reply with content', messages: [message({ id: 'live' })], expectedId: 'live' },
  {
    name: 'completed reply followed by nothing',
    messages: [message({ id: 'u0', role: 'user' }), message({ id: 'done' })],
    expectedId: 'done',
  },
  {
    name: 'older replies are ignored once the user replied again',
    messages: [message({ id: 'old' }), message({ id: 'u1', role: 'user' }), message({ id: 'u2', role: 'user' })],
    expectedId: null,
  },
];

describe('focusTarget', () => {
  it.each(cases)('$name', ({ messages, expectedId }) => {
    expect(focusTarget(messages)?.id ?? null).toBe(expectedId);
  });
});
