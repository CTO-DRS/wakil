// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  DOWNLOAD_STALL_CHECK_MS,
  DOWNLOAD_STALL_TIMEOUT_MS,
  decideModelsRoot,
  isStalled,
  planMigration,
} from '../src/models/modelStorage';

describe('decideModelsRoot', () => {
  const base = { platformSupports: true, settingEnabled: true, allFilesGranted: true };

  it('uses the public Downloads folder only when all three conditions hold', () => {
    expect(decideModelsRoot(base)).toBe('public');
  });

  it('falls back to the internal root whenever any condition is missing', () => {
    expect(decideModelsRoot({ ...base, platformSupports: false })).toBe('internal');
    expect(decideModelsRoot({ ...base, settingEnabled: false })).toBe('internal');
    expect(decideModelsRoot({ ...base, allFilesGranted: false })).toBe('internal');
    expect(decideModelsRoot({ platformSupports: false, settingEnabled: false, allFilesGranted: false })).toBe('internal');
  });
});

describe('planMigration', () => {
  it('moves files that are missing or size-mismatched in the target', () => {
    const plan = planMigration(
      { 'a.gguf': 1000, 'b.gguf': 2000, 'c.gguf': 3000 },
      { 'a.gguf': 1000, 'b.gguf': 1999 },
    );
    expect(plan.move).toEqual(['b.gguf', 'c.gguf']);
    expect(plan.alreadyThere).toEqual(['a.gguf']);
  });

  it('returns an empty plan when everything is already migrated', () => {
    const plan = planMigration({ 'a.gguf': 1000 }, { 'a.gguf': 1000 });
    expect(plan).toEqual({ move: [], alreadyThere: ['a.gguf'] });
  });

  it('moves everything when the target is empty', () => {
    const plan = planMigration({ 'a.gguf': 1000, 'b.bin': 5 }, {});
    expect(plan.move).toEqual(['a.gguf', 'b.bin']);
    expect(plan.alreadyThere).toEqual([]);
  });

  it('handles empty sources', () => {
    expect(planMigration({}, { 'x.gguf': 1 })).toEqual({ move: [], alreadyThere: [] });
  });
});

describe('isStalled', () => {
  it('treats a zero timestamp as stalled since the epoch (no progress ever recorded)', () => {
    expect(isStalled(0, DOWNLOAD_STALL_TIMEOUT_MS, DOWNLOAD_STALL_TIMEOUT_MS)).toBe(true);
  });

  it('fires exactly at the silence window', () => {
    expect(isStalled(1000, 1000 + DOWNLOAD_STALL_TIMEOUT_MS - 1, DOWNLOAD_STALL_TIMEOUT_MS)).toBe(false);
    expect(isStalled(1000, 1000 + DOWNLOAD_STALL_TIMEOUT_MS, DOWNLOAD_STALL_TIMEOUT_MS)).toBe(true);
  });

  it('defaults match the published constants', () => {
    expect(DOWNLOAD_STALL_TIMEOUT_MS).toBe(45_000);
    expect(DOWNLOAD_STALL_CHECK_MS).toBe(5_000);
  });
});
