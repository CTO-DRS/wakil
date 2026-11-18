// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Pure PCM helpers for the voice pipeline: the recorder yields base64 chunks of
 * 16-bit little-endian samples, whisper.cpp consumes float32 in the [-1, 1] range.
 * Kept dependency-free (no Buffer polyfill) and fully unit-testable.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]!] = i;

/** Decodes a base64 string into raw bytes without relying on atob/Buffer. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\s=]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      ((B64_INDEX[clean[i]!] ?? 0) << 18) |
      ((B64_INDEX[clean[i + 1]!] ?? 0) << 12) |
      ((B64_INDEX[clean[i + 2]!] ?? 0) << 6) |
      (B64_INDEX[clean[i + 3]!] ?? 0);
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}

/** Views raw little-endian bytes as 16-bit samples, tolerating an odd trailing byte. */
export function bytesToInt16(bytes: Uint8Array): Int16Array {
  const usable = bytes.byteLength - (bytes.byteLength % 2);
  const out = new Int16Array(usable / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Concatenates Int16 chunks into a single array. */
export function concatInt16(chunks: readonly Int16Array[]): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Int16Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Scales 16-bit PCM samples into the float32 range whisper.cpp expects. */
export function int16ToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32768;
  return out;
}

/** Duration in milliseconds of a mono PCM stream at the given sample rate. */
export function pcmDurationMs(samples: number, sampleRate: number): number {
  if (sampleRate <= 0) return 0;
  return Math.round((samples / sampleRate) * 1000);
}
