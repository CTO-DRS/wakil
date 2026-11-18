// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * SqliteChatRepository is exercised against a real in-process SQL engine:
 * node:sqlite embeds the actual SQLite C library, and the shim below adapts it
 * to the expo-sqlite entry points the repository uses (execAsync, getFirstAsync,
 * getAllAsync, runAsync). Migrations, statements, ordering and row mapping all
 * run for real instead of against hand-written query fakes.
 */
import { SqliteChatRepository } from '../src/db/sqliteRepository';
import type { ChatMessage, Conversation } from '../src/types';

/** Optional SQL applied when the mock opens a fresh database (simulates an upgraded install). */
const mockSeed: { sql: string | null } = { sql: null };

// babel-plugin-jest-hoist lifts jest.mock above the imports, so this mock is
// registered before sqliteRepository.ts loads expo-sqlite.
jest.mock('expo-sqlite', () => ({
  __esModule: true,
  openDatabaseAsync: async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories may only require out-of-scope modules
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    if (mockSeed.sql) db.exec(mockSeed.sql);
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

const conv = (id: string, updatedAt: number, modelId: string | null = null, pinned = false): Conversation => ({
  id,
  title: `conv ${id}`,
  modelId,
  createdAt: updatedAt - 1000,
  updatedAt,
  pinned,
  archived: false,
});

const msg = (id: string, conversationId: string, createdAt: number, content = `msg ${id}`): ChatMessage => ({
  id,
  conversationId,
  role: 'user',
  content,
  createdAt,
  tokensPerSecond: null,
  tokenCount: null,
});

describe('SqliteChatRepository', () => {
  let repo: SqliteChatRepository;

  beforeEach(async () => {
    mockSeed.sql = null;
    repo = new SqliteChatRepository();
    await repo.init();
  });

  it('rejects calls made before init', async () => {
    const fresh = new SqliteChatRepository();
    await expect(fresh.listConversations()).rejects.toThrow('Database not initialized');
  });

  it('is idempotent when init is called twice', async () => {
    await expect(repo.init()).resolves.toBeUndefined();
    await repo.insertConversation(conv('c1', 100));
    await expect(repo.listConversations()).resolves.toHaveLength(1);
  });

  it('roundtrips conversations sorted by updated_at descending', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertConversation(conv('c2', 300));
    await repo.insertConversation(conv('c3', 200));
    const list = await repo.listConversations();
    expect(list.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
    expect(list[0]).toMatchObject({ id: 'c2', title: 'conv c2', modelId: null, createdAt: -700, updatedAt: 300 });
  });

  it('lists conversations with a preview of their newest message', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertConversation(conv('c2', 300)); // no messages yet → nulls
    await repo.insertMessage(msg('m1', 'c1', 100, 'أول رسالة'));
    await repo.insertMessage(msg('m2', 'c1', 200, '**آخر رسالة**'));
    const list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')).toMatchObject({ lastPreview: '**آخر رسالة**', lastMessageAt: 200 });
    const empty = list.find((c) => c.id === 'c2')!;
    expect(empty.lastPreview).toBeNull();
    expect(empty.lastMessageAt).toBeNull();
  });

  it('updates only the provided conversation fields', async () => {
    await repo.insertConversation(conv('c1', 100, 'model-a'));
    await repo.updateConversation('c1', { title: 'renamed' });
    let [row] = await repo.listConversations();
    expect(row).toMatchObject({ title: 'renamed', modelId: 'model-a', updatedAt: 100 });

    await repo.updateConversation('c1', { updatedAt: 500 });
    [row] = await repo.listConversations();
    expect(row).toMatchObject({ title: 'renamed', modelId: 'model-a', updatedAt: 500 });
  });

  it('ignores empty conversation patches', async () => {
    await repo.insertConversation(conv('c1', 100));
    await expect(repo.updateConversation('c1', {})).resolves.toBeUndefined();
    const [row] = await repo.listConversations();
    expect(row).toMatchObject({ title: 'conv c1', updatedAt: 100 });
  });

  it('roundtrips the folder field in insert and update, including clearing it', async () => {
    await repo.insertConversation({ ...conv('c1', 100), folder: 'العمل' });
    await repo.insertConversation(conv('c2', 200)); // no folder → null
    let list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')!.folder).toBe('العمل');
    expect(list.find((c) => c.id === 'c2')!.folder).toBeNull();

    await repo.updateConversation('c1', { folder: 'study' });
    list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')!.folder).toBe('study');

    // Clearing writes null, not an empty string.
    await repo.updateConversation('c1', { folder: null });
    list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')!.folder).toBeNull();
  });

  it('roundtrips the remindAt field in insert and update, including clearing it', async () => {
    await repo.insertConversation({ ...conv('c1', 100), remindAt: 1234567890 });
    await repo.insertConversation(conv('c2', 200)); // no reminder → null
    let list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')!.remindAt).toBe(1234567890);
    expect(list.find((c) => c.id === 'c2')!.remindAt).toBeNull();

    await repo.updateConversation('c1', { remindAt: 9876543210 });
    list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')!.remindAt).toBe(9876543210);

    // Clearing writes null, and the trashed list carries the stamp too.
    await repo.updateConversation('c1', { remindAt: null });
    list = await repo.listConversations();
    expect(list.find((c) => c.id === 'c1')!.remindAt).toBeNull();
    await repo.updateConversation('c1', { remindAt: 42 });
    await repo.deleteConversation('c1');
    expect((await repo.listDeletedConversations()).find((c) => c.id === 'c1')!.remindAt).toBe(42);
  });

  it('roundtrips messages in chronological order regardless of insert order', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 300));
    await repo.insertMessage(msg('m2', 'c1', 100));
    await repo.insertMessage(msg('m3', 'c1', 200));
    const list = await repo.listMessages('c1');
    expect(list.map((m) => m.id)).toEqual(['m2', 'm3', 'm1']);
    expect(list[0]).toMatchObject({ conversationId: 'c1', role: 'user', content: 'msg m2', createdAt: 100 });
  });

  it('updates message content and tokensPerSecond independently', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 100));
    await repo.updateMessage('m1', { content: 'streaming…' });
    let [row] = await repo.listMessages('c1');
    expect(row).toMatchObject({ content: 'streaming…', tokensPerSecond: null });

    await repo.updateMessage('m1', { content: 'done', tokensPerSecond: 12.5 });
    [row] = await repo.listMessages('c1');
    expect(row).toMatchObject({ content: 'done', tokensPerSecond: 12.5 });
  });

  it('deletes a single message', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 100));
    await repo.insertMessage(msg('m2', 'c1', 200));
    await repo.deleteMessage('m1');
    const list = await repo.listMessages('c1');
    expect(list.map((m) => m.id)).toEqual(['m2']);
  });

  it('soft-deletes a conversation into the trash, then purges it with its messages', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertConversation(conv('c2', 200));
    await repo.insertMessage(msg('m1', 'c1', 100));
    await repo.insertMessage(msg('m2', 'c1', 200));
    await repo.insertMessage(msg('m3', 'c2', 300));

    await repo.deleteConversation('c1');

    // Hidden from the working list, but resting in the trash with its messages.
    await expect(repo.listConversations()).resolves.toHaveLength(1);
    await expect(repo.listDeletedConversations()).resolves.toHaveLength(1);
    await expect(repo.listMessages('c1')).resolves.toHaveLength(2);

    // Purging removes the conversation and its messages for good.
    await repo.purgeConversation('c1');
    await expect(repo.listConversations()).resolves.toHaveLength(1);
    await expect(repo.listDeletedConversations()).resolves.toHaveLength(0);
    await expect(repo.listMessages('c1')).resolves.toHaveLength(0);
    const remaining = await repo.listMessages('c2');
    expect(remaining.map((m) => m.id)).toEqual(['m3']);
  });

  it('restores a trashed conversation back to the main list', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertMessage(msg('m1', 'c1', 100));

    await repo.deleteConversation('c1');
    await expect(repo.listConversations()).resolves.toHaveLength(0);
    await repo.restoreConversation('c1');
    await expect(repo.listConversations()).resolves.toHaveLength(1);
    await expect(repo.listDeletedConversations()).resolves.toHaveLength(0);
    await expect(repo.listMessages('c1')).resolves.toHaveLength(1);
  });

  it('preserves null modelId and null tokensPerSecond across the roundtrip', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertMessage(msg('m1', 'c1', 100));
    const [c] = await repo.listConversations();
    expect(c.modelId).toBeNull();
    const [m] = await repo.listMessages('c1');
    expect(m.tokensPerSecond).toBeNull();
  });

  it('keeps Arabic content intact across the roundtrip', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 100, 'مرحبًا! هذا اختبار عربي كامل 🌍'));
    const [row] = await repo.listMessages('c1');
    expect(row.content).toBe('مرحبًا! هذا اختبار عربي كامل 🌍');
  });

  it('returns empty results for unknown ids', async () => {
    await expect(repo.listMessages('does-not-exist')).resolves.toEqual([]);
    await expect(repo.deleteConversation('does-not-exist')).resolves.toBeUndefined();
    await expect(repo.deleteMessage('does-not-exist')).resolves.toBeUndefined();
  });

  it('lists pinned conversations first, then by recency', async () => {
    await repo.insertConversation(conv('c1', 100));
    await repo.insertConversation(conv('c2', 300));
    await repo.insertConversation(conv('c3', 200));

    await repo.updateConversation('c1', { pinned: true });
    let list = await repo.listConversations();
    expect(list.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(list[0].pinned).toBe(true);

    await repo.updateConversation('c1', { pinned: false });
    list = await repo.listConversations();
    expect(list.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
    expect(list[0].pinned).toBe(false);
  });

  it('inserts conversations as unpinned by default', async () => {
    await repo.insertConversation(conv('c1', 100, null, true));
    await repo.insertConversation(conv('c2', 200));
    const list = await repo.listConversations();
    expect(list.map((c) => [c.id, c.pinned])).toEqual([
      ['c1', true],
      ['c2', false],
    ]);
  });

  it('migrates a pre-pin (v1) database in place, defaulting existing rows to unpinned', async () => {
    mockSeed.sql = `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tokens_per_second REAL
      );
      INSERT INTO conversations (id, title, model_id, created_at, updated_at)
        VALUES ('old', 'legacy chat', NULL, 1, 500);
      PRAGMA user_version = 1;
    `;
    const upgraded = new SqliteChatRepository();
    await upgraded.init();

    const list = await upgraded.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'old', title: 'legacy chat', pinned: false });

    await upgraded.updateConversation('old', { pinned: true });
    expect((await upgraded.listConversations())[0].pinned).toBe(true);
  });

  it('migrates a pre-persona (v2) database in place, defaulting existing rows to no instructions', async () => {
    mockSeed.sql = `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tokens_per_second REAL
      );
      INSERT INTO conversations (id, title, model_id, created_at, updated_at, pinned)
        VALUES ('old', 'pinned legacy', NULL, 1, 500, 1);
      PRAGMA user_version = 2;
    `;
    const upgraded = new SqliteChatRepository();
    await upgraded.init();

    const list = await upgraded.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'old', title: 'pinned legacy', pinned: true, systemPrompt: '' });

    await upgraded.updateConversation('old', { systemPrompt: 'أنت مساعد موجز.' });
    expect((await upgraded.listConversations())[0].systemPrompt).toBe('أنت مساعد موجز.');
  });

  it('stores and updates per-conversation instructions alongside the other fields', async () => {
    const repo = new SqliteChatRepository();
    await repo.init();
    await repo.insertConversation({ ...conv('c1', 100), systemPrompt: 'شخصية المحادثة' });
    expect((await repo.listConversations())[0].systemPrompt).toBe('شخصية المحادثة');

    await repo.updateConversation('c1', { title: 'renamed', systemPrompt: 'أخرى' });
    expect((await repo.listConversations())[0]).toMatchObject({ title: 'renamed', systemPrompt: 'أخرى' });

    await repo.updateConversation('c1', { systemPrompt: '' });
    expect((await repo.listConversations())[0].systemPrompt).toBe('');
  });

  it('migrates a pre-archive (v3) database in place, defaulting existing rows to not archived', async () => {
    mockSeed.sql = `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        system_prompt TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tokens_per_second REAL
      );
      INSERT INTO conversations (id, title, model_id, created_at, updated_at, pinned, system_prompt)
        VALUES ('old', 'legacy', NULL, 1, 500, 1, 'شخصية قديمة');
      PRAGMA user_version = 3;
    `;
    const upgraded = new SqliteChatRepository();
    await upgraded.init();

    const list = await upgraded.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'old', pinned: true, systemPrompt: 'شخصية قديمة', archived: false });

    await upgraded.updateConversation('old', { archived: true });
    expect((await upgraded.listConversations())[0].archived).toBe(true);
  });

  it('stores and toggles the archived flag alongside the other fields', async () => {
    const repo = new SqliteChatRepository();
    await repo.init();
    await repo.insertConversation(conv('c1', 100));
    expect((await repo.listConversations())[0].archived).toBe(false);

    await repo.insertConversation({ ...conv('c2', 200), archived: true });
    await repo.updateConversation('c1', { archived: true });
    const list = await repo.listConversations();
    expect(list.map((c) => [c.id, c.archived])).toEqual([
      ['c2', true],
      ['c1', true],
    ]);

    await repo.updateConversation('c2', { archived: false, title: 'restored' });
    const c2 = (await repo.listConversations()).find((c) => c.id === 'c2');
    expect(c2).toMatchObject({ archived: false, title: 'restored' });
  });

  it('roundtrips a pinned message id, moves it and clears it with null', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 100));
    await repo.insertMessage(msg('m2', 'c1', 200));

    await repo.updateConversation('c1', { pinnedMessageId: 'm1' });
    let list = await repo.listConversations();
    expect(list[0].pinnedMessageId).toBe('m1');

    // One pin per conversation: pinning another message moves the pin.
    await repo.updateConversation('c1', { pinnedMessageId: 'm2' });
    list = await repo.listConversations();
    expect(list[0].pinnedMessageId).toBe('m2');

    await repo.updateConversation('c1', { pinnedMessageId: null });
    list = await repo.listConversations();
    expect(list[0].pinnedMessageId).toBeNull();
  });

  it('stores conversations without a pin as null and drops the pin when its message is deleted', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 100));
    await repo.insertMessage(msg('m2', 'c1', 200));
    expect((await repo.listConversations())[0].pinnedMessageId).toBeNull();

    await repo.updateConversation('c1', { pinnedMessageId: 'm1' });
    await repo.deleteMessage('m1');
    expect((await repo.listConversations())[0].pinnedMessageId).toBeNull();

    // An unrelated deletion never touches the pin.
    await repo.updateConversation('c1', { pinnedMessageId: 'm2' });
    await repo.insertMessage(msg('m3', 'c1', 300));
    await repo.deleteMessage('m3');
    expect((await repo.listConversations())[0].pinnedMessageId).toBe('m2');
  });

  it('roundtrips the replyToId quote reference and reads null back when absent', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 100));
    await repo.insertMessage({ ...msg('m2', 'c1', 200), replyToId: 'm1' });
    await repo.insertMessage({ ...msg('m3', 'c1', 300), replyToId: null });
    const list = await repo.listMessages('c1');
    expect(list.find((m) => m.id === 'm1')!.replyToId).toBeNull();
    expect(list.find((m) => m.id === 'm2')!.replyToId).toBe('m1');
    expect(list.find((m) => m.id === 'm3')!.replyToId).toBeNull();
  });

  it('clears quote references pointing at a deleted message, leaving others alone', async () => {
    await repo.insertConversation(conv('c1', 400));
    await repo.insertMessage(msg('m1', 'c1', 100));
    await repo.insertMessage(msg('m2', 'c1', 200));
    await repo.insertMessage(msg('m3', 'c1', 300));
    await repo.insertMessage({ ...msg('m4', 'c1', 400), replyToId: 'm1' });
    await repo.insertMessage({ ...msg('m5', 'c1', 500), replyToId: 'm2' });

    await repo.deleteMessage('m1');
    const list = await repo.listMessages('c1');
    // The quote pointing at the deleted message is nulled; the other survives.
    expect(list.find((m) => m.id === 'm4')!.replyToId).toBeNull();
    expect(list.find((m) => m.id === 'm5')!.replyToId).toBe('m2');
  });

  it('migrates a v9 database in place, adding an empty quote column', async () => {
    mockSeed.sql = `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        system_prompt TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0,
        pinned_message_id TEXT,
        deleted_at INTEGER,
        folder TEXT,
        remind_at INTEGER
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tokens_per_second REAL,
        token_count INTEGER
      );
      INSERT INTO conversations (id, title, model_id, created_at, updated_at)
        VALUES ('old', 'قديم', NULL, 1, 500);
      INSERT INTO messages (id, conversation_id, role, content, created_at)
        VALUES ('old_msg', 'old', 'user', 'مرحبا', 10);
      PRAGMA user_version = 9;
    `;
    const upgraded = new SqliteChatRepository();
    await upgraded.init();

    const messages = await upgraded.listMessages('old');
    expect(messages).toHaveLength(1);
    expect(messages[0].replyToId).toBeNull();

    // The new column is fully usable after the upgrade.
    await upgraded.insertMessage({ ...msg('new_msg', 'old', 20), replyToId: 'old_msg' });
    const after = await upgraded.listMessages('old');
    expect(after.find((m) => m.id === 'new_msg')!.replyToId).toBe('old_msg');
  });

  it('migrates a v5 database in place, adding an empty pin column', async () => {
    mockSeed.sql = `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        system_prompt TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tokens_per_second REAL,
        token_count INTEGER
      );
      INSERT INTO conversations (id, title, model_id, created_at, updated_at)
        VALUES ('old', 'قديم', NULL, 1, 500);
      PRAGMA user_version = 5;
    `;
    const upgraded = new SqliteChatRepository();
    await upgraded.init();

    const list = await upgraded.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].pinnedMessageId).toBeNull();

    // The new column is fully usable after the upgrade.
    await upgraded.updateConversation('old', { pinnedMessageId: 'anything' });
    expect((await upgraded.listConversations())[0].pinnedMessageId).toBe('anything');
  });

  it('migrates a v8 database in place, adding an empty reminder column', async () => {
    mockSeed.sql = `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        system_prompt TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0,
        pinned_message_id TEXT,
        deleted_at INTEGER,
        folder TEXT
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        tokens_per_second REAL,
        token_count INTEGER
      );
      INSERT INTO conversations (id, title, model_id, created_at, updated_at)
        VALUES ('old', 'قديم', NULL, 1, 500);
      PRAGMA user_version = 8;
    `;
    const upgraded = new SqliteChatRepository();
    await upgraded.init();

    const list = await upgraded.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].remindAt).toBeNull();

    // The new column is fully usable after the upgrade.
    await upgraded.updateConversation('old', { remindAt: 1234567890 });
    expect((await upgraded.listConversations())[0].remindAt).toBe(1234567890);
  });
});
