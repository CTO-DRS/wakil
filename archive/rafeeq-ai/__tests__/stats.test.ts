// Copyright (c) 2026 DRS AI. All rights reserved.
import { averageMessagesPerConversation, averageTokensPerReply } from '../src/utils/stats';

describe('stats averages', () => {
  it.each([
    [560, 2, 280],
    [513, 2, 257], // rounds half up
    [100, 3, 33], // rounds down
    [0, 4, 0],
  ])('averages tokens per reply: %i / %i -> %i', (tokens, counted, expected) => {
    expect(averageTokensPerReply(tokens, counted)).toBe(expected);
  });

  it('returns zero tokens-per-reply when nothing has been counted yet', () => {
    expect(averageTokensPerReply(1000, 0)).toBe(0);
  });

  it.each([
    [10, 2, 5],
    [7, 2, 4], // rounds half up
    [5, 3, 2],
    [0, 1, 0],
  ])('averages messages per conversation: %i / %i -> %i', (messages, conversations, expected) => {
    expect(averageMessagesPerConversation(messages, conversations)).toBe(expected);
  });

  it('returns zero messages-per-conversation on a fresh install', () => {
    expect(averageMessagesPerConversation(0, 0)).toBe(0);
    expect(averageMessagesPerConversation(12, 0)).toBe(0);
  });
});
