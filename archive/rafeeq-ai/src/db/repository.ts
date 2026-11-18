// Copyright (c) 2026 DRS AI. All rights reserved.
import { sortTrash } from '../utils/trash';
import type { ChatMessage, Conversation, MessageSearchHit } from '../types';

/** Aggregate usage counters for the settings statistics row. */
export type ChatStats = {
  conversations: number;
  messages: number;
  /** Sum of exact generated tokens across all assistant replies. */
  tokens: number;
  /** Assistant replies that carry an exact token count; the average's denominator. */
  countedReplies: number;
};

/** Persistence for conversations and messages. */
export interface ChatRepository {
  init(): Promise<void>;
  /** Aggregate counters; cheap because SQLite computes them. */
  getStats(): Promise<ChatStats>;
  listConversations(): Promise<Conversation[]>;
  insertConversation(c: Conversation): Promise<void>;
  updateConversation(
    id: string,
    patch: Partial<Pick<Conversation, 'title' | 'modelId' | 'updatedAt' | 'pinned' | 'systemPrompt' | 'archived' | 'pinnedMessageId' | 'folder' | 'remindAt' | 'summary' | 'summaryCovers'>>,
  ): Promise<void>;
  /**
   * Soft-deletes a conversation into the temporary trash: it disappears from
   * every list, search, stats and regular backups (the full export still
   * carries it) but keeps its messages so the deletion can be undone until
   * the retention window passes.
   */
  deleteConversation(id: string): Promise<void>;
  /** Moves a trashed conversation back to the main list, messages intact. */
  restoreConversation(id: string): Promise<void>;
  /** Deletes a trashed conversation and its messages permanently. */
  purgeConversation(id: string): Promise<void>;
  /** Purges every trashed conversation past the retention window; returns the count. */
  purgeExpiredTrash(retentionMs: number, now: number): Promise<number>;
  /** Conversations currently resting in the trash, most recently deleted first. */
  listDeletedConversations(): Promise<Conversation[]>;
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  insertMessage(m: ChatMessage): Promise<void>;
  updateMessage(id: string, patch: Partial<Pick<ChatMessage, 'content' | 'tokensPerSecond' | 'tokenCount'>>): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  /** Full-text search across every conversation, newest/relevant first. */
  searchMessages(query: string, limit?: number): Promise<MessageSearchHit[]>;
}

/** In-memory repository, used in unit tests and as a fallback if SQLite fails to open. */
export class MemoryChatRepository implements ChatRepository {
  conversations = new Map<string, Conversation>();
  messages = new Map<string, ChatMessage>();

  async init() {}

  async getStats(): Promise<ChatStats> {
    // Trash content is invisible everywhere, statistics included.
    const trashed = new Set([...this.conversations.values()].filter((c) => c.deletedAt).map((c) => c.id));
    let conversations = 0;
    let messages = 0;
    let tokens = 0;
    let countedReplies = 0;
    for (const c of this.conversations.values()) {
      if (!c.deletedAt) conversations += 1;
    }
    for (const m of this.messages.values()) {
      if (trashed.has(m.conversationId)) continue;
      messages += 1;
      if (typeof m.tokenCount === 'number') tokens += m.tokenCount;
      if (m.role === 'assistant' && typeof m.tokenCount === 'number') countedReplies += 1;
    }
    return { conversations, messages, tokens, countedReplies };
  }

  /** Attaches each row's newest-message preview (computed, never stored). */
  private withPreviews(list: Conversation[]): Conversation[] {
    const ids = new Set(list.map((c) => c.id));
    const lastByConversation = new Map<string, { content: string; createdAt: number }>();
    for (const m of this.messages.values()) {
      if (!ids.has(m.conversationId)) continue;
      const current = lastByConversation.get(m.conversationId);
      if (!current || m.createdAt > current.createdAt) {
        lastByConversation.set(m.conversationId, { content: m.content, createdAt: m.createdAt });
      }
    }
    return list.map((c) => {
      const last = lastByConversation.get(c.id);
      return { ...c, lastPreview: last ? last.content : null, lastMessageAt: last ? last.createdAt : null };
    });
  }

  async listConversations() {
    // Pinned first, then most recently updated; trashed rows are never listed.
    return this.withPreviews(
      [...this.conversations.values()]
        .filter((c) => !c.deletedAt)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    );
  }

  async listDeletedConversations(): Promise<Conversation[]> {
    return this.withPreviews(sortTrash([...this.conversations.values()].filter((c) => c.deletedAt)));
  }

  async insertConversation(c: Conversation) {
    this.conversations.set(c.id, { ...c });
  }

  async updateConversation(
    id: string,
    patch: Partial<Pick<Conversation, 'title' | 'modelId' | 'updatedAt' | 'pinned' | 'systemPrompt' | 'archived' | 'pinnedMessageId' | 'folder' | 'remindAt' | 'summary' | 'summaryCovers'>>,
  ) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, ...patch });
  }

  async deleteConversation(id: string) {
    const c = this.conversations.get(id);
    if (!c || c.deletedAt) return;
    this.conversations.set(id, { ...c, deletedAt: Date.now() });
  }

  async restoreConversation(id: string) {
    const c = this.conversations.get(id);
    if (c) this.conversations.set(id, { ...c, deletedAt: null });
  }

  async purgeConversation(id: string) {
    this.conversations.delete(id);
    for (const [mid, m] of this.messages) if (m.conversationId === id) this.messages.delete(mid);
  }

  async purgeExpiredTrash(retentionMs: number, now: number): Promise<number> {
    const expired = [...this.conversations.values()]
      .filter((c) => typeof c.deletedAt === 'number' && now - c.deletedAt >= retentionMs)
      .map((c) => c.id);
    for (const id of expired) await this.purgeConversation(id);
    return expired.length;
  }

  async listMessages(conversationId: string) {
    return [...this.messages.values()]
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async insertMessage(m: ChatMessage) {
    this.messages.set(m.id, { ...m });
  }

  async updateMessage(id: string, patch: Partial<Pick<ChatMessage, 'content' | 'tokensPerSecond' | 'tokenCount'>>) {
    const m = this.messages.get(id);
    if (m) this.messages.set(id, { ...m, ...patch });
  }

  async deleteMessage(id: string) {
    this.messages.delete(id);
    // A deleted message can no longer stay pinned: drop the reference quietly.
    for (const [cid, c] of this.conversations) {
      if (c.pinnedMessageId === id) this.conversations.set(cid, { ...c, pinnedMessageId: null });
    }
    // A deleted message can no longer be quoted either: surviving messages that
    // pointed at it resolve to the "missing" state instead of a dead id.
    for (const [mid, m] of this.messages) {
      if (m.replyToId === id) this.messages.set(mid, { ...m, replyToId: null });
    }
  }

  /**
   * Naive in-memory search used in unit tests and as a fallback when SQLite
   * fails to open: case-folded substring match, newest hits first.
   */
  async searchMessages(query: string, limit = 50): Promise<MessageSearchHit[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const titles = new Map(
      [...this.conversations.values()].filter((c) => !c.deletedAt).map((c) => [c.id, c.title] as const),
    );
    const hits: MessageSearchHit[] = [];
    const all = [...this.messages.values()].sort((a, b) => b.createdAt - a.createdAt);
    for (const m of all) {
      if (hits.length >= limit) break;
      // Messages of trashed conversations stay out of search results.
      if (!titles.has(m.conversationId)) continue;
      if (m.content.toLowerCase().includes(needle)) {
        hits.push({
          messageId: m.id,
          conversationId: m.conversationId,
          conversationTitle: titles.get(m.conversationId) ?? null,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        });
      }
    }
    return hits;
  }
}
