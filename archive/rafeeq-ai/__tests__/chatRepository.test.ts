// Copyright (c) 2026 DRS AI. All rights reserved.
import { MemoryChatRepository } from '../src/db/repository';

import type { ChatMessage, Conversation } from '../src/types';

const conv = (id: string, updatedAt: number): Conversation => ({
  id,
  title: `c ${id}`,
  modelId: null,
  createdAt: updatedAt - 10,
  updatedAt,
  pinned: false,
  archived: false,
  systemPrompt: '',
});

const msg = (id: string, conversationId: string, tokenCount: number | null, role: ChatMessage['role'] = 'assistant'): ChatMessage => ({
  id,
  conversationId,
  role,
  content: `text ${id}`,
  createdAt: 5,
  tokensPerSecond: null,
  tokenCount,
});

describe('MemoryChatRepository.getStats', () => {
  it('counts conversations, messages and sums the generated tokens', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertConversation(conv('c2', 20));
    await repo.insertMessage(msg('m1', 'c1', 512));
    await repo.insertMessage(msg('m2', 'c1', 48));
    await repo.insertMessage(msg('m3', 'c2', null)); // legacy message: no count
    await repo.insertMessage(msg('m4', 'c2', 0, 'user')); // users never carry counts

    await expect(repo.getStats()).resolves.toEqual({ conversations: 2, messages: 4, tokens: 560, countedReplies: 2 });
  });

  it('is all zeros on a fresh install', async () => {
    const repo = new MemoryChatRepository();
    await expect(repo.getStats()).resolves.toEqual({ conversations: 0, messages: 0, tokens: 0, countedReplies: 0 });
  });
});

describe('MemoryChatRepository message quotes', () => {
  it('roundtrips the replyToId reference on insert and list', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertMessage(msg('m1', 'c1', null));
    await repo.insertMessage({ ...msg('m2', 'c1', null), replyToId: 'm1' });
    const list = await repo.listMessages('c1');
    expect(list.find((m) => m.id === 'm2')!.replyToId).toBe('m1');
    expect(list.find((m) => m.id === 'm1')!.replyToId ?? null).toBeNull();
  });

  it('clears quote references pointing at a deleted message, leaving others alone', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertMessage(msg('m1', 'c1', null));
    await repo.insertMessage(msg('m2', 'c1', null));
    await repo.insertMessage({ ...msg('m3', 'c1', null), replyToId: 'm1' });
    await repo.insertMessage({ ...msg('m4', 'c1', null), replyToId: 'm2' });

    await repo.deleteMessage('m1');

    const list = await repo.listMessages('c1');
    expect(list.find((m) => m.id === 'm3')!.replyToId).toBeNull();
    expect(list.find((m) => m.id === 'm4')!.replyToId).toBe('m2');
  });
});

describe('MemoryChatRepository message pin', () => {
  it('pins one message per conversation, moves the pin and clears it with null', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertMessage(msg('m1', 'c1', null));
    await repo.insertMessage(msg('m2', 'c1', null));

    await repo.updateConversation('c1', { pinnedMessageId: 'm1' });
    let list = await repo.listConversations();
    expect(list[0].pinnedMessageId).toBe('m1');

    await repo.updateConversation('c1', { pinnedMessageId: 'm2' });
    list = await repo.listConversations();
    expect(list[0].pinnedMessageId).toBe('m2');

    await repo.updateConversation('c1', { pinnedMessageId: null });
    list = await repo.listConversations();
    expect(list[0].pinnedMessageId).toBeNull();
  });

  it('drops the pin of every conversation when the pinned message is deleted', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertConversation(conv('c2', 20));
    await repo.insertMessage(msg('m1', 'c1', null));
    await repo.updateConversation('c1', { pinnedMessageId: 'm1' });
    await repo.updateConversation('c2', { pinnedMessageId: 'm1' });

    await repo.deleteMessage('m1');

    const list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')!.pinnedMessageId).toBeNull();
    expect(list.find((c) => c.id === 'c2')!.pinnedMessageId).toBeNull();
  });
});
