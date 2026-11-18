// Copyright (c) 2026 DRS AI. All rights reserved.

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable size using 1024 steps, e.g. 491400032 -> "468.6 MB". */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value.toFixed(0) : value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Progress ratio in [0, 1]; 0 when total is unknown. */
export function progressRatio(written: number, total: number): number {
  if (!total || total <= 0 || written <= 0) return 0;
  return Math.min(1, written / total);
}

/**
 * Short unique id for local primary keys (conversations and messages).
 * A process-wide monotonic counter disambiguates ids created within the same
 * millisecond, so uniqueness never relies on Math.random.
 */
let idSeq = 0;
export function newId(prefix = ''): string {
  idSeq = (idSeq + 1) % 0x10000;
  return `${prefix}${Date.now().toString(36)}-${idSeq.toString(36).padStart(4, '0')}`;
}

/** A conversation title derived from the first user message. */
export function titleFromMessage(text: string, max = 40): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Approximate, decimal size for marketing-style labels ("about 490 MB", "about 1.1 GB"):
 * megabytes are rounded to the nearest 10, gigabytes to one decimal.
 */
export function formatApproxBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(10, Math.round(bytes / 1e7) * 10)} MB`;
}
