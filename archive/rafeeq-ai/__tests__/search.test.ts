// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Global search: snippet building, FTS5 match-query building, the memory
 * repository implementation, the real-SQLite implementation (node:sqlite embeds
 * the actual SQLite C library, so the FTS5 index, triggers and MATCH queries run
 * for real), and the chatStore delegation.
 */
import { MemoryChatRepository } from '../src/db/repository';
import { SqliteChatRepository, buildFtsMatchQuery } from '../src/db/sqliteRepository';
import { setChatRepository, useChatStore } from '../src/store/chatStore';
import { matchSnippet } from '../src/utils/snippet';
import { normalizeSearchText } from '../src/utils/searchText';
import type { ChatMessage, Conversation } from '../src/types';

jest.mock('expo-sqlite', () => ({
  __esModule: true,
  openDatabaseAsync: async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories may only require out-of-scope modules
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    return {
      execAsync: async (sql: string) => {
        db.exec(sql);
      },
      getFirstAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).get(...(params as never[])) ?? null,
      getAllAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as never[])),
      runAsync: async (sql: string, ...params: unknown[]) => {
        db.prepare(sql).run(...(params as never[]));
      },
    };
  },
}));

describe('normalizeSearchText', () => {
  it('strips Arabic harakat, shadda, tanween and tatweel', () => {
    expect(normalizeSearchText('مُرَحِّبًا')).toBe('مرحبا');
    expect(normalizeSearchText('العَالــم')).toBe('العالم');
  });

  it('lowercases Latin text and leaves plain text unchanged', () => {
    expect(normalizeSearchText('Hello World')).toBe('hello world');
    expect(normalizeSearchText('مرحبا')).toBe('مرحبا');
  });
});

describe('matchSnippet', () => {
  it('splits around the first case-insensitive hit', () => {
    expect(matchSnippet('Hello World and hello again', 'world')).toEqual({
      before: 'Hello ',
      match: 'World',
      after: ' and hello again',
    });
  });

  it('adds ellipses and keeps Arabic intact', () => {
    const long = '٠١٢٣٤٥٦٧٨٩'.repeat(20) + ' المطلوب هنا ' + 'أبجد هوز'.repeat(20);
    const parts = matchSnippet(long, 'المطلوب', 20);
    expect(parts.before.startsWith('…')).toBe(true);
    expect(parts.match).toBe('المطلوب');
    expect(parts.after.startsWith(' هنا ')).toBe(true);
    expect(parts.after.endsWith('…')).toBe(true);
  });

  it('falls back to the head of the content when there is no hit', () => {
    const parts = matchSnippet('abcdef', 'zz', 4);
    expect(parts).toEqual({ before: 'abcdef', match: '', after: '' });
    const cropped = matchSnippet('abcdefghijk', 'zz', 4);
    expect(cropped).toEqual({ before: 'abcdefgh', match: '', after: '…' });
  });
});

describe('buildFtsMatchQuery', () => {
  it('quotes tokens and prefixes the last one', () => {
    expect(buildFtsMatchQuery('  hello   world ')).toBe('"hello" "world"*');
    expect(buildFtsMatchQuery('مرحبا')).toBe('"مرحبا"*');
  });

  it('escapes double quotes and returns empty for blank input', () => {
    expect(buildFtsMatchQuery('say "hi"')).toBe('"say" """hi"""*');
    expect(buildFtsMatchQuery('   ')).toBe('');
  });
});

describe('MemoryChatRepository.searchMessages', () => {
  const repo = new MemoryChatRepository();
  beforeAll(async () => {
    await repo.init();
    const c1: Conversation = { id: 'c1', title: 'Recipes', modelId: null, createdAt: 1, updatedAt: 10, pinned: false, archived: false };
    const c2: Conversation = { id: 'c2', title: 'أفكار', modelId: null, createdAt: 2, updatedAt: 20, pinned: false, archived: false };
    await repo.insertConversation(c1);
    await repo.insertConversation(c2);
    const m = (id: string, conversationId: string, createdAt: number, content: string): ChatMessage => ({
      id,
      conversationId,
      role: 'user',
      content,
      createdAt,
      tokensPerSecond: null,
      tokenCount: null,
    });
    await repo.insertMessage(m('m1', 'c1', 100, 'banana bread recipe'));
    await repo.insertMessage(m('m2', 'c1', 200, 'BANANA smoothie'));
    await repo.insertMessage(m('m3', 'c2', 300, 'وصف الخبز بالموز'));
    await repo.insertMessage(m('m4', 'c2', 400, 'لا علاقة هنا'));
  });

  it('finds case-insensitive hits across conversations with titles, newest first', async () => {
    const hits = await repo.searchMessages('banana');
    expect(hits.map((h) => h.messageId)).toEqual(['m2', 'm1']);
    expect(hits[0]).toMatchObject({ conversationTitle: 'Recipes', conversationId: 'c1', content: 'BANANA smoothie' });
  });

  it('respects the limit and returns empty for blank queries', async () => {
    expect(await repo.searchMessages('banana', 1)).toHaveLength(1);
    expect(await repo.searchMessages('   ')).toEqual([]);
    expect(await repo.searchMessages('موجود-ليس')).toEqual([]);
  });
});

describe('SqliteChatRepository.searchMessages', () => {
  let repo: SqliteChatRepository;

  const conv = (id: string, updatedAt: number): Conversation => ({
    id,
    title: `conv ${id}`,
    modelId: null,
    createdAt: updatedAt - 1000,
    updatedAt,
    pinned: false,
    archived: false,
  });
  const msg = (id: string, conversationId: string, createdAt: number, content: string, role: ChatMessage['role'] = 'user'): ChatMessage => ({
    id,
    conversationId,
    role,
    content,
    createdAt,
    tokensPerSecond: null,
    tokenCount: null,
  });

  beforeEach(async () => {
    repo = new SqliteChatRepository();
    await repo.init();
  });

  it('enables the FTS5 index on this SQLite build', () => {
    expect(repo.ftsEnabled).toBe(true);
  });

  it('searches across conversations and joins the conversation title', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertConversation(conv('c2', 200));
    await repo.insertMessage(msg('m1', 'c1', 100, 'banana bread'));
    await repo.insertMessage(msg('m2', 'c2', 200, 'banana smoothie'));
    await repo.insertMessage(msg('m3', 'c2', 300, 'nothing relevant'));
    const hits = await repo.searchMessages('banana');
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.conversationTitle).sort()).toEqual(['conv c1', 'conv c2']);
    expect(hits[0]).toMatchObject({ messageId: expect.any(String), role: 'user', content: expect.stringContaining('banana') });
  });

  it('matches word prefixes and Arabic without diacritics', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertMessage(msg('m1', 'c1', 100, 'رحلتي مع البرمجة'));
    await repo.insertMessage(msg('m2', 'c1', 200, 'مُرَحِّبًا بالعالم'));
    expect((await repo.searchMessages('رح')).map((h) => h.messageId)).toEqual(['m1']);
    expect((await repo.searchMessages('مرحبا')).map((h) => h.messageId)).toEqual(['m2']);
  });

  it('keeps the index in sync on delete and update', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertMessage(msg('m1', 'c1', 100, 'selective secret'));
    expect(await repo.searchMessages('secret')).toHaveLength(1);

    // The streamed placeholder → final text path goes through updateMessage.
    await repo.updateMessage('m1', { content: 'placeholder' });
    expect(await repo.searchMessages('secret')).toHaveLength(0);
    await repo.updateMessage('m1', { content: 'the final answer mentions secret again' });
    expect(await repo.searchMessages('secret')).toHaveLength(1);

    await repo.deleteMessage('m1');
    expect(await repo.searchMessages('secret')).toHaveLength(0);
  });

  it('drops every hit of a deleted conversation', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertConversation(conv('c2', 200));
    await repo.insertMessage(msg('m1', 'c1', 100, 'delete me needle'));
    await repo.insertMessage(msg('m2', 'c2', 200, 'keep me'));
    await repo.deleteConversation('c1');
    const hits = await repo.searchMessages('needle');
    expect(hits).toHaveLength(0);
    expect(await repo.searchMessages('keep')).toHaveLength(1);
  });

  it('returns empty for blank or quote-only queries and tolerates LIKE wildcards', async () => {
    expect(await repo.searchMessages('   ')).toEqual([]);
    expect(await repo.searchMessages('""')).toEqual([]);
    await repo.insertConversation(conv('c1', 100));
    await repo.insertMessage(msg('m1', 'c1', 100, '100% sure_thing'));
    // FTS token path: % and _ are plain characters, no wildcard semantics.
    expect(await repo.searchMessages('100%')).toHaveLength(1);
    expect(await repo.searchMessages('sure_thing')).toHaveLength(1);
  });

  it('falls back to a LIKE substring scan when FTS5 is unavailable', async () => {
    (repo as unknown as { fts: boolean }).fts = false;
    await repo.insertConversation(conv('c1', 100));
    await repo.insertMessage(msg('m1', 'c1', 100, 'Midnight in Cairo'));
    await repo.insertMessage(msg('m2', 'c1', 200, '100% literal'));
    expect((await repo.searchMessages('midnight')).map((h) => h.messageId)).toEqual(['m1']);
    // LIKE wildcards in user input stay literal thanks to ESCAPE.
    expect(await repo.searchMessages('100%')).toHaveLength(1);
    expect(await repo.searchMessages('in ca')).toHaveLength(1);
    expect(await repo.searchMessages('نون')).toEqual([]);
  });
});

describe('chatStore.search', () => {
  it('delegates to the active repository', async () => {
    const repo = new MemoryChatRepository();
    setChatRepository(repo);
    useChatStore.setState({ conversations: [], currentId: null, messages: [], generating: false, streamingMessageId: null, error: null });
    await repo.init();
    await repo.insertConversation({ id: 'c1', title: 't', modelId: null, createdAt: 1, updatedAt: 2, pinned: false, archived: false });
    await repo.insertMessage({ id: 'm1', conversationId: 'c1', role: 'assistant', content: 'unique zebra', createdAt: 5, tokensPerSecond: null, tokenCount: null });
    const hits = await useChatStore.getState().search('zebra');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ messageId: 'm1', conversationTitle: 't', role: 'assistant' });
  });
});
