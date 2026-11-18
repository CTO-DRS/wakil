// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The spoken reply queue: turns the agent's answer into natural speech sentence
 * by sentence while the answer is still being generated — the first sentence
 * reaches the TTS engine the moment its terminator arrives, which is what makes
 * the <3 s first-sentence target reachable. Also carries the plan announcement
 * (the user hears the plan while reading the plan card) and the session latency
 * meter. Playback rides the same on-device platform TTS engine as the chat's
 * manual speaker button — no audio, no text, nothing leaves the phone.
 */

import { create } from 'zustand';

import { useSettingsStore } from './settingsStore';
import { SentenceStreamer } from '../speech/sentenceStream';
import { VoiceLatencyMeter } from '../speech/latency';
import {
  detectSpeechLanguage,
  ExpoSpeechEngine,
  pickVoice,
  stripMarkdownForSpeech,
  type SpeechEngine,
  type SpeechVoiceInfo,
} from '../speech/tts';

export type VoiceOutState = {
  /** True while at least one utterance is queued or playing. */
  speaking: boolean;
  /** Sentence currently spoken (or last one), for the UI indicator. */
  currentSentence: string | null;
  /** Starts a fresh spoken session: aborts anything still playing. */
  begin: () => void;
  /** Speaks a composed text now (plan announcement, non-streaming answers). */
  speakNow: (text: string) => void;
  /** Feeds one answer delta; complete sentences join the speech queue. */
  pushToken: (token: string) => void;
  /** Feeds a whole answer text (non-streaming path) as one stream. */
  speakAnswer: (text: string) => void;
  /** Emits whatever the streamer still holds (answer finished). */
  flushPending: () => void;
  /** Stops playback and discards everything pending. */
  abort: () => void;
};

let engine: SpeechEngine | null = null;
/** Monotonic session token — stale utterance callbacks never outlive their session. */
let token = 0;
/** True between begin() and abort(): push APIs are no-ops for a dead session. */
let open = false;
let pending = 0;
let streamer = new SentenceStreamer();
let voicesCache: SpeechVoiceInfo[] | null = null;

/** Overrides the engine (tests). */
export function setVoiceOutEngine(e: SpeechEngine | null) {
  engine = e;
  voicesCache = null;
}

function getEngine(): SpeechEngine {
  if (!engine) engine = new ExpoSpeechEngine();
  return engine;
}

/** The per-session latency meter — voiceStore and agentStore mark their stages here. */
export const voiceSessionMeter = new VoiceLatencyMeter();

type SetState = (partial: Partial<VoiceOutState>) => void;

async function speakSentence(sentence: string, myToken: number, set: SetState) {
  const spoken = stripMarkdownForSpeech(sentence);
  if (!spoken || token !== myToken) return;
  if (voiceSessionMeter.get('firstSentenceSpoken') === null) {
    voiceSessionMeter.mark('firstSentenceSpoken');
  }
  const eng = getEngine();
  let voices = voicesCache;
  if (!voices) {
    voices = await eng.getVoices().catch((): SpeechVoiceInfo[] => []);
    if (token !== myToken) return;
    voicesCache = voices;
  }
  const lang = detectSpeechLanguage(spoken, useSettingsStore.getState().language);
  const voice = pickVoice(voices, lang) ?? undefined;
  pending += 1;
  set({ speaking: true, currentSentence: spoken });
  eng.speak(spoken, {
    language: lang,
    voice,
    rate: 1,
    onDone: () => finish(myToken, set),
    onError: () => finish(myToken, set),
  });
}

function finish(myToken: number, set: SetState) {
  if (token !== myToken) return;
  pending -= 1;
  if (pending <= 0) {
    pending = 0;
    set({ speaking: false, currentSentence: null });
  }
}

/** Emits streamed sentences as they complete; shared by pushToken/speakAnswer/flushPending. */
function drain(streamed: string[], myToken: number, set: SetState) {
  for (const sentence of streamed) {
    void speakSentence(sentence, myToken, set);
  }
}

export const useVoiceOutStore = create<VoiceOutState>()((set) => ({
  speaking: false,
  currentSentence: null,

  begin: () => {
    useVoiceOutStore.getState().abort();
    open = true;
    streamer = new SentenceStreamer();
  },

  speakNow: (text) => {
    if (!open) return; // a dead session never speaks
    const myToken = token;
    // Short composed texts (plan announcement, fallback answers): segment once
    // and queue every sentence — the same segmentation the streamed path uses.
    const s = new SentenceStreamer();
    const sentences = [...s.feed(text), s.flush()].filter((x): x is string => !!x);
    for (const sentence of sentences) void speakSentence(sentence, myToken, set);
  },

  pushToken: (tok) => {
    if (!open) return; // deltas from an aborted run (the engine promise may outlive the cancel)
    const myToken = token;
    drain(streamer.feed(tok), myToken, set);
  },

  speakAnswer: (text) => {
    if (!open) return;
    const myToken = token;
    drain(streamer.feed(text), myToken, set);
    // The whole answer is known here — flush the tail immediately instead of
    // waiting for a terminator that may never come (short fallback replies).
    const rest = streamer.flush();
    if (rest) void speakSentence(rest, myToken, set);
  },

  flushPending: () => {
    if (!open) return;
    const myToken = token;
    const rest = streamer.flush();
    if (rest) void speakSentence(rest, myToken, set);
  },

  abort: () => {
    open = false;
    token += 1;
    pending = 0;
    streamer = new SentenceStreamer();
    set({ speaking: false, currentSentence: null });
    if (!engine) return;
    void engine.stop().catch(() => undefined);
  },
}));
