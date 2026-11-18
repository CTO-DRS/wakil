// Copyright (c) 2026 DRS AI. All rights reserved.
import { MemoryChatRepository } from '../src/db/repository';
import { TRASH_RETENTION_DAYS, TRASH_RETENTION_MS, UNDO_TOAST_MS, isTrashExpired, sortTrash } from '../src/utils/trash';
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

describe('trash rules', () => {
  it('keeps the retention window and the undo window constants in sync', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(TRASH_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(UNDO_TOAST_MS).toBe(6000);
  });

  it('expires only once the whole retention window has passed', () => {
    const deletedAt = 1_000;
    expect(isTrashExpired(deletedAt, deletedAt + TRASH_RETENTION_MS - 1)).toBe(false);
    expect(isTrashExpired(deletedAt, deletedAt + TRASH_RETENTION_MS)).toBe(true);
    expect(isTrashExpired(deletedAt, deletedAt + TRASH_RETENTION_MS + 5_000)).toBe(true);
  });

  it('honours a custom retention window', () => {
    expect(isTrashExpired(1_000, 2_000, 1_000)).toBe(true);
    expect(isTrashExpired(1_000, 1_999, 1_000)).toBe(false);
  });

  it('sorts the trash newest-deleted first, falling back to updatedAt', () => {
    const list = [
      { id: 'a', deletedAt: 100, updatedAt: 50 },
      { id: 'b', deletedAt: 300, updatedAt: 10 },
      { id: 'c', deletedAt: null, updatedAt: 200 },
    ];
    expect(sortTrash(list).map((c) => c.id)).toEqual(['b', 'c', 'a']);
    // sortTrash never mutates the input.
    expect(list.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('MemoryChatRepository trash', () => {
  it('hides a deleted conversation from the list, stats and search but keeps it restorable', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertConversation(conv('c2', 20));
    await repo.insertMessage(msg('m1', 'c1', 512));
    await repo.insertMessage(msg('m2', 'c2', 48));

    await repo.deleteConversation('c1');

    // The main list shows only the survivor; the trash holds the deleted one.
    expect((await repo.listConversations()).map((c) => c.id)).toEqual(['c2']);
    const trashed = await repo.listDeletedConversations();
    expect(trashed.map((c) => c.id)).toEqual(['c1']);
    expect(typeof trashed[0].deletedAt).toBe('number');

    // Stats and search ignore everything inside the trash.
    await expect(repo.getStats()).resolves.toEqual({ conversations: 1, messages: 1, tokens: 48, countedReplies: 1 });
    expect((await repo.searchMessages('text m1')).map((h) => h.messageId)).toEqual([]);
    expect((await repo.searchMessages('text m2')).map((h) => h.messageId)).toEqual(['m2']);
  });

  it('restores a conversation back to the main list with its messages intact', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertMessage(msg('m1', 'c1', 7));

    await repo.deleteConversation('c1');
    await repo.restoreConversation('c1');

    expect((await repo.listConversations()).map((c) => c.id)).toEqual(['c1']);
    expect(await repo.listDeletedConversations()).toEqual([]);
    await expect(repo.getStats()).resolves.toEqual({ conversations: 1, messages: 1, tokens: 7, countedReplies: 1 });
    const restored = await repo.listMessages('c1');
    expect(restored.map((m) => m.id)).toEqual(['m1']);
    expect((await repo.searchMessages('text m1')).map((h) => h.messageId)).toEqual(['m1']);
  });

  it('purging removes the conversation and its messages for good', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.insertMessage(msg('m1', 'c1', null));

    await repo.deleteConversation('c1');
    await repo.purgeConversation('c1');

    expect(await repo.listConversations()).toEqual([]);
    expect(await repo.listDeletedConversations()).toEqual([]);
    expect(repo.messages.size).toBe(0);
  });

  it('purges only trash older than the retention window and reports the count', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('old', 10));
    await repo.insertConversation(conv('fresh', 20));
    await repo.insertMessage(msg('m1', 'old', null));
    await repo.insertMessage(msg('m2', 'fresh', null));

    await repo.deleteConversation('old');
    await repo.deleteConversation('fresh');
    // Age only the first one artificially: fresh keeps its just-deleted stamp.
    const old = repo.conversations.get('old');
    if (old) repo.conversations.set('old', { ...old, deletedAt: (old.deletedAt ?? 0) - TRASH_RETENTION_MS - 1 });

    const now = Date.now();
    await expect(repo.purgeExpiredTrash(TRASH_RETENTION_MS, now)).resolves.toBe(1);

    // 'fresh' is past neither window: still in the trash, untouched.
    expect(await repo.listConversations()).toEqual([]);
    expect((await repo.listDeletedConversations()).map((c) => c.id)).toEqual(['fresh']);
    expect(repo.messages.size).toBe(1);
  });

  it('keeps trashed rows out of backups and import dedupe via listConversations', async () => {
    const repo = new MemoryChatRepository();
    await repo.insertConversation(conv('c1', 10));
    await repo.deleteConversation('c1');
    expect((await repo.listConversations()).some((c) => c.id === 'c1')).toBe(false);
    expect((await repo.listDeletedConversations()).map((c) => c.id)).toEqual(['c1']);
  });
});
