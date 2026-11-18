// Copyright (c) 2026 DRS AI. All rights reserved.
import { applyModelFilter, classifyModelSize, MEDIUM_MODEL_MAX_BYTES, MODEL_FILTERS, SMALL_MODEL_MAX_BYTES, type FilterContext } from '../src/models/filter';
import { batchDeleteCount, planBatchDelete } from '../src/models/batchDelete';

const GiB = 1073741824;

const ctx = (freeRamBytes: number | null): FilterContext => ({
  freeRamBytes,
  runtimeBytes: (size) => (size <= 0 ? null : Math.round(size * 1.2)), // like the app's runtime estimate
});

const models = [
  { id: 'tiny', sizeBytes: 491400032 }, // ~0.46 GiB
  { id: 'one', sizeBytes: 1117320736 }, // ~1.04 GiB
  { id: 'two', sizeBytes: MEDIUM_MODEL_MAX_BYTES }, // exactly 2 GiB
  { id: 'big', sizeBytes: 4 * GiB },
  { id: 'voice', sizeBytes: 0 },
];

describe('classifyModelSize', () => {
  it.each([
    { name: 'sub-GiB is small', size: 491400032, expected: 'small' },
    { name: 'just under the small cap is small', size: SMALL_MODEL_MAX_BYTES - 1, expected: 'small' },
    { name: 'exactly 1 GiB is medium', size: SMALL_MODEL_MAX_BYTES, expected: 'medium' },
    { name: 'exactly 2 GiB is medium', size: MEDIUM_MODEL_MAX_BYTES, expected: 'medium' },
    { name: 'just over 2 GiB is large', size: MEDIUM_MODEL_MAX_BYTES + 1, expected: 'large' },
    { name: 'unknown size stays unknown', size: 0, expected: 'unknown' },
    { name: 'negative size is unknown', size: -5, expected: 'unknown' },
  ])('$name', ({ size, expected }) => {
    expect(classifyModelSize(size)).toBe(expected);
  });
});

describe('applyModelFilter', () => {
  it('publishes the five canonical filters in order', () => {
    expect(MODEL_FILTERS).toEqual(['all', 'small', 'medium', 'large', 'fits']);
  });

  it('buckets by download size', () => {
    expect(applyModelFilter(models, 'small', ctx(GiB)).map((m) => m.id)).toEqual(['tiny']);
    expect(applyModelFilter(models, 'medium', ctx(GiB)).map((m) => m.id)).toEqual(['one', 'two']);
    expect(applyModelFilter(models, 'large', ctx(GiB)).map((m) => m.id)).toEqual(['big']);
  });

  it('keeps everything for "all" in the original order', () => {
    expect(applyModelFilter(models, 'all', ctx(GiB)).map((m) => m.id)).toEqual(['tiny', 'one', 'two', 'big', 'voice']);
  });

  it('"fits" keeps models whose runtime estimate stays within free RAM', () => {
    // 2 GiB free: runtime 1.2×size — the 2 GiB model needs 2.4 GiB, so only ≤1.66 GiB fit.
    expect(applyModelFilter(models, 'fits', ctx(2 * GiB)).map((m) => m.id)).toEqual(['tiny', 'one', 'voice']);
  });

  it('"fits" shows everything when the RAM reading is unavailable', () => {
    expect(applyModelFilter(models, 'fits', ctx(null)).map((m) => m.id)).toEqual(['tiny', 'one', 'two', 'big', 'voice']);
  });

  it('never reorders or mutates the source list', () => {
    const snapshot = [...models];
    applyModelFilter(models, 'fits', ctx(8 * GiB));
    expect(models).toEqual(snapshot);
  });
});

describe('planBatchDelete', () => {
  const files = {
    downloaded: { status: 'downloaded' },
    loaded: { status: 'downloaded' },
    paused: { status: 'paused' },
    idle: { status: 'idle' },
    errored: { status: 'error' },
  };

  it('sorts selections into unload / entry / file / skip steps', () => {
    const plan = planBatchDelete(['downloaded', 'loaded', 'paused', 'idle', 'errored'], files, 'loaded', new Set());
    expect(plan).toEqual({
      unloadModelIds: ['loaded'],
      deleteFileIds: ['downloaded', 'loaded', 'paused', 'errored'],
      removeCustomIds: [],
      skipped: ['idle'],
    });
  });

  it('routes custom entries to removal (and unloads them when loaded)', () => {
    const plan = planBatchDelete(['my-model', 'other-custom'], files, 'my-model', new Set(['my-model', 'other-custom']));
    expect(plan.unloadModelIds).toEqual(['my-model']);
    expect(plan.removeCustomIds).toEqual(['my-model', 'other-custom']);
    expect(plan.deleteFileIds).toEqual([]);
  });

  it('keeps catalog order inside every step and counts the touched rows', () => {
    const plan = planBatchDelete(['idle', 'downloaded', 'idle'], files, null, new Set());
    expect(plan.deleteFileIds).toEqual(['downloaded']);
    expect(plan.skipped).toEqual(['idle', 'idle']);
    expect(batchDeleteCount(plan)).toBe(1);
  });

  it('skips unknown ids quietly', () => {
    const plan = planBatchDelete(['ghost'], files, null, new Set());
    expect(plan.skipped).toEqual(['ghost']);
    expect(batchDeleteCount(plan)).toBe(0);
  });
});
