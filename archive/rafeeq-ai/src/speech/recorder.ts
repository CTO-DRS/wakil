// Copyright (c) 2026 DRS AI. All rights reserved.
import { base64ToBytes, bytesToInt16, concatInt16 } from './pcm';

/** Capture settings matched to whisper.cpp: mono, 16 kHz, signed 16-bit. */
export const SAMPLE_RATE = 16000;

export interface VoiceRecorder {
  /** Starts capturing microphone PCM. Rejects when the mic is unavailable. */
  start(): Promise<void>;
  /** Stops capture and returns everything recorded since start(). */
  stop(): Int16Array;
  /** Discards captured audio (also safe when not recording). */
  reset(): void;
}

type PcmStream = {
  init(options: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
    wavFile?: string;
  }): Promise<void>;
  start(): void;
  stop(): void;
  on(event: 'data', callback: (base64Chunk: string) => void): unknown;
};

type PcmStreamModule = { default: PcmStream };

let modulePromise: Promise<PcmStreamModule> | null = null;

function loadPcmStreamModule(): Promise<PcmStreamModule> {
  if (!modulePromise) {
    modulePromise = import('@fugood/react-native-audio-pcm-stream').catch((e: unknown) => {
      modulePromise = null;
      throw e;
    });
  }
  return modulePromise;
}

/**
 * Microphone capture on top of the PCM stream module: base64 chunks arrive on a
 * native thread and are decoded/accumulated on the JS side. `stop()` is synchronous
 * over the chunks received so far; chunks in flight after stop are ignored.
 */
export class PcmStreamRecorder implements VoiceRecorder {
  private stream: PcmStream | null = null;
  private chunks: Int16Array[] = [];
  private listening = false;

  async start() {
    this.reset();
    const { default: stream } = await loadPcmStreamModule();
    this.stream = stream;
    if (!this.listening) {
      stream.on('data', (chunk) => {
        // Native emits base64 little-endian 16-bit samples; keep the parse local
        // so a malformed chunk can never poison earlier audio.
        try {
          this.chunks.push(bytesToInt16(base64ToBytes(chunk)));
        } catch {
          // skip malformed chunk
        }
      });
      this.listening = true;
    }
    await stream.init({ sampleRate: SAMPLE_RATE, channels: 1, bitsPerSample: 16, bufferSize: 4096 });
    stream.start();
  }

  stop(): Int16Array {
    const audio = concatInt16(this.chunks);
    this.reset();
    try {
      this.stream?.stop();
    } catch {
      // best effort: native side may already be released
    }
    return audio;
  }

  reset() {
    this.chunks = [];
  }
}
