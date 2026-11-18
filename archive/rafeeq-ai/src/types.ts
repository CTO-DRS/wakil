// Copyright (c) 2026 DRS AI. All rights reserved.

export type Role = 'system' | 'user' | 'assistant';

export type Conversation = {
  id: string;
  title: string;
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Pinned conversations stay at the top of every list. */
  pinned: boolean;
  /**
   * Archived conversations are hidden from the main list behind an explicit
   * toggle; they stay searchable and keep their persona and messages.
   */
  archived: boolean;
  /** The one message pinned inside this conversation; null or absent when none. */
  pinnedMessageId?: string | null;
  /**
   * Optional folder name grouping this conversation on the home list; null or
   * absent means "no folder". The name is normalized and capped in utils/folders.
   */
  folder?: string | null;
  /**
   * Epoch ms when this conversation's follow-up reminder comes due; null or
   * absent means "no reminder". Due reminders resurface the conversation on
   * the home list. Purely local: nothing is scheduled outside the app.
   */
  remindAt?: number | null;
  /**
   * Soft-delete stamp of the temporary trash: while set, the conversation is
   * hidden from lists, search, stats and regular backups (the full export
   * carries it) but stays restorable; it is purged for good once the retention
   * window passes. Null or absent = alive.
   */
  deletedAt?: number | null;
  /** One-line preview of the newest message; computed when conversations are listed. */
  lastPreview?: string | null;
  /** Created-at of the newest message; computed when conversations are listed. */
  lastMessageAt?: number | null;
  /**
   * Per-conversation instructions that override the global default prompt;
   * empty or missing means "inherit the global setting".
   */
  systemPrompt?: string;
  /**
   * Rolling summary of the turns the context window had to drop (the
   * summarizing memory); null or absent means "no summary yet". Injected
   * into the system prompt of every later turn.
   */
  summary?: string | null;
  /** How many of the earliest usable messages the rolling summary covers. */
  summaryCovers?: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Generation speed for assistant messages, when known. */
  tokensPerSecond: number | null;
  /** Exact generated tokens for assistant replies, when the engine reports them. */
  tokenCount: number | null;
  /**
   * Id of the earlier message this one quotes (the "reply to" affordance);
   * null or absent means the message quotes nothing. Quotes always point
   * backward in time: they are set from an existing message when sending.
   */
  replyToId?: string | null;
};

/** A message hit returned by the global search across conversations. */
export type MessageSearchHit = {
  messageId: string;
  conversationId: string;
  /** Title of the conversation the hit belongs to, when it still exists. */
  conversationTitle: string | null;
  role: Role;
  content: string;
  createdAt: number;
};

export type ModelSource = 'catalog' | 'custom' | 'voice';

export type ModelInfo = {
  id: string;
  name: string;
  /** i18n key for the description (catalog) or literal text (custom). */
  description: string;
  url: string;
  fileName: string;
  /** Size in bytes, 0 if unknown. */
  sizeBytes: number;
  params: string;
  quant: string;
  license: string;
  source: ModelSource;
  /** SHA-256 of the file (lowercase hex) verified after download, when known. */
  sha256?: string | null;
  /**
   * Voice models only: the ISO language the model is tuned for, pinned for
   * transcription (the Saudi dialectal fine-tune wants 'ar' — detection on a
   * dialect clip wastes a decode pass and occasionally misfires). Absent = the
   * multilingual model detects the language itself.
   */
  voiceLanguage?: string;
};

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'downloaded' | 'error';

export type ModelFileState = {
  status: DownloadStatus;
  bytesWritten: number;
  totalBytes: number;
  error: string | null;
  /** Serialized resume state from the download task, when paused. */
  resumeState: unknown | null;
  /** Live transfer speed in bytes/s while downloading (transient). */
  speedBps?: number;
  /**
   * Set when the pause was NOT the user's choice (an app kill, a stall watchdog
   * fire): startup may resume these automatically. A deliberate user pause
   * never resumes without a tap. Absent/false = user-initiated.
   */
  autoResume?: boolean;
};

export type ThemeMode = 'system' | 'light' | 'dark';
export type Language = 'ar' | 'en';
