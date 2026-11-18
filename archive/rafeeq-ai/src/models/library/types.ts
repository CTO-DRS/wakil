// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The model library's data contract: twelve task categories, every entry a
 * real, publicly documented model with bilingual metadata. Two availability
 * states keep the catalog honest:
 *
 *  - 'integrated' → wired into Rafeeq's runtime (downloadable GGUF chat
 *    models, the whisper voices, the built-in Saudi TTS). These carry a
 *    `kind` the detail screen turns into real actions.
 *  - 'catalog'   → documented capability only. No download button, no fake
 *    runtime: the detail page says plainly that the model is not runnable
 *    on-device yet.
 *
 * Prices are never invented: the `cost` field states what the license actually
 * implies (free/open-source, non-commercial, or "check the official page").
 */

export type LibraryCategoryId =
  | 'image'
  | 'video'
  | 'chat'
  | 'audio'
  | 'stt'
  | 'tts'
  | 'imageEdit'
  | 'imageUnderstand'
  | 'coding'
  | 'threeD'
  | 'translation'
  | 'research';

export type LibraryAvailability = 'integrated' | 'catalog';

/** What the detail screen can actually DO with an integrated entry. */
export type LibraryKind = 'llm' | 'voice' | 'builtin';

export type LibraryText = { readonly ar: string; readonly en: string };

export type LibraryModel = {
  /** Unique, stable, `lib.` prefixed — never collides with download ids. */
  readonly id: string;
  readonly categoryId: LibraryCategoryId;
  readonly name: string;
  readonly developer: string;
  /** The license exactly as the official page states it; null when undeclared. */
  readonly license: string | null;
  readonly availability: LibraryAvailability;
  /** For integrated entries: the downloadable CATALOG/VOICE model id it maps to. */
  readonly integratedRef?: string;
  readonly kind?: LibraryKind;
  /** Official model page (Hugging Face repo or the developer's page). */
  readonly url: string;
  /** Human-readable parameter count ("7B"); null when the page does not state one. */
  readonly params?: string | null;
  readonly quant?: string | null;
  /** Exact byte size — only ever set for the integrated downloads. */
  readonly sizeBytes?: number;
  readonly io: { readonly in: string; readonly out: string };
  readonly requirements: LibraryText;
  readonly quality: LibraryText;
  readonly limits: LibraryText;
  readonly cost: LibraryText;
  readonly desc: LibraryText;
  readonly features: { readonly ar: readonly string[]; readonly en: readonly string[] };
  /** Lowercase search tokens (names, developers, Arabic synonyms). */
  readonly tags: readonly string[];
};

export type LibraryCategory = {
  readonly id: LibraryCategoryId;
  readonly icon: string;
  /** Bilingual name + one-line description for the category card. */
  readonly name: LibraryText;
  readonly desc: LibraryText;
};
