// Copyright (c) 2026 DRS AI. All rights reserved.
import type { WhisperContext } from 'whisper.rn';

export type TranscribeOpts = {
  /** ISO language code; 'auto' lets the multilingual model detect it. */
  language?: string;
};

export interface WhisperEngine {
  load(modelPath: string): Promise<void>;
  isLoaded(): boolean;
  /** Transcribes 16 kHz mono float32 PCM. Returns the trimmed text. */
  transcribe(pcm: Float32Array, opts: TranscribeOpts): Promise<string>;
  release(): Promise<void>;
}

type WhisperModule = typeof import('whisper.rn');
let modulePromise: Promise<WhisperModule> | null = null;

/**
 * Loads the native whisper.rn module on first use only — same pattern as the
 * llama engine: importing it at startup would touch the JSI/TurboModule too early.
 */
function loadWhisperModule(): Promise<WhisperModule> {
  if (!modulePromise) {
    modulePromise = import('whisper.rn').catch((e: unknown) => {
      modulePromise = null;
      throw e;
    });
  }
  return modulePromise;
}

/** Max audio handed to whisper in one call (60 s at 16 kHz mono). */
export const MAX_TRANSCRIBE_SAMPLES = 60 * 16000;

export class WhisperRnEngine implements WhisperEngine {
  private ctx: WhisperContext | null = null;

  isLoaded() {
    return this.ctx !== null;
  }

  async load(modelPath: string) {
    await this.release();
    const { initWhisper } = await loadWhisperModule();
    this.ctx = await initWhisper({ filePath: modelPath });
  }

  async transcribe(pcm: Float32Array, opts: TranscribeOpts) {
    if (!this.ctx) throw new Error('NO_VOICE_MODEL');
    // transcribeData accepts an ArrayBuffer of float32 samples; copy so alignment
    // and lifetime never depend on the caller's buffer.
    const bytes = pcm.slice().buffer;
    const { promise } = this.ctx.transcribeData(bytes, { language: opts.language ?? 'auto' });
    const result = await promise;
    return result.result.trim();
  }

  async release() {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) await ctx.release();
  }
}
