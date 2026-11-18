// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * On-device text-to-speech built on the platform speech engine (expo-speech).
 * Synthesis runs locally through the engine already installed on the device —
 * no audio ever leaves the phone and no new permission is required.
 *
 * Pure helpers (Markdown stripping, chunking, language detection, voice picking)
 * live here next to the engine wrapper so stores and tests share one source.
 */

export type SpeakOpts = {
  /** BCP-47 language tag, e.g. 'ar' or 'en'. */
  language?: string;
  /** Voice identifier from getVoices(); the engine picks a default when absent. */
  voice?: string;
  /** Speaking rate, 1.0 is normal. */
  rate?: number;
  onDone?: () => void;
  onError?: () => void;
};

export type SpeechVoiceInfo = {
  identifier: string;
  language: string;
  /** 'Enhanced' voices sound better; treated as a preference, not a requirement. */
  quality?: string;
};

export interface SpeechEngine {
  speak(text: string, opts: SpeakOpts): void;
  stop(): Promise<void>;
  getVoices(): Promise<SpeechVoiceInfo[]>;
}

/** Android's utterance limit is ~4000 chars; stay safely below it. */
export const SPEECH_CHUNK_LIMIT = 3800;

/**
 * Turns a Markdown reply into plain spoken prose: code blocks and images are
 * dropped, link and emphasis markers are unwrapped to their text, table pipes
 * and headings disappear, bare URLs are skipped (spelling out a URL is noise),
 * and all whitespace collapses to single spaces. Arabic text passes through
 * untouched — every rule is script-agnostic.
 */
export function stripMarkdownForSpeech(md: string): string {
  let out = md;
  out = out.replace(/```[\s\S]*?```/g, ' '); // fenced code blocks
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, ' '); // images
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links -> link text
  out = out.replace(/https?:\/\/\S+/g, ' '); // bare URLs
  out = out.replace(/^\s*\|[\s:|-]+\|\s*$/gm, ' '); // table separator rows
  out = out.replace(/^\s*\|/gm, ' ').replace(/\|/gm, ' '); // table cell pipes
  out = out.replace(/^\s*#{1,6}\s+/gm, ''); // headings
  out = out.replace(/^\s*>\s?/gm, ''); // blockquotes
  out = out.replace(/^\s*[-*+]\s+/gm, ''); // unordered bullets
  out = out.replace(/^\s*\d+[.)]\s+/gm, ''); // ordered bullets
  out = out.replace(/^[\s]*([-*_]\s*){3,}$/gm, ' '); // horizontal rules
  out = out.replace(/<[^>]+>/g, ' '); // raw HTML tags
  out = out.replace(/(\*\*|__)(.*?)\1/g, '$2'); // bold
  out = out.replace(/(\*|_)(.*?)\1/g, '$2'); // italic
  out = out.replace(/~~(.*?)~~/g, '$1'); // strikethrough
  out = out.replace(/`([^`]*)`/g, '$1'); // inline code
  out = out.replace(/\s+/g, ' ');
  return out.trim();
}

/**
 * Splits spoken text into utterances no longer than `limit` (word-packed, so
 * nothing is cut mid-word). A single word longer than the limit lands in its
 * own chunk — the only acceptable way to keep every character.
 */
export function chunkForSpeech(text: string, limit: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];
  const chunks: string[] = [];
  let current = '';
  for (const word of trimmed.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > limit) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Picks the language a reply should be spoken in: any Arabic-script character
 * wins (replies in Arabic are almost always dominant Arabic), otherwise the
 * UI language is used.
 */
export function detectSpeechLanguage(text: string, fallback: 'ar' | 'en'): string {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text) ? 'ar' : fallback;
}

/**
 * Chooses a device voice for the language: first voice whose base language
 * matches, preferring 'Enhanced' quality. Returns null when nothing matches
 * (the engine then falls back to its own default for the language tag).
 */
export function pickVoice(voices: SpeechVoiceInfo[], lang: string): string | null {
  const base = lang.split('-')[0]?.toLowerCase();
  if (!base) return null;
  let best: SpeechVoiceInfo | null = null;
  for (const v of voices) {
    if (v.language.split('-')[0]?.toLowerCase() !== base) continue;
    if (!best || (v.quality === 'Enhanced' && best.quality !== 'Enhanced')) best = v;
  }
  return best?.identifier ?? null;
}

type SpeechModule = typeof import('expo-speech');
let modulePromise: Promise<SpeechModule> | null = null;

/**
 * Loads the expo-speech module on first use only — same lazy pattern as the
 * llama and whisper engines so native modules are never touched at startup.
 */
function loadSpeechModule(): Promise<SpeechModule> {
  if (!modulePromise) {
    modulePromise = import('expo-speech').catch((e: unknown) => {
      modulePromise = null;
      throw e;
    });
  }
  return modulePromise;
}

export class ExpoSpeechEngine implements SpeechEngine {
  speak(text: string, opts: SpeakOpts): void {
    void loadSpeechModule()
      .then((m) => {
        m.speak(text, {
          language: opts.language,
          voice: opts.voice,
          rate: opts.rate,
          onDone: opts.onDone,
          onError: opts.onError,
        });
      })
      .catch(() => {
        opts.onError?.();
      });
  }

  async stop() {
    const m = await loadSpeechModule();
    await m.stop();
  }

  async getVoices() {
    const m = await loadSpeechModule();
    return m.getAvailableVoicesAsync();
  }
}
