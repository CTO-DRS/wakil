// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage, Conversation, ModelInfo, Role, ThemeMode } from '../types';
import { titleFromMessage } from './format';
import { normalizeFolderName } from './folders';
import { PROMPT_BODY_MAX, PROMPT_TITLE_MAX } from './promptLimits';

export const BACKUP_FORMAT_VERSION = 1;
/**
 * The full export carries the trash, the settings and the custom models.
 * Version history: 2 added settings+customModels, 3 added the arcade block
 * (retired in v0.22.0 — old v3 files still import cleanly, the arcade block
 * inside them is ignored), 4 is the games-free format.
 */
export const FULL_BACKUP_FORMAT_VERSION = 4;

const APP_TAG = 'rafeeq-ai';

/** A saved prompt as it travels inside a backup file. */
export type BackupPrompt = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
};

/** Full on-device backup: every conversation with all of its messages, plus the prompt library. */
export type BackupPayload = {
  app: typeof APP_TAG;
  formatVersion: number;
  exportedAt: number;
  /** A full backup also carries trashed conversations here, marked by deletedAt. */
  conversations: Conversation[];
  messages: ChatMessage[];
  /** Saved-prompt library. Optional in old files; parseBackup always fills it in. */
  prompts: BackupPrompt[];
  /**
   * Full backups only (formatVersion 2): the restorable settings subset; null
   * when the file is a regular backup or its settings block is unusable.
   */
  settings?: BackupSettings | null;
  /** Full backups only: custom model definitions (URL-based, re-downloadable). */
  customModels?: ModelInfo[];
};

/**
 * The settings subset a full backup carries. Deliberately narrow: the language
 * never travels (applying it needs an RTL reload the import flow cannot do),
 * onboarding state never travels (a fresh install still greets), and the model
 * selection is restored by the importer only when that model exists on the
 * device. Values arrive unclamped; the store setters clamp on the way in.
 */
export type BackupSettings = {
  themeMode: ThemeMode;
  systemPrompt: string;
  temperature: number;
  contextSize: number;
  maxTokens: number;
  autoSpeak: boolean;
  autoSummary: boolean;
  chatFontScale: number;
  selectedModelId: string | null;
};

export type ImportSummary = {
  addedConversations: number;
  addedMessages: number;
  /** Conversations from the file that were skipped because their id already exists. */
  skippedConversations: number;
  /** Conversations restored straight into the temporary trash (full backups). */
  addedTrashed: number;
  /** Prompts restored into the library. */
  promptsAdded: number;
  /** Prompts skipped as duplicates or because the library is full. */
  promptsSkipped: number;
  /** Custom models added to the model list (full backups). */
  customModelsAdded: number;
  /** Custom models skipped as duplicates (full backups). */
  customModelsSkipped: number;
  /** True when the file carried a settings block and it was applied. */
  settingsApplied: boolean;
};

/**
 * Serializes a backup payload to pretty-printed JSON the user can keep anywhere.
 * "prompts" is optional so callers without a library still write a valid file.
 */
export function serializeBackup(
  conversations: Conversation[],
  messages: ChatMessage[],
  options: { prompts?: BackupPrompt[]; exportedAt?: number } = {},
): string {
  const payload: BackupPayload = {
    app: APP_TAG,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: options.exportedAt ?? Date.now(),
    conversations,
    messages,
    prompts: options.prompts ?? [],
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Serializes the complete device state: every conversation (trash included,
 * marked by its soft-delete stamp), every message, the prompt library, the
 * restorable settings and the custom model definitions. The importer accepts
 * this and every older format alike.
 */
export function serializeFullBackup(
  conversations: Conversation[],
  messages: ChatMessage[],
  options: {
    trashedConversations: Conversation[];
    trashedMessages: ChatMessage[];
    settings: BackupSettings;
    customModels: ModelInfo[];
    prompts?: BackupPrompt[];
    exportedAt?: number;
  },
): string {
  const payload: BackupPayload = {
    app: APP_TAG,
    formatVersion: FULL_BACKUP_FORMAT_VERSION,
    exportedAt: options.exportedAt ?? Date.now(),
    conversations: [...conversations, ...options.trashedConversations],
    messages: [...messages, ...options.trashedMessages],
    prompts: options.prompts ?? [],
    settings: options.settings,
    customModels: options.customModels,
  };
  return JSON.stringify(payload, null, 2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asTimestamp(v: unknown): number {
  return isFiniteNumber(v) ? v : 0;
}

function parseConversation(v: unknown): Conversation | null {
  if (!isRecord(v)) return null;
  const id = asString(v.id);
  if (!id) return null;
  const modelId = v.modelId === null || v.modelId === undefined ? null : asString(v.modelId);
  // Backups made before per-conversation instructions existed carry no field;
  // those conversations simply inherit the global prompt.
  const systemPrompt = asString(v.systemPrompt) ?? '';
  // Same lenient rule: absent (or broken) pin means "no pinned message".
  const pinnedMessageId = asString(v.pinnedMessageId);
  // Folders arrived after the first format: absent (or broken) means "no folder".
  const folder = normalizeFolderName(asString(v.folder) ?? '');
  // Reminders arrived later still: absent (or broken) means "none". A past stamp
  // from an old backup is kept on purpose — it simply surfaces as due at once.
  const remindAt = isFiniteNumber(v.remindAt) ? v.remindAt : null;
  // The trash stamp rides in full backups: a broken one means "not trashed".
  const deletedAt = isFiniteNumber(v.deletedAt) ? v.deletedAt : null;
  // The rolling summary arrived later still: absent (or broken) means "none".
  const summary = asString(v.summary);
  const summaryCovers = isFiniteNumber(v.summaryCovers) && v.summaryCovers >= 0 ? Math.floor(v.summaryCovers) : 0;
  return {
    id,
    title: asString(v.title) ?? '',
    modelId,
    createdAt: asTimestamp(v.createdAt),
    updatedAt: asTimestamp(v.updatedAt),
    pinned: v.pinned === true,
    // Same lenient rule as pinned: absent field (legacy backups) means false.
    archived: v.archived === true,
    systemPrompt,
    pinnedMessageId,
    folder,
    remindAt,
    deletedAt,
    summary,
    summaryCovers,
  };
}

const KNOWN_ROLES: readonly Role[] = ['user', 'assistant', 'system'];

function parseMessage(v: unknown): ChatMessage | null {
  if (!isRecord(v)) return null;
  const id = asString(v.id);
  const conversationId = asString(v.conversationId);
  const content = asString(v.content);
  if (!id || !conversationId || content === null) return null;
  const role = KNOWN_ROLES.find((r) => r === v.role);
  if (!role) return null;
  return {
    id,
    conversationId,
    role,
    content,
    createdAt: asTimestamp(v.createdAt),
    tokensPerSecond: isFiniteNumber(v.tokensPerSecond) ? v.tokensPerSecond : null,
    tokenCount: isFiniteNumber(v.tokenCount) ? v.tokenCount : null,
    // Quotes arrived after the first format: absent (or broken) means "none".
    // A dangling one is cleared during planning, not here — the planner knows
    // which ids the file actually carries.
    replyToId: asString(v.replyToId),
  };
}

function parsePrompt(v: unknown): BackupPrompt | null {
  if (!isRecord(v)) return null;
  const id = asString(v.id);
  const rawBody = asString(v.body);
  if (!id || rawBody === null) return null;
  const body = rawBody.trim().slice(0, PROMPT_BODY_MAX);
  if (!body) return null;
  // Same invariant as the store: a prompt always carries a non-empty title.
  const title = (asString(v.title) ?? '').trim().slice(0, PROMPT_TITLE_MAX) || titleFromMessage(body, 40);
  return { id, title, body, createdAt: asTimestamp(v.createdAt) };
}

const KNOWN_THEMES: readonly ThemeMode[] = ['system', 'light', 'dark'];

/**
 * Leniently reads the settings block of a full backup: every field stands
 * alone, so a half-broken block still restores what it can. Returns null when
 * the file carries no usable settings at all. Ranges are clamped later by the
 * store setters, keeping one source of truth for the valid values.
 */
export function parseBackupSettings(v: unknown): BackupSettings | null {
  if (!isRecord(v)) return null;
  return {
    themeMode: KNOWN_THEMES.find((m) => m === v.themeMode) ?? 'system',
    systemPrompt: asString(v.systemPrompt) ?? '',
    temperature: isFiniteNumber(v.temperature) ? v.temperature : 0.7,
    contextSize: isFiniteNumber(v.contextSize) ? v.contextSize : 2048,
    maxTokens: isFiniteNumber(v.maxTokens) ? v.maxTokens : 512,
    autoSpeak: v.autoSpeak === true,
    autoSummary: v.autoSummary !== false,
    chatFontScale: isFiniteNumber(v.chatFontScale) ? v.chatFontScale : 1,
    selectedModelId: asString(v.selectedModelId),
  };
}

function parseCustomModel(v: unknown): ModelInfo | null {
  if (!isRecord(v)) return null;
  const id = asString(v.id);
  const url = asString(v.url);
  const fileName = asString(v.fileName);
  // id, url and fileName are the minimum a re-downloadable model needs.
  if (!id || !url || !fileName) return null;
  return {
    id,
    name: asString(v.name) ?? '',
    description: asString(v.description) ?? '',
    url,
    fileName,
    sizeBytes: isFiniteNumber(v.sizeBytes) && v.sizeBytes >= 0 ? Math.floor(v.sizeBytes) : 0,
    params: asString(v.params) ?? '',
    quant: asString(v.quant) ?? '',
    license: asString(v.license) ?? '',
    // The backup only ever carries custom models; the field is forced so a
    // hand-edited file cannot inject entries into the built-in catalog.
    source: 'custom',
    sha256: asString(v.sha256),
  };
}

/**
 * Parses and validates backup JSON. Extremely defensive on purpose: a user may
 * hand-pick any file, so every field is checked and malformed entries are
 * dropped instead of throwing. Returns null when the file is not a Rafeeq
 * backup at all (or comes from a newer, unsupported format).
 */
export function parseBackup(json: string): BackupPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.app !== APP_TAG) return null;
  if (!isFiniteNumber(data.formatVersion) || data.formatVersion > FULL_BACKUP_FORMAT_VERSION) return null;

  if (!Array.isArray(data.conversations) || !Array.isArray(data.messages)) return null;
  // Last id wins the dedupe so a hand-edited file cannot create duplicates.
  const conversations = new Map<string, Conversation>();
  for (const entry of data.conversations) {
    const c = parseConversation(entry);
    if (c) conversations.set(c.id, c);
  }
  const messages = new Map<string, ChatMessage>();
  for (const entry of data.messages) {
    const m = parseMessage(entry);
    if (m) messages.set(m.id, m);
  }
  // The prompt library arrived with later backups: absent (or broken) field
  // means an empty library, never a rejected file — chats still restore.
  const promptEntries = Array.isArray(data.prompts) ? data.prompts : [];
  const prompts = new Map<string, BackupPrompt>();
  for (const entry of promptEntries) {
    const p = parsePrompt(entry);
    if (p) prompts.set(p.id, p);
  }
  // Full backups (formatVersion 2) also carry custom models: same dedupe rule
  // as everything else, last id wins.
  const modelEntries = Array.isArray(data.customModels) ? data.customModels : [];
  const customModels = new Map<string, ModelInfo>();
  for (const entry of modelEntries) {
    const m = parseCustomModel(entry);
    if (m) customModels.set(m.id, m);
  }
  return {
    app: APP_TAG,
    formatVersion: data.formatVersion,
    exportedAt: asTimestamp(data.exportedAt),
    conversations: [...conversations.values()],
    messages: [...messages.values()],
    prompts: [...prompts.values()],
    settings: parseBackupSettings(data.settings),
    customModels: [...customModels.values()],
  };
}

/**
 * Plans an import against the conversations already on the device: backup
 * conversations whose id already exists are skipped together with their
 * messages, so importing the same file twice never duplicates anything.
 * A full backup's trashed conversations (deletedAt set) are planned into
 * their own halves so the importer can land them back in the trash.
 */
export function planImport(
  payload: BackupPayload,
  existingConversationIds: ReadonlySet<string>,
): ImportSummary & {
  conversations: Conversation[];
  messages: ChatMessage[];
  /** Trashed half of a full backup; restored with the soft-delete stamp intact. */
  trashedConversations: Conversation[];
  trashedMessages: ChatMessage[];
} {
  const fresh = payload.conversations.filter((c) => !existingConversationIds.has(c.id));
  const conversations = fresh.filter((c) => !c.deletedAt);
  const trashedConversations = fresh.filter((c) => !!c.deletedAt);
  const accepted = new Set(fresh.map((c) => c.id));
  const fileMessages = payload.messages.filter((m) => accepted.has(m.conversationId));
  const trashedIds = new Set(trashedConversations.map((c) => c.id));
  const messages = fileMessages.filter((m) => !trashedIds.has(m.conversationId));
  const trashedMessages = fileMessages.filter((m) => trashedIds.has(m.conversationId));
  // A pin pointing at a message the file does not carry (hand-edited backup)
  // would dangle forever: restore such conversations with the pin cleared.
  const messageIds = new Set(fileMessages.map((m) => m.id));
  const repin = (c: Conversation): Conversation =>
    c.pinnedMessageId && !messageIds.has(c.pinnedMessageId) ? { ...c, pinnedMessageId: null } : c;
  // Same leniency for quotes: a quote pointing outside the file would dangle,
  // so imported messages land with it cleared.
  const dequote = (m: ChatMessage): ChatMessage =>
    m.replyToId && !messageIds.has(m.replyToId) ? { ...m, replyToId: null } : m;
  return {
    conversations: conversations.map(repin),
    messages: messages.map(dequote),
    trashedConversations: trashedConversations.map(repin),
    trashedMessages: trashedMessages.map(dequote),
    addedConversations: conversations.length,
    addedMessages: messages.length,
    skippedConversations: payload.conversations.length - fresh.length,
    addedTrashed: trashedConversations.length,
    promptsAdded: 0,
    promptsSkipped: 0,
    customModelsAdded: 0,
    customModelsSkipped: 0,
    settingsApplied: false,
  };
}

/**
 * Plans the custom-model part of a full import: models already known (by id or
 * by download URL) are skipped, and repeats inside the file itself collapse —
 * the same two keys addFromUrl dedupes on.
 */
export function planModelImport(
  incoming: readonly ModelInfo[],
  existingIds: ReadonlySet<string>,
  existingUrls: ReadonlySet<string>,
): { added: ModelInfo[]; skipped: number } {
  const seenIds = new Set(existingIds);
  const seenUrls = new Set(existingUrls);
  const added: ModelInfo[] = [];
  let skipped = 0;
  for (const model of incoming) {
    if (seenIds.has(model.id) || seenUrls.has(model.url)) {
      skipped += 1;
      continue;
    }
    seenIds.add(model.id);
    seenUrls.add(model.url);
    added.push(model);
  }
  return { added, skipped };
}

/**
 * Plans the prompt-library part of an import against what is already in the
 * library: prompts whose id exists are skipped, and the library cap is
 * respected — the file order (newest first) decides which ones win the room.
 */
export function planPromptImport(
  incoming: readonly BackupPrompt[],
  existingIds: ReadonlySet<string>,
  maxPrompts: number,
): { added: BackupPrompt[]; skipped: number } {
  const room = Math.max(0, maxPrompts - existingIds.size);
  const seen = new Set<string>(existingIds);
  const added: BackupPrompt[] = [];
  let skipped = 0;
  for (const item of incoming) {
    if (seen.has(item.id) || added.length >= room) {
      skipped += 1;
      continue;
    }
    seen.add(item.id);
    added.push(item);
  }
  return { added, skipped };
}
