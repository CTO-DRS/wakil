// Copyright (c) 2026 DRS AI. All rights reserved.
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { ChatMessage, Conversation, MessageSearchHit, Role } from '../types';
import type { ChatRepository, ChatStats } from './repository';
import { normalizeSearchText } from '../utils/searchText';

const SCHEMA_VERSION = 11;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      model_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      tokens_per_second REAL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  `,
  2: `
    ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
  `,
  3: `
    ALTER TABLE conversations ADD COLUMN system_prompt TEXT NOT NULL DEFAULT '';
  `,
  4: `
    ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
  `,
  5: `
    ALTER TABLE messages ADD COLUMN token_count INTEGER;
  `,
  6: `
    ALTER TABLE conversations ADD COLUMN pinned_message_id TEXT;
  `,
  7: `
    ALTER TABLE conversations ADD COLUMN deleted_at INTEGER;
  `,
  8: `
    ALTER TABLE conversations ADD COLUMN folder TEXT;
  `,
  9: `
    ALTER TABLE conversations ADD COLUMN remind_at INTEGER;
  `,
  10: `
    ALTER TABLE messages ADD COLUMN reply_to TEXT;
  `,
  11: `
    ALTER TABLE conversations ADD COLUMN summary TEXT;
    ALTER TABLE conversations ADD COLUMN summary_covers INTEGER NOT NULL DEFAULT 0;
  `,
};

type ConversationRow = {
  id: string;
  title: string;
  model_id: string | null;
  created_at: number;
  updated_at: number;
  pinned: number;
  last_preview: string | null;
  last_message_at: number | null;
  system_prompt: string;
  archived: number;
  pinned_message_id: string | null;
  deleted_at: number | null;
  folder: string | null;
  remind_at: number | null;
  summary: string | null;
  summary_covers: number;
};
type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
  tokens_per_second: number | null;
  token_count: number | null;
  reply_to: string | null;
};

type SearchRow = MessageRow & { conversation_title: string | null };

type ChatStatsRow = {
  conversations: number;
  messages: number;
  tokens: number;
  counted_replies: number;
};

/**
 * Builds an FTS5 MATCH expression from free user input: every whitespace-separated
 * token is quoted (implicit AND) and the last one becomes a prefix, so "رح" finds
 * "رحلتي". Double quotes inside tokens are doubled per FTS5 escaping rules.
 * Pass already-normalized text (normalizeSearchText) when matching the index.
 */
export function buildFtsMatchQuery(input: string): string {
  const tokens = input.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  const quoted = tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
  return `${quoted}*`;
}

export class SqliteChatRepository implements ChatRepository {
  private db: SQLiteDatabase | null = null;

  /** Whether the full-text index is active on this device (otherwise search falls back to LIKE). */
  private fts = false;

  get ftsEnabled() {
    return this.fts;
  }

  /**
   * Standalone FTS5 index storing the *normalized* message text (Arabic harakat
   * and tatweel stripped, lowercased), keyed by messages.rowid. unicode61 splits
   * words at Arabic combining marks, so indexing normalized text is the only way
   * to make "مرحبا" match "مُرَحِّبًا". Maintained manually at every write; if
   * the device SQLite lacks FTS5 the setup below fails and search silently uses
   * the LIKE fallback.
   */
  private static readonly FTS_SETUP = `
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      tokenize='unicode61 remove_diacritics 2'
    );
  `;

  /**
   * Inserts the normalized text of one message into the index. Standalone FTS5
   * tables manage their own content, so plain rowid DELETEs keep it in sync.
   */
  private indexMessage(id: string, content: string) {
    return this.conn.runAsync(
      'INSERT INTO messages_fts(rowid, content) SELECT rowid, ? FROM messages WHERE id = ?',
      normalizeSearchText(content),
      id,
    );
  }

  /** Removes one message (or all messages of a conversation) from the index. */
  private deindex(where: { id?: string; conversationId?: string }) {
    if (where.id !== undefined) {
      return this.conn.runAsync('DELETE FROM messages_fts WHERE rowid = (SELECT rowid FROM messages WHERE id = ?)', where.id);
    }
    return this.conn.runAsync(
      'DELETE FROM messages_fts WHERE rowid IN (SELECT rowid FROM messages WHERE conversation_id = ?)',
      where.conversationId ?? '',
    );
  }

  private get conn(): SQLiteDatabase {
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  async init() {
    if (this.db) return;
    const db = await openDatabaseAsync('rafeeq.db');
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let version = row?.user_version ?? 0;
    while (version < SCHEMA_VERSION) {
      version += 1;
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version}`);
    }
    // Capability-detected search index. The index stores normalized text, so a
    // count mismatch (first run after upgrade, crash mid-write) triggers a full
    // JS-side rebuild. Failures leave plain-LIKE search.
    try {
      await db.execAsync(SqliteChatRepository.FTS_SETUP);
      const ftsCount = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM messages_fts');
      const msgCount = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM messages');
      if ((ftsCount?.n ?? 0) !== (msgCount?.n ?? 0)) {
        await db.execAsync('DELETE FROM messages_fts');
        const all = await db.getAllAsync<{ rowid: number; content: string }>('SELECT rowid, content FROM messages');
        for (const r of all) {
          await db.runAsync('INSERT INTO messages_fts(rowid, content) VALUES (?, ?)', r.rowid, normalizeSearchText(r.content));
        }
      }
      this.fts = true;
    } catch {
      this.fts = false;
    }
    this.db = db;
  }

  async listConversations(): Promise<Conversation[]> {
    // Correlated subqueries pick each conversation's newest message; the
    // (conversation_id, created_at) index makes them a cheap index seek per row.
    // Trashed rows (deleted_at set) are never part of the working list.
    const rows = await this.conn.getAllAsync<ConversationRow>(
      `SELECT c.id, c.title, c.model_id, c.created_at, c.updated_at, c.pinned, c.system_prompt, c.archived, c.pinned_message_id, c.folder, c.remind_at, c.summary, c.summary_covers,
        (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_preview,
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
      FROM conversations c
      WHERE c.deleted_at IS NULL
      ORDER BY c.pinned DESC, c.updated_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      modelId: r.model_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      pinned: r.pinned === 1,
      lastPreview: r.last_preview ?? null,
      lastMessageAt: r.last_message_at ?? null,
      systemPrompt: r.system_prompt,
      archived: r.archived === 1,
      pinnedMessageId: r.pinned_message_id ?? null,
      folder: r.folder ?? null,
      remindAt: r.remind_at ?? null,
      summary: r.summary ?? null,
      summaryCovers: r.summary_covers ?? 0,
    }));
  }

  async listDeletedConversations(): Promise<Conversation[]> {
    const rows = await this.conn.getAllAsync<ConversationRow>(
      `SELECT c.id, c.title, c.model_id, c.created_at, c.updated_at, c.pinned, c.system_prompt, c.archived, c.pinned_message_id, c.deleted_at, c.folder, c.remind_at, c.summary, c.summary_covers,
        (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_preview,
        (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
      FROM conversations c
      WHERE c.deleted_at IS NOT NULL
      ORDER BY c.deleted_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      modelId: r.model_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      pinned: r.pinned === 1,
      lastPreview: r.last_preview ?? null,
      lastMessageAt: r.last_message_at ?? null,
      systemPrompt: r.system_prompt,
      archived: r.archived === 1,
      pinnedMessageId: r.pinned_message_id ?? null,
      deletedAt: r.deleted_at ?? null,
      folder: r.folder ?? null,
      remindAt: r.remind_at ?? null,
      summary: r.summary ?? null,
      summaryCovers: r.summary_covers ?? 0,
    }));
  }

  async insertConversation(c: Conversation) {
    await this.conn.runAsync(
      'INSERT INTO conversations (id, title, model_id, created_at, updated_at, pinned, system_prompt, archived, pinned_message_id, deleted_at, folder, remind_at, summary, summary_covers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      c.id,
      c.title,
      c.modelId,
      c.createdAt,
      c.updatedAt,
      c.pinned ? 1 : 0,
      c.systemPrompt ?? '',
      c.archived ? 1 : 0,
      c.pinnedMessageId ?? null,
      c.deletedAt ?? null,
      c.folder ?? null,
      c.remindAt ?? null,
      c.summary ?? null,
      c.summaryCovers ?? 0,
    );
  }

  async updateConversation(
    id: string,
    patch: Partial<Pick<Conversation, 'title' | 'modelId' | 'updatedAt' | 'pinned' | 'systemPrompt' | 'archived' | 'pinnedMessageId' | 'folder' | 'remindAt' | 'summary' | 'summaryCovers'>>,
  ) {
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    if (patch.title !== undefined) {
      sets.push('title = ?');
      args.push(patch.title);
    }
    if (patch.modelId !== undefined) {
      sets.push('model_id = ?');
      args.push(patch.modelId);
    }
    if (patch.updatedAt !== undefined) {
      sets.push('updated_at = ?');
      args.push(patch.updatedAt);
    }
    if (patch.pinned !== undefined) {
      sets.push('pinned = ?');
      args.push(patch.pinned ? 1 : 0);
    }
    if (patch.systemPrompt !== undefined) {
      sets.push('system_prompt = ?');
      args.push(patch.systemPrompt);
    }
    if (patch.archived !== undefined) {
      sets.push('archived = ?');
      args.push(patch.archived ? 1 : 0);
    }
    if (patch.pinnedMessageId !== undefined) {
      sets.push('pinned_message_id = ?');
      args.push(patch.pinnedMessageId ?? null);
    }
    if (patch.folder !== undefined) {
      sets.push('folder = ?');
      args.push(patch.folder ?? null);
    }
    if (patch.remindAt !== undefined) {
      sets.push('remind_at = ?');
      args.push(patch.remindAt ?? null);
    }
    if (patch.summary !== undefined) {
      sets.push('summary = ?');
      args.push(patch.summary ?? null);
    }
    if (patch.summaryCovers !== undefined) {
      sets.push('summary_covers = ?');
      args.push(patch.summaryCovers);
    }
    if (!sets.length) return;
    await this.conn.runAsync(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`, ...args, id);
  }

  async deleteConversation(id: string) {
    // Soft delete: drop the conversation from the search index but keep the
    // rows so the deletion can be undone until the trash is purged.
    if (this.fts) await this.deindex({ conversationId: id });
    await this.conn.runAsync('UPDATE conversations SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', Date.now(), id);
  }

  async restoreConversation(id: string) {
    await this.conn.runAsync('UPDATE conversations SET deleted_at = NULL WHERE id = ?', id);
    // Back into every list also means back into the search index.
    if (this.fts) {
      const rows = await this.conn.getAllAsync<{ id: string; content: string }>(
        'SELECT id, content FROM messages WHERE conversation_id = ?',
        id,
      );
      for (const r of rows) await this.indexMessage(r.id, r.content);
    }
  }

  async purgeConversation(id: string) {
    // The FTS rows were already dropped by the soft delete; the extra deindex
    // keeps a purge-after-restore-without-reindex path safe as well.
    if (this.fts) await this.deindex({ conversationId: id });
    await this.conn.runAsync('DELETE FROM messages WHERE conversation_id = ?', id);
    await this.conn.runAsync('DELETE FROM conversations WHERE id = ?', id);
  }

  async purgeExpiredTrash(retentionMs: number, now: number): Promise<number> {
    const rows = await this.conn.getAllAsync<{ id: string }>(
      'SELECT id FROM conversations WHERE deleted_at IS NOT NULL AND deleted_at <= ?',
      now - retentionMs,
    );
    for (const r of rows) await this.purgeConversation(r.id);
    return rows.length;
  }

  async getStats(): Promise<ChatStats> {
    // Trash content is invisible everywhere, statistics included.
    const row = await this.conn.getFirstAsync<ChatStatsRow>(
      `SELECT
         (SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL) AS conversations,
         (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.deleted_at IS NULL) AS messages,
         (SELECT COALESCE(SUM(m.token_count), 0) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.deleted_at IS NULL) AS tokens,
         (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE c.deleted_at IS NULL AND m.role = 'assistant' AND m.token_count IS NOT NULL) AS counted_replies`,
    );
    return {
      conversations: row?.conversations ?? 0,
      messages: row?.messages ?? 0,
      tokens: row?.tokens ?? 0,
      countedReplies: row?.counted_replies ?? 0,
    };
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.conn.getAllAsync<MessageRow>(
      'SELECT id, conversation_id, role, content, created_at, tokens_per_second, token_count, reply_to FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      conversationId,
    );
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role as Role,
      content: r.content,
      createdAt: r.created_at,
      tokensPerSecond: r.tokens_per_second,
      tokenCount: r.token_count,
      replyToId: r.reply_to ?? null,
    }));
  }

  async insertMessage(m: ChatMessage) {
    await this.conn.runAsync(
      'INSERT INTO messages (id, conversation_id, role, content, created_at, tokens_per_second, token_count, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      m.id,
      m.conversationId,
      m.role,
      m.content,
      m.createdAt,
      m.tokensPerSecond,
      m.tokenCount,
      m.replyToId ?? null,
    );
    if (this.fts) await this.indexMessage(m.id, m.content);
  }

  async updateMessage(id: string, patch: Partial<Pick<ChatMessage, 'content' | 'tokensPerSecond' | 'tokenCount'>>) {
    if (patch.content !== undefined) {
      if (this.fts) await this.deindex({ id });
      await this.conn.runAsync('UPDATE messages SET content = ? WHERE id = ?', patch.content, id);
      if (this.fts) await this.indexMessage(id, patch.content);
    }
    if (patch.tokensPerSecond !== undefined) {
      await this.conn.runAsync('UPDATE messages SET tokens_per_second = ? WHERE id = ?', patch.tokensPerSecond, id);
    }
    if (patch.tokenCount !== undefined) {
      await this.conn.runAsync('UPDATE messages SET token_count = ? WHERE id = ?', patch.tokenCount, id);
    }
  }

  async deleteMessage(id: string) {
    if (this.fts) await this.deindex({ id });
    // A deleted message can no longer stay pinned: drop the reference quietly.
    await this.conn.runAsync('UPDATE conversations SET pinned_message_id = NULL WHERE pinned_message_id = ?', id);
    // It can no longer be quoted either: surviving rows resolve to "missing".
    await this.conn.runAsync('UPDATE messages SET reply_to = NULL WHERE reply_to = ?', id);
    await this.conn.runAsync('DELETE FROM messages WHERE id = ?', id);
  }

  /**
   * Full-text search over every conversation. With FTS5: quoted-token MATCH
   * (AND semantics, prefix on the last token, bm25 relevance ranking). Without:
   * an ASCII-case-folding LIKE substring scan, newest first.
   */
  async searchMessages(query: string, limit = 50): Promise<MessageSearchHit[]> {
    const q = query.trim();
    if (!q) return [];
    const mapRow = (r: SearchRow): MessageSearchHit => ({
      messageId: r.id,
      conversationId: r.conversation_id,
      conversationTitle: r.conversation_title,
      role: r.role as Role,
      content: r.content,
      createdAt: r.created_at,
    });

    if (this.fts) {
      const match = buildFtsMatchQuery(normalizeSearchText(q));
      if (!match) return [];
      const rows = await this.conn.getAllAsync<SearchRow>(
        `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, m.tokens_per_second, c.title AS conversation_title
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         LEFT JOIN conversations c ON c.id = m.conversation_id
         WHERE messages_fts MATCH ? AND c.deleted_at IS NULL
         ORDER BY messages_fts.rank
         LIMIT ?`,
        match,
        limit,
      );
      return rows.map(mapRow);
    }

    const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    const rows = await this.conn.getAllAsync<SearchRow>(
      `SELECT m.id, m.conversation_id, m.role, m.content, m.created_at, m.tokens_per_second, c.title AS conversation_title
       FROM messages m
       LEFT JOIN conversations c ON c.id = m.conversation_id
       WHERE m.content LIKE ? ESCAPE '\\' AND c.deleted_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT ?`,
      pattern,
      limit,
    );
    return rows.map(mapRow);
  }
}
