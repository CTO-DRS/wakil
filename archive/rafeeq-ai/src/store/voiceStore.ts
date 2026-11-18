// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';

import { PcmStreamRecorder, SAMPLE_RATE, type VoiceRecorder } from '../speech/recorder';
import { int16ToFloat32, pcmDurationMs } from '../speech/pcm';
import { WhisperRnEngine, type WhisperEngine } from '../speech/whisper';
import { requestMicPermission } from '../utils/voicePermission';
import { voiceSessionMeter } from './voiceOutStore';

export type VoiceStatus = 'idle' | 'loading' | 'recording' | 'transcribing';

export type VoiceErrorCode =
  'NO_VOICE_MODEL' | 'PERMISSION_DENIED' | 'TOO_SHORT' | 'EMPTY' | 'MIC_FAILED' | 'TRANSCRIBE_FAILED';

/** Recordings are capped so a forgotten tap cannot fill memory (60 s at 16 kHz mono). */
export const MAX_RECORDING_MS = 60_000;
/** Shorter than this is almost certainly a stray tap, not speech. */
export const MIN_RECORDING_MS = 600;

export type VoiceState = {
  status: VoiceStatus;
  error: VoiceErrorCode | null;
  /** Transcription of the last finished session; the UI consumes and clears it. */
  result: string | null;
  loadedModelId: string | null;
  /** ISO language hint from the model's catalog entry; null = let whisper detect. */
  voiceLanguage: string | null;
  /** Epoch ms when the current recording started (UI computes elapsed seconds). */
  startedAt: number | null;
  /** Epoch ms of the last successful transcription — the mic→agent handoff stamp. */
  lastTranscriptAt: number | null;
  /**
   * Press-to-toggle entry point: starts a session, or stops it and transcribes.
   * Everything the UI needs lands in `result`/`error` — manual stops and the
   * auto-stop timeout behave exactly the same. `language` pins whisper to the
   * model's tuned language (the Saudi dialectal model wants 'ar'); null lets
   * the multilingual models detect.
   */
  toggle: (model: { id: string; path: string | null; language?: string | null }) => Promise<void>;
  /** Clears `result`/`error` after the UI has shown them. */
  consume: () => void;
  /** Aborts the current session without transcribing. */
  cancel: () => void;
  /** Releases the whisper context (called when the model file is deleted). */
  release: () => Promise<void>;
};

let engine: WhisperEngine | null = null;
let recorder: VoiceRecorder | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let now: () => number = Date.now;

/** Overrides the engine (tests). */
export function setVoiceEngine(e: WhisperEngine | null) {
  engine = e;
}

/** Overrides the recorder (tests). */
export function setVoiceRecorder(r: VoiceRecorder | null) {
  recorder = r;
}

/** Overrides the wall clock (tests) — drives startedAt and the min-duration check. */
export function setVoiceClock(c: () => number) {
  now = c;
}

/**
 * True when the last transcription is recent enough that a goal sent right now
 * plausibly came from the mic — the agent latency session then keeps the
 * recorded/transcribed marks instead of resetting them. A typed goal (or a
 * stale transcript left in the draft for minutes) starts a clean session.
 */
export function voiceHandoffFresh(windowMs = 60_000): boolean {
  const at = useVoiceStore.getState().lastTranscriptAt;
  return at !== null && now() - at < windowMs;
}

function getEngine(): WhisperEngine {
  if (!engine) engine = new WhisperRnEngine();
  return engine;
}

function getRecorder(): VoiceRecorder {
  if (!recorder) recorder = new PcmStreamRecorder();
  return recorder;
}

function clearTimer() {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
}

export const useVoiceStore = create<VoiceState>()((set, get) => ({
  status: 'idle',
  error: null,
  result: null,
  loadedModelId: null,
  voiceLanguage: null,
  startedAt: null,
  lastTranscriptAt: null,

  toggle: async (model) => {
    if (get().status === 'recording') {
      await finishRecording(set, get);
      return;
    }
    if (get().status !== 'idle') return; // loading/transcribing: ignore extra taps

    if (!model.path) {
      set({ status: 'idle', error: 'NO_VOICE_MODEL' });
      return;
    }

    set({ status: 'loading', error: null, voiceLanguage: model.language ?? null });
    try {
      const eng = getEngine();
      if (!eng.isLoaded() || get().loadedModelId !== model.id) {
        await eng.release();
        await eng.load(model.path);
        set({ loadedModelId: model.id });
      }
    } catch {
      set({ status: 'idle', error: 'MIC_FAILED' });
      return;
    }
    if (!(await requestMicPermission())) {
      set({ status: 'idle', error: 'PERMISSION_DENIED' });
      return;
    }
    try {
      await getRecorder().start();
    } catch {
      set({ status: 'idle', error: 'MIC_FAILED' });
      return;
    }
    // A fresh session owns the latency meter: numbers from the last recording
    // must never bleed into this one's report.
    voiceSessionMeter.reset();
    set({ status: 'recording', startedAt: now() });
    clearTimer();
    autoStopTimer = setTimeout(() => {
      autoStopTimer = null;
      void finishRecording(set, get);
    }, MAX_RECORDING_MS);
  },

  consume: () => set({ result: null, error: null }),

  cancel: () => {
    if (get().status !== 'recording') return;
    clearTimer();
    getRecorder().reset();
    set({ status: 'idle', startedAt: null });
  },

  release: async () => {
    clearTimer();
    if (get().status === 'recording') getRecorder().reset();
    set({ status: 'idle', startedAt: null, loadedModelId: null, error: null, result: null });
    await getEngine().release();
  },
}));

type SetState = (partial: Partial<VoiceState>) => void;
type GetState = () => VoiceState;

/** Stops the recorder, transcribes, and lands back on idle with the outcome. */
async function finishRecording(set: SetState, get: GetState): Promise<void> {
  clearTimer();
  set({ status: 'transcribing' });
  voiceSessionMeter.mark('recorded');
  let pcm: Int16Array;
  try {
    pcm = getRecorder().stop();
  } catch {
    set({ status: 'idle', startedAt: null, error: 'MIC_FAILED' });
    return;
  }
  const startedAt = get().startedAt;
  set({ startedAt: null });
  const elapsed = startedAt ? now() - startedAt : Number.MAX_SAFE_INTEGER;
  if (elapsed < MIN_RECORDING_MS || pcmDurationMs(pcm.length, SAMPLE_RATE) < MIN_RECORDING_MS) {
    set({ status: 'idle', error: 'TOO_SHORT' });
    return;
  }
  try {
    const text = await getEngine().transcribe(int16ToFloat32(pcm), {
      language: get().voiceLanguage ?? 'auto',
    });
    voiceSessionMeter.mark('transcribed');
    if (!text) {
      set({ status: 'idle', error: 'EMPTY' });
      return;
    }
    set({ status: 'idle', result: text, error: null, lastTranscriptAt: now() });
  } catch {
    set({ status: 'idle', error: 'TRANSCRIBE_FAILED' });
  }
}
