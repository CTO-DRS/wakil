// Copyright (c) 2026 DRS AI. All rights reserved.

const MB = 1024 * 1024;

/** Bytes of KV cache per context token we budget for small (<=2B) models with f16 cache. */
export const KV_BYTES_PER_TOKEN = 32 * 1024;
/** Fixed runtime overhead (compute buffers, tokenizer, app). */
export const RUNTIME_OVERHEAD_BYTES = 150 * MB;
/** Extra free space required on disk beyond the model size. */
export const DISK_MARGIN_BYTES = 200 * MB;

/** Rough estimate of the RAM needed to load a model of `modelBytes` with `nCtx` context. */
export function estimateRuntimeBytes(modelBytes: number, nCtx: number): number {
  return Math.round(modelBytes * 1.1 + nCtx * KV_BYTES_PER_TOKEN + RUNTIME_OVERHEAD_BYTES);
}

export type RamVerdict = 'ok' | 'tight' | 'insufficient' | 'unknown';

/**
 * Compares the estimated need with the free RAM reported by the OS.
 * - ok: comfortably fits
 * - tight: fits only if the OS reclaims cached memory (mmap makes this often work)
 * - insufficient: clearly too large
 */
export function checkRam(modelBytes: number, nCtx: number, availBytes: number | null | undefined): {
  verdict: RamVerdict;
  needed: number;
  available: number;
} {
  const needed = estimateRuntimeBytes(modelBytes, nCtx);
  if (availBytes == null || !Number.isFinite(availBytes) || availBytes <= 0) {
    return { verdict: 'unknown', needed, available: 0 };
  }
  if (availBytes >= needed) return { verdict: 'ok', needed, available: availBytes };
  if (availBytes >= needed * 0.6) return { verdict: 'tight', needed, available: availBytes };
  return { verdict: 'insufficient', needed, available: availBytes };
}

/** Whether there is room on disk to finish downloading `remainingBytes`. */
export function hasDiskSpace(remainingBytes: number, freeBytes: number | null | undefined): boolean {
  if (freeBytes == null || !Number.isFinite(freeBytes) || freeBytes <= 0) return true; // unknown: let the OS fail
  return freeBytes >= remainingBytes + DISK_MARGIN_BYTES;
}
