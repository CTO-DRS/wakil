// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Type surface for @fugood/react-native-audio-pcm-stream. The package ships an
 * ambient-style index.d.ts that TypeScript cannot import as a module, so the
 * small API we use is declared here instead.
 */
declare module '@fugood/react-native-audio-pcm-stream' {
  export interface PcmStreamOptions {
    sampleRate: number;
    /** 1 (mono) or 2 (stereo). */
    channels: number;
    /** 8 or 16 bits. */
    bitsPerSample: number;
    /** Android AudioSource id; 6 = VOICE_RECOGNITION (default). */
    audioSource?: number;
    /** iOS-only: also writes a WAV file while streaming. */
    wavFile?: string;
    bufferSize?: number;
  }

  export interface PcmStream {
    init(options: PcmStreamOptions): Promise<void>;
    start(): void;
    stop(): void;
    /** Registers the chunk listener (base64-encoded little-endian PCM). */
    on(event: 'data', callback: (base64Chunk: string) => void): unknown;
  }

  const stream: PcmStream;
  export default stream;
}
