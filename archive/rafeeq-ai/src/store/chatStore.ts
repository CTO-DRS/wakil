// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';

import { MemoryChatRepository, type ChatRepository } from '../db/repository';
import { buildPromptMessages } from '../llm/prompt';
import type { ChatMessage, Conversation, MessageSearchHit } from '../types';
import {
  parseBackup,
  planImport,
  planModelImport,
  planPromptImport,
  serializeBackup,
  serializeFullBackup,
  type ImportSummary,
} from '../utils/backup';
import { newId, titleFromMessage } from '../utils/format';
import { normalizeFolderName } from '../utils/folders';
import { MAX_PROMPTS } from '../utils/promptLimits';
import { normalizeRemindAt } from '../utils/reminders';
import {
  buildSuggestionMessages,
  parseSuggestions,
  SUGGESTION_MAX_TOKENS,
  SUGGESTION_TEMPERATURE,
  type SuggestionsState,
} from '../utils/suggestions';
import { TRASH_RETENTION_MS } from '../utils/trash';
import {
  buildSummaryMessages,
  countDroppedMessages,
  sanitizeSummary,
  shouldSummarize,
  SUMMARY_MAX_TOKENS,
  SUMMARY_TEMPERATURE,
  withSummary,
} from '../utils/summary';
import { buildVariantMessages, sanitizeVariant, variantTemperature, VARIANT_COUNT, type VariantsState } from '../utils/variants';
import { recordEngineRun } from '../model/usage/store';
import { getEngine, useLlmStore } from './llmStore';
import { useModelStore } from './modelStore';
import { usePromptLibraryStore } from './promptLibraryStore';
import { useSettingsStore } from './settingsStore';
import { useTtsStore } from './ttsStore';

export type SendOptions = {
  systemPrompt: string;
  temperature: number;
  contextSize: number;
  maxTokens: number;
  modelId: string | null;
  fallbackTitle: string;
  /** Id of the earlier message the new user message quotes; absent means none. */
  replyTo?: string;
};

type ChatState = {
  conversations: Conversation[];
  /** Conversations resting in the temporary trash, most recently deleted first. */
  trash: Conversation[];
  currentId: string | null;
  messages: ChatMessage[];
  generating: boolean;
  streamingMessageId: string | null;
  error: string | null;
  ready: boolean;
  /** A suggestions pass is running on the engine (never beside a real turn). */
  suggesting: boolean;
  /** Smart reply choices for the newest assistant reply, or null. */
  suggestions: SuggestionsState;
  /** A variants pass is running on the engine (never beside a real turn). */
  variantsBusy: boolean;
  /** Alternate drafts of the newest assistant reply, or null. */
  variants: VariantsState;
  /** A rolling-summary pass is running on the engine (never beside a real turn). */
  summarizing: boolean;

  init: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  openConversation: (id: string | null) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  setConversationPinned: (id: string, pinned: boolean) => Promise<void>;
  /** Per-conversation instructions; empty string falls back to the global prompt. */
  setConversationSystemPrompt: (id: string, prompt: string) => Promise<void>;
  /** Archives or unarchives a conversation; archived ones hide behind the list toggle. */
  setConversationArchived: (id: string, archived: boolean) => Promise<void>;
  /** Files a conversation under a folder; null (or a blank name) removes it. */
  setConversationFolder: (id: string, folder: string | null) => Promise<void>;
  /** Schedules (or clears with null) a local follow-up reminder for a conversation. */
  setConversationReminder: (id: string, when: number | null) => Promise<void>;
  /** Pins one message inside a conversation (one at most); null clears the pin. */
  setMessagePin: (conversationId: string, messageId: string | null) => Promise<void>;
  /** Soft-deletes into the temporary trash; undoable until the trash is purged. */
  deleteConversation: (id: string) => Promise<void>;
  /** Moves a trashed conversation back to the main list. */
  restoreConversation: (id: string) => Promise<void>;
  /** Deletes a trashed conversation and its messages permanently. */
  purgeConversation: (id: string) => Promise<void>;
  /** Empties the trash: purges every conversation inside it. */
  emptyTrash: () => Promise<void>;
  /** Reloads the trash shelf from the repository. */
  refreshTrash: () => Promise<void>;
  sendMessage: (text: string, opts: SendOptions) => Promise<string | null>;
  /**
   * Agent flow, step 1: lands the user's goal as a normal user message
   * (creating the conversation when needed) WITHOUT touching the engine —
   * the agent store owns the turn from here on.
   */
  addUserMessageOnly: (text: string, opts: SendOptions) => Promise<{ conversationId: string; messageId: string } | null>;
  /**
   * Agent flow, step 2: lands the agent's final answer as a normal assistant
   * message so it survives like any other reply (preview, speech, history).
   * `silentSpeak` skips the auto-speak pass — the agent's voice-out session
   * already queued the reply sentence by sentence while it was generating, and
   * a completion-time replay would start the speech from the top again.
   */
  addAssistantMessage: (conversationId: string, text: string, opts?: { silentSpeak?: boolean }) => Promise<void>;
  regenerate: (opts: SendOptions) => Promise<string | null>;
  /** Rewrites a user message, drops everything after it, and answers again. */
  editUserMessage: (messageId: string, text: string, opts: SendOptions) => Promise<string | null>;
  /** Deletes one message from the open conversation, in state and in storage. */
  deleteMessage: (messageId: string) => Promise<void>;
  /** Global search across every conversation's messages. */
  search: (query: string) => Promise<MessageSearchHit[]>;
  /** Serializes every conversation and message into a backup JSON string. */
  exportBackup: () => Promise<string | null>;
  /**
   * Serializes the complete device state: chats and prompts plus the trash,
   * the restorable settings and the custom model definitions (format v2).
   */
  exportFullBackup: () => Promise<string | null>;
  /** Restores a backup file: adds everything whose id is not already on the device. */
  importBackup: (json: string) => Promise<ImportSummary | null>;
  stopGeneration: () => Promise<void>;
  /** Prepares smart reply choices for the newest assistant reply. */
  refreshSuggestions: () => Promise<void>;
  /** Frees the engine from a suggestions pass (no-op when idle). */
  cancelSuggestions: () => Promise<void>;
  /** Drops the current chips without touching the engine. */
  clearSuggestions: () => void;
  /**
   * Prepares 2-3 complete alternate drafts of the newest assistant reply: the
   * persisted reply itself is variant 1, extra passes warm the sampling and
   * are told what to avoid repeating. Nothing is written until keepVariant.
   */
  prepareVariants: (opts: SendOptions) => Promise<void>;
  /** Steps the active draft by +1/-1 with wrap-around (preview only). */
  cycleVariant: (step: 1 | -1) => void;
  /** Writes the previewed draft over the reply and drops the switcher. */
  keepVariant: () => Promise<void>;
  /** Drops the switcher; interrupts an in-flight pass first when one runs. */
  dismissVariants: () => Promise<void>;
  /** Frees the engine from every background pass (suggestions + variants + summary). */
  cancelBackgroundPasses: () => Promise<void>;
  /**
   * Housekeeping after a finished turn: regenerates the rolling summary when
   * enough turns fell out of the context window, then prepares the smart
   * reply choices. The two passes run one after another on the engine.
   */
  runPostTurn: () => Promise<void>;
  /** Frees the engine from a summary pass (no-op when idle). */
  cancelSummary: () => Promise<void>;
  clearError: () => void;
};

let repo: ChatRepository = new MemoryChatRepository();

/** Token of the current suggestions pass; a bump invalidates its late commit. */
let suggestionsToken = 0;
/** The in-flight suggestions pass, tracked so cancellation can await it. */
let suggestionsRun: Promise<void> | null = null;
/** Token of the current variants pass; a bump invalidates its late commit. */
let variantsToken = 0;
/** The in-flight variants pass, tracked so cancellation can await it. */
let variantsRun: Promise<void> | null = null;
/** Token of the current summary pass; a bump invalidates its late commit. */
let summaryToken = 0;
/** The in-flight summary pass, tracked so cancellation can await it. */
let summaryRun: Promise<void> | null = null;
/** Bumped at every real turn start; a follow-up suggestions pass from an older turn is dropped. */
let turnSeq = 0;

/** Swaps the persistence layer (SQLite in the app, memory in tests). */
export function setChatRepository(r: ChatRepository) {
  repo = r;
}

/** Read-only access for aggregate screens (statistics in settings). */
export function getChatRepository(): ChatRepository {
  return repo;
}

/** Canonical conversation ordering: pinned first, then most recently updated. */
export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

/**
 * Instructions actually used for a turn: the conversation's own persona when it
 * has one, otherwise the global prompt from Settings (may itself be empty — the
 * caller then substitutes the localized default).
 */
export function effectiveSystemPrompt(
  conversation: Pick<Conversation, 'systemPrompt'> | undefined,
  globalPrompt: string,
): string {
  return conversation?.systemPrompt?.trim() || globalPrompt.trim();
}

/** How often streamed tokens are flushed to React state. */
export const STREAM_FLUSH_MS = 60;

export const useChatStore = create<ChatState>()((set, get) => {
  /**
   * Shared streaming tail of sendMessage and regenerate: inserts a fresh assistant
   * message, streams tokens into it, then persists the final text (the message is
   * dropped entirely when nothing was produced).
   */
  const runAssistantTurn = async (conversationId: string, history: ChatMessage[], opts: SendOptions) => {
    const engine = getEngine();
    const assistantMsg: ChatMessage = {
      id: newId('m_'),
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: Date.now() + 1,
      tokensPerSecond: null,
      tokenCount: null,
    };
    await repo.insertMessage(assistantMsg);
    set({
      messages: [...history, assistantMsg],
      generating: true,
      streamingMessageId: assistantMsg.id,
      error: null,
    });

    const prompt = buildPromptMessages(
      history,
      // The rolling summary rides inside the system prompt: one system message
      // total, so strict chat templates keep working.
      withSummary(opts.systemPrompt, get().conversations.find((c) => c.id === conversationId)?.summary),
      opts.contextSize,
      opts.maxTokens,
    );
    let streamed = '';
    let lastFlush = 0;
    const flush = (value: string) => {
      if (get().streamingMessageId !== assistantMsg.id) return;
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsg.id ? { ...m, content: value } : m)),
      }));
    };

    let finalText = '';
    let tps: number | null = null;
    let tokens: number | null = null;
    const usageStartedAt = Date.now();
    try {
      // A smart-reply pass that slipped in between the caller's cancel and this
      // point (generating was still false then) would steal the engine: settle
      // it here, right before the real completion takes the engine.
      await get().cancelSuggestions();
      const result = await engine.complete(
        prompt,
        { temperature: opts.temperature, maxTokens: opts.maxTokens },
        (token) => {
          streamed += token;
          const t = Date.now();
          if (t - lastFlush >= STREAM_FLUSH_MS) {
            lastFlush = t;
            flush(streamed);
          }
        },
      );
      finalText = result.text || streamed.trim();
      tps = result.tokensPerSecond;
      tokens = result.tokenCount;
      recordEngineRun('chat', usageStartedAt, tokens);
    } catch (e) {
      finalText = streamed.trim();
      set({ error: e instanceof Error ? e.message : String(e) });
    }

    const stillHere = get().messages.some((m) => m.id === assistantMsg.id);
    if (finalText) {
      await repo.updateMessage(assistantMsg.id, {
        content: finalText,
        tokensPerSecond: tps,
        tokenCount: tokens,
      });
    } else {
      await repo.deleteMessage(assistantMsg.id);
    }
    const updatedAt = Date.now();
    await repo.updateConversation(conversationId, {
      updatedAt,
      modelId: opts.modelId,
    });
    // The list preview follows the newest surviving message: the finished reply,
    // or — when the turn was dropped (empty/blocked) — the user message itself.
    // Previews stay RAW here; the list UI strips Markdown once for display.
    const finalLast = finalText
      ? { preview: finalText, at: assistantMsg.createdAt }
      : history.length > 0
        ? { preview: history[history.length - 1].content, at: history[history.length - 1].createdAt }
        : null;
    set((s) => ({
      generating: false,
      streamingMessageId: null,
      messages: stillHere
        ? s.messages
            .map((m) => (m.id === assistantMsg.id ? { ...m, content: finalText, tokensPerSecond: tps, tokenCount: tokens } : m))
            .filter((m) => m.id !== assistantMsg.id || m.content.length > 0)
        : s.messages,
      conversations: sortConversations(
        s.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                updatedAt,
                modelId: opts.modelId,
                lastPreview: finalLast ? finalLast.preview : null,
                lastMessageAt: finalLast ? finalLast.at : null,
              }
            : c,
        ),
      ),
    }));

    // Auto-speak: when enabled, the finished reply is read aloud with the device
    // speech engine (the tts store strips Markdown and picks the language itself).
    if (stillHere && finalText && useSettingsStore.getState().autoSpeak) {
      useTtsStore.getState().speak(assistantMsg.id, finalText);
    }
  };

  /**
   * One background engine pass that turns the conversation so far into 2-3
   * short candidate messages the user could send next. Only refreshSuggestions
   * starts it and only cancelSuggestions interrupts it, so the engine never
   * runs a suggestions pass alongside a real turn; the token invalidates a
   * cancelled pass so its late result can never commit.
   */
  const runSuggestions = async (forMessageId: string, history: ChatMessage[]) => {
    const engine = getEngine();
    if (!engine.isLoaded()) return;
    const token = ++suggestionsToken;
    set({ suggesting: true });
    const run = (async () => {
      try {
        const nCtx = useLlmStore.getState().loadedContextSize ?? useSettingsStore.getState().contextSize;
        const prompt = buildSuggestionMessages(history, nCtx);
        const suggestionStartedAt = Date.now();
        const result = await engine.complete(
          prompt,
          { temperature: SUGGESTION_TEMPERATURE, maxTokens: SUGGESTION_MAX_TOKENS },
          () => {},
        );
        recordEngineRun('suggestions', suggestionStartedAt, result.tokenCount);
        const items = parseSuggestions(result.text || '');
        if (token !== suggestionsToken) return;
        set({ suggesting: false, suggestions: items.length > 0 ? { forMessageId, items } : null });
      } catch {
        if (token !== suggestionsToken) return;
        set({ suggesting: false, suggestions: null });
      }
    })();
    suggestionsRun = run;
    try {
      await run;
    } finally {
      if (suggestionsRun === run) suggestionsRun = null;
    }
  };

  /**
   * One background engine pass per extra draft of the newest reply. The
   * persisted reply is items[0]; each extra pass warms the sampling and gets
   * short echoes of the earlier drafts so a small local model steers away
   * from them. Only prepareVariants starts it and only dismissVariants (or a
   * real turn taking the engine) interrupts it; the token invalidates a
   * cancelled pass so its late result can never commit.
   */
  const runVariants = async (opts: SendOptions) => {
    const engine = getEngine();
    if (!engine.isLoaded()) return;
    const messages = get().messages;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.content.trim()) return;
    if (!get().currentId) return;
    const token = ++variantsToken;
    const draft: NonNullable<VariantsState> = {
      forMessageId: last.id,
      items: [last.content],
      stats: [{ tokensPerSecond: last.tokensPerSecond, tokenCount: last.tokenCount }],
      activeIndex: 0,
    };
    set({ variants: { ...draft, items: [...draft.items], stats: [...draft.stats] }, variantsBusy: true, error: null });
    const run = (async () => {
      try {
        for (let index = 1; index < VARIANT_COUNT; index++) {
          if (token !== variantsToken) return;
          const nCtx = useLlmStore.getState().loadedContextSize ?? opts.contextSize;
          const prompt = buildVariantMessages(messages, opts.systemPrompt, nCtx, opts.maxTokens, draft.items, index);
          const variantStartedAt = Date.now();
          const result = await engine.complete(
            prompt,
            { temperature: variantTemperature(opts.temperature, index), maxTokens: opts.maxTokens },
            () => {},
          );
          recordEngineRun('variants', variantStartedAt, result.tokenCount);
          if (token !== variantsToken) return;
          const clean = sanitizeVariant(result.text || '', draft.items);
          if (clean) {
            draft.items.push(clean);
            draft.stats.push({ tokensPerSecond: result.tokensPerSecond, tokenCount: result.tokenCount });
          }
        }
        if (token !== variantsToken) return;
        // Nothing usable came out (all extras were duplicates/empty): no switcher.
        set({
          variants: draft.items.length > 1 ? { ...draft, items: [...draft.items], stats: [...draft.stats] } : null,
          variantsBusy: false,
        });
      } catch {
        if (token !== variantsToken) return;
        // Keep whatever usable drafts landed before the failure; none means no switcher.
        set({
          variants: draft.items.length > 1 ? { ...draft, items: [...draft.items], stats: [...draft.stats] } : null,
          variantsBusy: false,
        });
      }
    })();
    variantsRun = run;
    try {
      await run;
    } finally {
      if (variantsRun === run) variantsRun = null;
    }
  };

  /**
   * One background engine pass that refreshes the conversation's rolling
   * summary once enough turns have fallen out of the context window. The
   * summary covers the dropped prefix of the SAME budget arithmetic the real
   * prompt uses (fitMessages), so what it remembers is exactly what the
   * model would otherwise forget. Only runPostTurn starts it and only
   * cancelSummary interrupts it; the token invalidates a cancelled pass so
   * its late result can never commit.
   */
  const runSummaryPass = async () => {
    const engine = getEngine();
    if (!engine.isLoaded()) return;
    if (get().generating || get().suggesting || get().variantsBusy || get().summarizing) return;
    const s = useSettingsStore.getState();
    if (!s.autoSummary) return;
    const conversationId = get().currentId;
    if (!conversationId) return;
    const history = get().messages;
    if (history.length === 0) return;
    const conv = get().conversations.find((c) => c.id === conversationId);
    const systemPrompt = effectiveSystemPrompt(conv, s.systemPrompt);
    const nCtx = useLlmStore.getState().loadedContextSize ?? s.contextSize;
    const dropped = countDroppedMessages(history, nCtx, s.maxTokens, systemPrompt);
    const covered = conv?.summaryCovers ?? 0;
    if (!shouldSummarize(dropped, covered)) return;
    // The uncovered part of the dropped prefix is what the model forgot since
    // the last summary. Indices refer to the usable list, matching fitMessages.
    const usable = history.filter((m) => m.role !== 'system' && m.content.trim().length > 0);
    const fresh = usable.slice(covered, dropped);
    if (fresh.length === 0) return;
    const token = ++summaryToken;
    set({ summarizing: true });
    const run = (async () => {
      try {
        const messages = buildSummaryMessages(
          conv?.summary ?? null,
          fresh.map((m) => ({ role: m.role, content: m.content })),
        );
        const summaryStartedAt = Date.now();
        const result = await engine.complete(
          messages,
          { temperature: SUMMARY_TEMPERATURE, maxTokens: SUMMARY_MAX_TOKENS },
          () => {},
        );
        recordEngineRun('summary', summaryStartedAt, result.tokenCount);
        if (token !== summaryToken) return;
        const clean = sanitizeSummary(result.text || '', conv?.summary ?? null);
        if (!clean) {
          set({ summarizing: false });
          return;
        }
        await repo.updateConversation(conversationId, { summary: clean, summaryCovers: dropped });
        set((st) => ({
          summarizing: false,
          conversations: st.conversations.map((c) =>
            c.id === conversationId ? { ...c, summary: clean, summaryCovers: dropped } : c,
          ),
        }));
      } catch {
        if (token !== summaryToken) return;
        set({ summarizing: false });
      }
    })();
    summaryRun = run;
    try {
      await run;
    } finally {
      if (summaryRun === run) summaryRun = null;
    }
  };

  return {
    conversations: [],
    trash: [],
    currentId: null,
    messages: [],
    generating: false,
    streamingMessageId: null,
    error: null,
    ready: false,
    suggesting: false,
    suggestions: null,
    variantsBusy: false,
    variants: null,
    summarizing: false,

    init: async () => {
      await repo.init();
      // Expired trash is purged once per launch, before anything is listed.
      await repo.purgeExpiredTrash(TRASH_RETENTION_MS, Date.now());
      await get().refreshConversations();
      await get().refreshTrash();
      set({ ready: true });
    },

    refreshTrash: async () => {
      set({ trash: await repo.listDeletedConversations() });
    },

    refreshConversations: async () => {
      set({ conversations: sortConversations(await repo.listConversations()) });
    },

    openConversation: async (id) => {
      if (get().generating) await get().stopGeneration();
      await get().cancelBackgroundPasses();
      if (!id) {
        set({ currentId: null, messages: [], error: null, suggestions: null });
        return;
      }
      const messages = await repo.listMessages(id);
      set({ currentId: id, messages, error: null, suggestions: null });
    },

    renameConversation: async (id, title) => {
      const clean = title.trim();
      if (!clean) return;
      await repo.updateConversation(id, { title: clean });
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, title: clean } : c)),
      }));
    },

    /** Pins or unpins a conversation; pinned ones stay at the top of every list. */
    setConversationPinned: async (id, pinned) => {
      await repo.updateConversation(id, { pinned });
      set((s) => ({
        conversations: sortConversations(s.conversations.map((c) => (c.id === id ? { ...c, pinned } : c))),
      }));
    },

    /**
     * Overrides the instructions for one conversation. Unlike rename, saving an
     * empty prompt is meaningful: it clears the override and inherits the global
     * default from Settings.
     */
    setConversationSystemPrompt: async (id, prompt) => {
      const clean = prompt.trim();
      await repo.updateConversation(id, { systemPrompt: clean });
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, systemPrompt: clean } : c)),
      }));
    },

    /**
     * Archives or restores a conversation. Archived ones stay searchable and
     * keep replying from where they were opened (e.g. from search results), but
     * the main list hides them behind the archive toggle. Archiving never
     * deletes anything and never touches the pinned flag.
     */
    setConversationArchived: async (id, archived) => {
      await repo.updateConversation(id, { archived });
      set((s) => ({
        conversations: sortConversations(s.conversations.map((c) => (c.id === id ? { ...c, archived } : c))),
      }));
    },

    /**
     * Moves a conversation into a named folder (or out of one with null/blank).
     * The name is normalized here so every caller — the move sheet, a restored
     * backup — lands on the same canonical spelling.
     */
    setConversationFolder: async (id, folder) => {
      const clean = normalizeFolderName(folder ?? '');
      await repo.updateConversation(id, { folder: clean });
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, folder: clean } : c)),
      }));
    },

    /**
     * Schedules a follow-up reminder for a conversation (null clears it). The
     * stamp is normalized here so stale or out-of-range values collapse to "no
     * reminder". The reminder surfaces inside the app only — nothing is sent
     * to the system scheduler or any server.
     */
    setConversationReminder: async (id, when) => {
      const clean = normalizeRemindAt(when, Date.now());
      await repo.updateConversation(id, { remindAt: clean });
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, remindAt: clean } : c)),
      }));
    },

    /**
     * Pins one message of a conversation (or clears the pin). One pin per
     * conversation: pinning another message simply moves the pin there. The
     * banner and the long-press menu both read the same conversation field.
     */
    setMessagePin: async (conversationId, messageId) => {
      await repo.updateConversation(conversationId, { pinnedMessageId: messageId });
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, pinnedMessageId: messageId } : c)),
      }));
    },

    deleteConversation: async (id) => {
      if (get().currentId === id && get().generating) await get().stopGeneration();
      await repo.deleteConversation(id);
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        ...(s.currentId === id ? { currentId: null, messages: [] } : {}),
      }));
      await get().refreshTrash();
    },

    restoreConversation: async (id) => {
      await repo.restoreConversation(id);
      await get().refreshConversations();
      await get().refreshTrash();
    },

    purgeConversation: async (id) => {
      await repo.purgeConversation(id);
      set((s) => ({ trash: s.trash.filter((c) => c.id !== id) }));
    },

    emptyTrash: async () => {
      for (const c of get().trash) await repo.purgeConversation(c.id);
      set({ trash: [] });
    },

    sendMessage: async (text, opts) => {
      const content = text.trim();
      if (!content || get().generating) return get().currentId;
      // Bumped synchronously before any await: a real turn from here on
      // invalidates the follow-up suggestions of the turn that just finished,
      // even when its post-turn housekeeping resumes before this send does.
      turnSeq += 1;
      // Free the engine from every background pass before starting the real turn.
      await get().cancelBackgroundPasses();
      const engine = getEngine();
      if (!engine.isLoaded()) {
        set({ error: 'NO_MODEL' });
        return get().currentId;
      }

      const now = Date.now();
      let conversationId = get().currentId;
      if (!conversationId) {
        const conv: Conversation = {
          id: newId('c_'),
          title: titleFromMessage(content) || opts.fallbackTitle,
          modelId: opts.modelId,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          archived: false,
          systemPrompt: '',
          lastPreview: content,
          lastMessageAt: now,
        };
        await repo.insertConversation(conv);
        conversationId = conv.id;
        set((s) => ({
          currentId: conv.id,
          messages: [],
          conversations: [conv, ...s.conversations],
        }));
      } else {
        // Keep the list preview in step with the message just added.
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId ? { ...c, lastPreview: content, lastMessageAt: now } : c,
          ),
        }));
      }

      const userMsg: ChatMessage = {
        id: newId('m_'),
        conversationId,
        role: 'user',
        content,
        createdAt: now,
        tokensPerSecond: null,
        tokenCount: null,
        replyToId: opts.replyTo ?? null,
      };
      await repo.insertMessage(userMsg);
      const history = [...get().messages, userMsg];
      set({ messages: history });
      await runAssistantTurn(conversationId, history, opts);
      return conversationId;
    },

    addUserMessageOnly: async (text, opts) => {
      const content = text.trim();
      if (!content) return null;
      const now = Date.now();
      let conversationId = get().currentId;
      if (!conversationId) {
        const conv: Conversation = {
          id: newId('c_'),
          title: titleFromMessage(content) || opts.fallbackTitle,
          modelId: opts.modelId,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          archived: false,
          systemPrompt: '',
          lastPreview: content,
          lastMessageAt: now,
        };
        await repo.insertConversation(conv);
        conversationId = conv.id;
        set((s) => ({
          currentId: conv.id,
          messages: [],
          conversations: [conv, ...s.conversations],
        }));
      }
      const userMsg: ChatMessage = {
        id: newId('m_'),
        conversationId,
        role: 'user',
        content,
        createdAt: now,
        tokensPerSecond: null,
        tokenCount: null,
      };
      await repo.insertMessage(userMsg);
      set((s) => ({
        messages: [...s.messages, userMsg],
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? { ...c, lastPreview: content, lastMessageAt: now } : c,
        ),
      }));
      return { conversationId, messageId: userMsg.id };
    },

    addAssistantMessage: async (conversationId, text, opts) => {
      const content = text.trim();
      if (!content) return;
      const msg: ChatMessage = {
        id: newId('m_'),
        conversationId,
        role: 'assistant',
        content,
        createdAt: Date.now() + 1,
        tokensPerSecond: null,
        tokenCount: null,
      };
      await repo.insertMessage(msg);
      const updatedAt = Date.now();
      await repo.updateConversation(conversationId, { updatedAt });
      set((s) => ({
        messages: [...s.messages, msg],
        conversations: sortConversations(
          s.conversations.map((c) =>
            c.id === conversationId ? { ...c, updatedAt, lastPreview: content, lastMessageAt: msg.createdAt } : c,
          ),
        ),
      }));
      if (useSettingsStore.getState().autoSpeak && !opts?.silentSpeak) {
        useTtsStore.getState().speak(msg.id, content);
      }
    },

    /**
     * Discards the last assistant reply and regenerates from the same context.
     * Only the trailing turn after the newest user message is removed, so earlier
     * turns stay untouched. If the reply never arrived (a dangling user message),
     * this simply answers it.
     */
    regenerate: async (opts) => {
      if (get().generating) return get().currentId;
      turnSeq += 1;
      await get().cancelBackgroundPasses();
      const conversationId = get().currentId;
      if (!conversationId) return conversationId;
      if (!getEngine().isLoaded()) {
        set({ error: 'NO_MODEL' });
        return conversationId;
      }

      const messages = get().messages;
      let lastUserIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx < 0) return conversationId;

      const history = messages.slice(0, lastUserIdx + 1);
      const removedIds = new Set(messages.slice(lastUserIdx + 1).map((m) => m.id));
      for (const m of messages.slice(lastUserIdx + 1)) await repo.deleteMessage(m.id);
      if (lastUserIdx < messages.length - 1) set({ messages: history });
      // The repository clears a pin whose message was deleted; mirror it in state.
      if (removedIds.size > 0) {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.pinnedMessageId && removedIds.has(c.pinnedMessageId) ? { ...c, pinnedMessageId: null } : c,
          ),
        }));
      }

      await runAssistantTurn(conversationId, history, opts);
      return conversationId;
    },

    /**
     * Rewrites a user message and answers it again: every message after it is
     * deleted (also from the repository), the new text replaces the old one in
     * place, and a fresh assistant turn runs on the truncated history.
     */
    editUserMessage: async (messageId, text, opts) => {
      const conversationId = get().currentId;
      if (!conversationId || get().generating) return conversationId;
      turnSeq += 1;
      await get().cancelBackgroundPasses();
      if (!getEngine().isLoaded()) {
        set({ error: 'NO_MODEL' });
        return conversationId;
      }
      const content = text.trim();
      if (!content) return conversationId;
      const messages = get().messages;
      const index = messages.findIndex((m) => m.id === messageId);
      if (index < 0 || messages[index].role !== 'user') return conversationId;

      for (const m of messages.slice(index + 1)) await repo.deleteMessage(m.id);
      await repo.updateMessage(messageId, { content });
      const removedIds = new Set(messages.slice(index + 1).map((m) => m.id));
      const history = messages
        .slice(0, index + 1)
        .map((m) => (m.id === messageId ? { ...m, content } : m));
      const editedLast = history[history.length - 1];
      set((s) => ({
        messages: history,
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastPreview: editedLast.content,
                lastMessageAt: editedLast.createdAt,
                // Rewriting history may have deleted the pinned message.
                pinnedMessageId: c.pinnedMessageId && removedIds.has(c.pinnedMessageId) ? null : c.pinnedMessageId,
              }
            : c,
        ),
      }));
      await runAssistantTurn(conversationId, history, opts);
      return conversationId;
    },

    /**
     * Deletes a single message, both from the repository and from the screen.
     * Deliberately narrow: the surrounding turns stay untouched, and deleting is
     * refused while a reply is streaming so the live message cannot vanish mid-flight.
     */
    deleteMessage: async (messageId) => {
      if (get().generating) return;
      const messages = get().messages;
      const target = messages.find((m) => m.id === messageId);
      if (!target) return;
      await repo.deleteMessage(messageId);
      set((s) => {
        const remaining = s.messages
          // The repository nulls quotes pointing at the deleted message; mirror it.
          .map((m) => (m.replyToId === messageId ? { ...m, replyToId: null } : m))
          .filter((m) => m.id !== messageId);
        const lastMsg = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        return {
          messages: remaining,
          conversations: s.conversations.map((c) =>
            c.id === target.conversationId
              ? {
                  ...c,
                  lastPreview: lastMsg ? lastMsg.content : null,
                  lastMessageAt: lastMsg ? lastMsg.createdAt : null,
                  // The repository drops a pin whose message is gone; mirror it here.
                  pinnedMessageId: c.pinnedMessageId === messageId ? null : c.pinnedMessageId,
                }
              : c,
          ),
        };
      });
      // Chips that referenced the deleted reply are invalid now.
      if (get().suggestions?.forMessageId === messageId) set({ suggestions: null });
      // So are alternate drafts of it.
      if (get().variants?.forMessageId === messageId) set({ variants: null, variantsBusy: false });
    },

    stopGeneration: async () => {
      if (!get().generating) return;
      try {
        await getEngine().stop();
      } catch {
        // ignore: engine may already be idle
      }
    },

    /**
     * Prepares smart reply choices for the newest assistant reply. Never runs
     * while a real turn streams, and a pass already in flight wins — the
     * composer row simply keeps showing its loader.
     */
    refreshSuggestions: async () => {
      if (get().generating || get().suggesting || get().summarizing) return;
      const messages = get().messages;
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant' || !last.content.trim()) {
        set({ suggestions: null });
        return;
      }
      await runSuggestions(last.id, messages);
    },

    /**
     * Frees the engine from a suggestions pass (no-op when idle): bumps the
     * token so a late result can never commit, asks the engine to stop, and
     * waits for the pass to settle. Sending, regenerating, editing and every
     * model load or release path call this first, so the engine never runs
     * two completions at once.
     */
    cancelSuggestions: async () => {
      if (!get().suggesting) return;
      suggestionsToken += 1;
      const run = suggestionsRun;
      try {
        await getEngine().stop();
      } catch {
        // Best-effort: worst case the pass finishes on its own (small maxTokens).
      }
      if (run) {
        try {
          await run;
        } catch {
          // runSuggestions never rejects; kept for safety.
        }
      }
      if (suggestionsRun === run) suggestionsRun = null;
      set({ suggesting: false, suggestions: null });
    },

    /** Drops the current chips without touching the engine. */
    clearSuggestions: () => {
      suggestionsToken += 1;
      set({ suggestions: null });
    },

    /**
     * Prepares the alternate drafts of the newest reply. Never runs beside a
     * real turn or another pass; the preview starts hidden until at least one
     * extra draft survives.
     */
    prepareVariants: async (opts) => {
      if (get().generating || get().suggesting || get().variantsBusy || get().summarizing) return;
      const engine = getEngine();
      if (!engine.isLoaded()) {
        set({ error: 'NO_MODEL' });
        return;
      }
      await runVariants(opts);
    },

    /** Steps the previewed draft; wrap-around, no engine, no storage. */
    cycleVariant: (step) => {
      const v = get().variants;
      if (!v || get().variantsBusy || v.items.length < 2) return;
      const next = (v.activeIndex + step + v.items.length) % v.items.length;
      set({ variants: { ...v, activeIndex: next } });
    },

    /**
     * Writes the previewed draft over the reply (repo + state + list preview).
     * Variant 0 is the persisted text already, so keeping it just drops the
     * switcher; navigation without keeping never touches storage either way.
     */
    keepVariant: async () => {
      const v = get().variants;
      if (!v || get().variantsBusy) return;
      const chosen = v.activeIndex;
      const content = v.items[chosen];
      const stat = v.stats[chosen] ?? { tokensPerSecond: null, tokenCount: null };
      set({ variants: null });
      if (chosen === 0 || !content) return;
      await repo.updateMessage(v.forMessageId, {
        content,
        tokensPerSecond: stat.tokensPerSecond,
        tokenCount: stat.tokenCount,
      });
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === v.forMessageId
            ? { ...m, content, tokensPerSecond: stat.tokensPerSecond, tokenCount: stat.tokenCount }
            : m,
        ),
        // Drafts only exist for the newest reply, so the list preview follows.
        conversations: s.conversations.map((c) => (c.id === s.currentId ? { ...c, lastPreview: content } : c)),
      }));
    },

    /**
     * Drops the switcher. While a pass runs, its token is invalidated, the
     * engine is asked to stop, and the pass is awaited so the engine is never
     * left running behind a cleared state.
     */
    dismissVariants: async () => {
      variantsToken += 1;
      const run = variantsRun;
      if (run) {
        try {
          await getEngine().stop();
        } catch {
          // Best-effort: worst case the pass finishes on its own.
        }
        try {
          await run;
        } catch {
          // runVariants never rejects; kept for safety.
        }
        if (variantsRun === run) variantsRun = null;
      }
      set({ variants: null, variantsBusy: false });
    },

    /**
     * Frees the engine from every background pass before a real turn, a model
     * load/release, or a conversation switch takes it over.
     */
    cancelBackgroundPasses: async () => {
      await get().cancelSuggestions();
      await get().dismissVariants();
      await get().cancelSummary();
    },

    /** Post-turn housekeeping: rolling summary first, then smart reply choices. */
    runPostTurn: async () => {
      // A real turn that starts while the summary runs takes the engine and
      // invalidates the follow-up suggestions of the finished turn.
      const seq = turnSeq;
      await runSummaryPass();
      if (seq !== turnSeq) return;
      await get().refreshSuggestions();
    },

    /** Frees the engine from a summary pass; a bump invalidates its late commit. */
    cancelSummary: async () => {
      if (!get().summarizing) return;
      summaryToken += 1;
      const run = summaryRun;
      try {
        await getEngine().stop();
      } catch {
        // Best-effort: worst case the pass finishes on its own (small maxTokens).
      }
      if (run) {
        try {
          await run;
        } catch {
          // runSummaryPass never rejects; kept for safety.
        }
      }
      if (summaryRun === run) summaryRun = null;
      set({ summarizing: false });
    },

    clearError: () => set({ error: null }),

    /** Global search across every conversation's messages. */
    search: (query) => repo.searchMessages(query),

    /** Serializes every conversation, message and saved prompt into a backup JSON string. */
    exportBackup: async () => {
      try {
        const conversations = await repo.listConversations();
        const messages: ChatMessage[] = [];
        for (const c of conversations) messages.push(...(await repo.listMessages(c.id)));
        return serializeBackup(conversations, messages, { prompts: usePromptLibraryStore.getState().items });
      } catch {
        return null;
      }
    },

    /**
     * Serializes the complete device state into one JSON string: on top of the
     * regular backup this carries the trash (with its soft-delete stamps), the
     * restorable settings subset and the custom model definitions.
     */
    exportFullBackup: async () => {
      try {
        const conversations = await repo.listConversations();
        const messages: ChatMessage[] = [];
        for (const c of conversations) messages.push(...(await repo.listMessages(c.id)));
        const trashedConversations = await repo.listDeletedConversations();
        const trashedMessages: ChatMessage[] = [];
        for (const c of trashedConversations) trashedMessages.push(...(await repo.listMessages(c.id)));
        const s = useSettingsStore.getState();
        return serializeFullBackup(conversations, messages, {
          trashedConversations,
          trashedMessages,
          settings: {
            themeMode: s.themeMode,
            systemPrompt: s.systemPrompt,
            temperature: s.temperature,
            contextSize: s.contextSize,
            maxTokens: s.maxTokens,
            autoSpeak: s.autoSpeak,
            autoSummary: s.autoSummary,
            chatFontScale: s.chatFontScale,
            selectedModelId: s.selectedModelId,
          },
          customModels: useModelStore.getState().customModels,
          prompts: usePromptLibraryStore.getState().items,
        });
      } catch {
        return null;
      }
    },

    /** Restores a backup file: adds everything whose id is not already on the device. */
    importBackup: async (json) => {
      try {
        const payload = parseBackup(json);
        if (!payload) return null;
        // Trashed ids count as existing too: restoring a backup must never
        // collide with a conversation that is merely resting in the trash.
        const existing = new Set(
          [...(await repo.listConversations()), ...(await repo.listDeletedConversations())].map((c) => c.id),
        );
        const plan = planImport(payload, existing);
        for (const c of plan.conversations) await repo.insertConversation(c);
        for (const m of plan.messages) await repo.insertMessage(m);
        // A full backup also carries its trash: rows are inserted with the
        // soft-delete stamp intact so they land back on the trash shelf.
        for (const c of plan.trashedConversations) await repo.insertConversation(c);
        for (const m of plan.trashedMessages) await repo.insertMessage(m);
        // The prompt library rides along: deduped by id and capped to its limit.
        const prompts = usePromptLibraryStore.getState();
        const promptPlan = planPromptImport(
          payload.prompts,
          new Set(prompts.items.map((i) => i.id)),
          MAX_PROMPTS,
        );
        const promptsAdded = prompts.importItems(promptPlan.added);
        // Custom models ride in full backups: deduped by id and download URL,
        // and the store re-checks both keys against the catalog as well.
        const allModels = useModelStore.getState().allModels();
        const modelPlan = planModelImport(
          payload.customModels ?? [],
          new Set(allModels.map((m) => m.id)),
          new Set(allModels.map((m) => m.url)),
        );
        const customModelsAdded = useModelStore.getState().importCustomModels(modelPlan.added);
        // Settings ride in full backups too, applied through the store setters
        // so every clamp and normalization keeps its single source of truth.
        let settingsApplied = false;
        if (payload.settings) {
          const s = useSettingsStore.getState();
          s.setThemeMode(payload.settings.themeMode);
          s.setSystemPrompt(payload.settings.systemPrompt);
          s.setTemperature(payload.settings.temperature);
          s.setContextSize(payload.settings.contextSize);
          s.setMaxTokens(payload.settings.maxTokens);
          s.setAutoSpeak(payload.settings.autoSpeak);
          s.setAutoSummary(payload.settings.autoSummary);
          s.setChatFontScale(payload.settings.chatFontScale);
          // The selection only follows the file when that model exists here
          // (catalog or a just-imported custom); otherwise the current one stays.
          if (payload.settings.selectedModelId && useModelStore.getState().getModel(payload.settings.selectedModelId)) {
            s.setSelectedModelId(payload.settings.selectedModelId);
          }
          settingsApplied = true;
        }
        // Arcade blocks from old (formatVersion 3) backups are ignored on
        // purpose: the games were retired in v0.22.0 and the chat payload
        // no longer carries them.
        await get().refreshConversations();
        await get().refreshTrash();
        return {
          addedConversations: plan.addedConversations,
          addedMessages: plan.addedMessages,
          skippedConversations: plan.skippedConversations,
          addedTrashed: plan.addedTrashed,
          promptsAdded,
          promptsSkipped: promptPlan.skipped,
          customModelsAdded,
          customModelsSkipped: modelPlan.skipped,
          settingsApplied,
        };
      } catch {
        return null;
      }
    },
  };
});
