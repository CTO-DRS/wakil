// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';

import { useSettingsStore } from './settingsStore';
import {
  chunkForSpeech,
  detectSpeechLanguage,
  ExpoSpeechEngine,
  pickVoice,
  SPEECH_CHUNK_LIMIT,
  stripMarkdownForSpeech,
  type SpeechEngine,
  type SpeechVoiceInfo,
} from '../speech/tts';

export type TtsStatus = 'idle' | 'speaking';

export type TtsState = {
  status: TtsStatus;
  /** Message currently being spoken (the UI turns its button into a stop control). */
  messageId: string | null;
  /**
   * Speaks a (Markdown) message after stripping it for speech. Stops anything
   * already playing first, so calling this with another message switches playback.
   */
  speak: (messageId: string, text: string) => void;
  /** Tap target: speak this message, or stop it when it is the one playing. */
  toggle: (messageId: string, text: string) => void;
  /** Stops playback immediately. Safe to call when nothing was ever spoken. */
  stop: () => Promise<void>;
};

let engine: SpeechEngine | null = null;
/**
 * Monotonic token: every speak()/stop() bumps it, and completion callbacks from
 * a superseded session are ignored — the guard that keeps a manual stop from
 * being overwritten by an utterance finishing in the background.
 */
let token = 0;
/** Utterances still outstanding for the current speak() session. */
let pending = 0;

/** Overrides the engine (tests). */
export function setTtsEngine(e: SpeechEngine | null) {
  engine = e;
}

function getEngine(): SpeechEngine {
  if (!engine) engine = new ExpoSpeechEngine();
  return engine;
}

function finishChunk(myToken: number, set: (partial: Partial<TtsState>) => void) {
  if (token !== myToken) return;
  pending -= 1;
  if (pending <= 0) {
    token += 1;
    set({ status: 'idle', messageId: null });
  }
}

export const useTtsStore = create<TtsState>()((set, get) => ({
  status: 'idle',
  messageId: null,

  speak: (messageId, text) => {
    const spoken = stripMarkdownForSpeech(text);
    if (!spoken) return;
    void get().stop();

    const myToken = token; // stop() bumped it; this session now owns the slot
    const chunks = chunkForSpeech(spoken, SPEECH_CHUNK_LIMIT);
    pending = chunks.length;
    set({ status: 'speaking', messageId });

    const eng = getEngine();
    void eng
      .getVoices()
      .catch((): SpeechVoiceInfo[] => [])
      .then((voices) => {
        if (token !== myToken) return; // stopped or superseded while resolving voices
        const lang = detectSpeechLanguage(spoken, useSettingsStore.getState().language);
        const voice = pickVoice(voices, lang) ?? undefined;
        for (const chunk of chunks) {
          eng.speak(chunk, {
            language: lang,
            voice,
            rate: 1,
            onDone: () => finishChunk(myToken, set),
            onError: () => finishChunk(myToken, set),
          });
        }
      });
  },

  toggle: (messageId, text) => {
    if (get().status === 'speaking' && get().messageId === messageId) {
      void get().stop();
      return;
    }
    get().speak(messageId, text);
  },

  stop: async () => {
    token += 1;
    pending = 0;
    set({ status: 'idle', messageId: null });
    // Never instantiate the engine just to stop it — nothing spoken means
    // nothing to interrupt on the native side.
    if (!engine) return;
    try {
      await engine.stop();
    } catch {
      // ignore: engine may already be idle
    }
  },
}));
