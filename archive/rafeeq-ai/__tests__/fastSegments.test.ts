// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  allDone,
  applySplit,
  bytesDone,
  clampConnections,
  isValidPlan,
  MIN_SEGMENT_BYTES,
  pickSteal,
  planSegments,
  remaining,
  SPLIT_ALIGN_BYTES,
  updatePos,
  type Segment,
} from '../src/models/fastdl/segments';

const MB = 1 << 20;

function covers(segs: Segment[], total: number) {
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  let cursor = 0;
  for (const s of sorted) {
    expect(s.start).toBe(cursor);
    expect(s.end).toBeGreaterThan(s.start);
    cursor = s.end;
  }
  expect(cursor).toBe(total);
}

describe('fast download segment planning', () => {
  it('clamps connections to 1-8 with a default of 4', () => {
    expect(clampConnections(0)).toBe(1);
    expect(clampConnections(3.4)).toBe(3);
    expect(clampConnections(20)).toBe(8);
    expect(clampConnections(undefined)).toBe(4);
    expect(clampConnections(Number.NaN)).toBe(4);
  });

  it('splits a file into N contiguous aligned ranges', () => {
    const total = 1000 * MB + 12345;
    const segs = planSegments(total, 4);
    expect(segs).toHaveLength(4);
    covers(segs, total);
    for (const s of segs.slice(0, -1)) expect(s.end % SPLIT_ALIGN_BYTES).toBe(0);
    expect(segs.every((s) => s.pos === s.start)).toBe(true);
  });

  it('uses fewer ranges for small files and one open range for unknown length', () => {
    expect(planSegments(2.5 * MB, 8)).toHaveLength(2);
    expect(planSegments(100_000, 4)).toHaveLength(1);
    expect(planSegments(0, 4)).toEqual([{ id: 0, start: 0, end: -1, pos: 0 }]);
    expect(planSegments(-1, 4)).toEqual([{ id: 0, start: 0, end: -1, pos: 0 }]);
  });

  it('steals from the active range with the most bytes left, near its midpoint', () => {
    const segs = planSegments(400 * MB, 4);
    segs[0].pos = segs[0].end; // finished
    segs[1].pos = segs[1].start + 90 * MB; // 10 MB left
    segs[2].pos = segs[2].start + 20 * MB; // 80 MB left  <- victim
    segs[3].pos = segs[3].start + 50 * MB; // 50 MB left
    const plan = pickSteal(segs, [1, 2, 3]);
    expect(plan).not.toBeNull();
    expect(plan!.victimId).toBe(2);
    const rem = remaining(segs[2]);
    expect(Math.abs(plan!.splitAt - (segs[2].pos + rem / 2))).toBeLessThanOrEqual(SPLIT_ALIGN_BYTES);
    expect(plan!.splitAt % SPLIT_ALIGN_BYTES).toBe(0);
  });

  it('ignores idle ranges and refuses splits below twice the minimum', () => {
    const segs = planSegments(400 * MB, 4);
    expect(pickSteal(segs, [])).toBeNull(); // nothing active
    segs[1].pos = segs[1].end - (2 * MIN_SEGMENT_BYTES - 1);
    expect(pickSteal(segs, [1])).toBeNull();
  });

  it('applies a split so the plan still covers the whole file', () => {
    const total = 400 * MB;
    const segs = planSegments(total, 4);
    segs[3].pos = segs[3].start + MB;
    const plan = pickSteal(segs, [3])!;
    const created = applySplit(segs, plan.victimId, plan.splitAt)!;
    expect(created.id).toBe(4);
    expect(created.start).toBe(plan.splitAt);
    expect(segs[3].end).toBe(plan.splitAt);
    covers(segs, total);
    expect(isValidPlan(segs, total)).toBe(true);
  });

  it('rejects a split the victim already passed', () => {
    const segs = planSegments(400 * MB, 4);
    segs[0].pos = segs[0].start + 60 * MB;
    expect(applySplit(segs, 0, segs[0].start + 50 * MB)).toBeNull();
    expect(applySplit(segs, 99, 10)).toBeNull();
    expect(segs).toHaveLength(4);
  });

  it('tracks progress monotonically and never past a range end', () => {
    const segs = planSegments(8 * MB, 2);
    updatePos(segs, 0, 2 * MB);
    updatePos(segs, 0, MB); // stale report
    updatePos(segs, 1, 100 * MB); // beyond end
    expect(segs[0].pos).toBe(2 * MB);
    expect(segs[1].pos).toBe(segs[1].end);
    expect(bytesDone(segs)).toBe(2 * MB + (segs[1].end - segs[1].start));
    expect(allDone(segs)).toBe(false);
    updatePos(segs, 0, segs[0].end);
    expect(allDone(segs)).toBe(true);
  });

  it('validates saved plans before trusting them for resume', () => {
    const total = 64 * MB;
    const good = planSegments(total, 4);
    expect(isValidPlan(good, total)).toBe(true);
    expect(isValidPlan(good, total + 1)).toBe(false);
    expect(isValidPlan([], total)).toBe(false);
    expect(isValidPlan('nope', total)).toBe(false);
    const gap = good.map((s) => ({ ...s }));
    gap[1].start += 1;
    gap[1].pos = gap[1].start;
    expect(isValidPlan(gap, total)).toBe(false);
    const badPos = good.map((s) => ({ ...s }));
    badPos[2].pos = badPos[2].end + 1;
    expect(isValidPlan(badPos, total)).toBe(false);
    const dupId = good.map((s) => ({ ...s, id: 0 }));
    expect(isValidPlan(dupId, total)).toBe(false);
  });
});
