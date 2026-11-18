// Copyright (c) 2026 DRS AI. All rights reserved.
//
// Pure segment planning for multi-connection downloads. The native side only moves
// bytes; every decision about which byte ranges exist, how they are split when a
// connection finishes early (work stealing), and whether a saved plan can resume
// lives here so it is unit-testable.

/**
 * One byte range of the target file. `end` is exclusive; `pos` is the next byte to
 * write (start <= pos <= end). `end === -1` means "until EOF" (unknown length,
 * single-connection mode only).
 */
export type Segment = {
  id: number;
  start: number;
  end: number;
  pos: number;
};

export const MIN_CONNECTIONS = 1;
export const MAX_CONNECTIONS = 8;
export const DEFAULT_CONNECTIONS = 4;
/** Smallest range worth its own connection when planning or stealing. */
export const MIN_SEGMENT_BYTES = 1 << 20; // 1 MiB
/** Split points are aligned so ranges stay friendly to the page cache. */
export const SPLIT_ALIGN_BYTES = 64 * 1024;

export function clampConnections(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : DEFAULT_CONNECTIONS;
  return Math.min(MAX_CONNECTIONS, Math.max(MIN_CONNECTIONS, v));
}

export function remaining(seg: Segment): number {
  if (seg.end < 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, seg.end - seg.pos);
}

export function isSegmentDone(seg: Segment): boolean {
  return seg.end >= 0 && seg.pos >= seg.end;
}

/**
 * Splits [0, total) into up to `connections` contiguous ranges of near-equal size.
 * Fewer ranges are used when the file is too small to give each MIN_SEGMENT_BYTES.
 * An unknown length (total <= 0) yields one open-ended range.
 */
export function planSegments(total: number, connections: number, minSegment = MIN_SEGMENT_BYTES): Segment[] {
  if (!(total > 0)) return [{ id: 0, start: 0, end: -1, pos: 0 }];
  const wanted = clampConnections(connections);
  const n = Math.max(1, Math.min(wanted, Math.floor(total / Math.max(1, minSegment))));
  const base = Math.floor(total / n);
  const segs: Segment[] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const end = i === n - 1 ? total : alignDown(start + base, SPLIT_ALIGN_BYTES, start + 1);
    segs.push({ id: i, start, end, pos: start });
    start = end;
  }
  return segs;
}

function alignDown(value: number, align: number, floor: number): number {
  const aligned = Math.floor(value / align) * align;
  return aligned >= floor ? aligned : value;
}

export type StealPlan = { victimId: number; splitAt: number };

/**
 * Picks the active segment with the most bytes left and a split point near the middle
 * of what remains. Returns null when nothing is big enough to be worth splitting (each
 * half must keep at least `minSplit` bytes). `activeIds` are segments currently being
 * downloaded; only those can donate work, since idle ones are simply started instead.
 */
export function pickSteal(segments: Segment[], activeIds: Iterable<number>, minSplit = MIN_SEGMENT_BYTES): StealPlan | null {
  const active = new Set(activeIds);
  let best: Segment | null = null;
  for (const s of segments) {
    if (!active.has(s.id) || s.end < 0 || isSegmentDone(s)) continue;
    if (!best || remaining(s) > remaining(best)) best = s;
  }
  if (!best) return null;
  const rem = remaining(best);
  if (rem < minSplit * 2) return null;
  const mid = best.pos + Math.floor(rem / 2);
  let splitAt = Math.ceil(mid / SPLIT_ALIGN_BYTES) * SPLIT_ALIGN_BYTES;
  if (splitAt - best.pos < minSplit || best.end - splitAt < minSplit) splitAt = mid;
  return { victimId: best.id, splitAt };
}

export function nextSegmentId(segments: Segment[]): number {
  return segments.reduce((m, s) => Math.max(m, s.id), -1) + 1;
}

/**
 * Applies an accepted split: the victim now ends at `splitAt` and a new segment covers
 * [splitAt, oldEnd). Returns the new segment, or null when the split is no longer valid
 * (the victim already wrote past the split point).
 */
export function applySplit(segments: Segment[], victimId: number, splitAt: number): Segment | null {
  const victim = segments.find((s) => s.id === victimId);
  if (!victim || victim.end < 0) return null;
  if (!(splitAt > victim.pos && splitAt < victim.end)) return null;
  const created: Segment = { id: nextSegmentId(segments), start: splitAt, end: victim.end, pos: splitAt };
  victim.end = splitAt;
  segments.push(created);
  return created;
}

/** Bytes on disk according to the plan (sum of each range's written prefix). */
export function bytesDone(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, s.pos - s.start), 0);
}

export function allDone(segments: Segment[]): boolean {
  return segments.length > 0 && segments.every(isSegmentDone);
}

/** Records a progress report without ever moving a range backwards or past its end. */
export function updatePos(segments: Segment[], id: number, pos: number): void {
  const s = segments.find((x) => x.id === id);
  if (!s || !Number.isFinite(pos)) return;
  const capped = s.end >= 0 ? Math.min(pos, s.end) : pos;
  if (capped > s.pos) s.pos = capped;
}

/**
 * Checks that a saved plan describes exactly [0, total) with no gaps or overlaps and
 * sane positions, so a corrupted or foreign sidecar is never trusted.
 */
export function isValidPlan(segments: unknown, total: number): segments is Segment[] {
  if (!Array.isArray(segments) || segments.length === 0 || !(total > 0)) return false;
  const segs = [...(segments as Segment[])];
  for (const s of segs) {
    if (!s || typeof s !== 'object') return false;
    for (const k of ['id', 'start', 'end', 'pos'] as const) {
      if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) return false;
    }
    if (s.start < 0 || s.end <= s.start || s.pos < s.start || s.pos > s.end) return false;
  }
  if (new Set(segs.map((s) => s.id)).size !== segs.length) return false;
  segs.sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const s of segs) {
    if (s.start !== cursor) return false;
    cursor = s.end;
  }
  return cursor === total;
}

/** Deep copy so a snapshot handed out (sidecar, resume state) cannot be mutated later. */
export function cloneSegments(segments: Segment[]): Segment[] {
  return segments.map((s) => ({ ...s }));
}
