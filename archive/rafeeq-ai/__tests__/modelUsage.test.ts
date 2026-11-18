// Copyright (c) 2026 DRS AI. All rights reserved.
import { Storage } from 'expo-sqlite/kv-store';

import {
  localDayKey,
  summarizeUsage,
  TIMELINE_MAX_DAYS,
  trimUsage,
  USAGE_CAP,
  usageTimeline,
  type UsageEntry,
  type UsageKind,
} from '../src/model/usage/records';
import { useUsageStore } from '../src/model/usage/store';
import { useLlmStore } from '../src/store/llmStore';

const entry = (modelId: string, at: number, kind: UsageKind = 'chat', tokens: number | null = 10, ms: number | null = 1000): UsageEntry => ({
  modelId,
  at,
  kind,
  tokens,
  ms,
});

describe('trimUsage', () => {
  it('keeps the newest entries when the log overflows', () => {
    const entries = Array.from({ length: USAGE_CAP + 10 }, (_, i) => entry(`m${i}`, i));
    const trimmed = trimUsage(entries);
    expect(trimmed).toHaveLength(USAGE_CAP);
    expect(trimmed[0].modelId).toBe('m10');
    expect(trimmed[trimmed.length - 1].modelId).toBe(`m${USAGE_CAP + 9}`);
  });

  it('leaves a short log untouched', () => {
    const entries = [entry('a', 1), entry('b', 2)];
    expect(trimUsage(entries)).toEqual(entries);
  });
});

describe('summarizeUsage', () => {
  it('totals runs, tokens and distinct models', () => {
    const totals = summarizeUsage([entry('a', 1, 'chat', 100), entry('a', 2, 'chat', 50), entry('b', 3, 'summary', null)]);
    expect(totals.runs).toBe(3);
    expect(totals.tokens).toBe(150);
    expect(totals.models).toBe(2);
  });

  it('ranks models busiest-first and breaks ties by recency', () => {
    const totals = summarizeUsage([
      entry('quiet', 1, 'chat', 10),
      entry('busy', 2, 'chat', 10),
      entry('busy', 3, 'chat', 10),
      entry('recent', 4, 'chat', 10),
      entry('recent', 5, 'chat', 10),
    ]);
    expect(totals.byModel.map((r) => r.modelId)).toEqual(['recent', 'busy', 'quiet']);
    expect(totals.byModel[0].runs).toBe(2);
  });

  it('limits the by-model rows to the requested cap', () => {
    const entries = ['a', 'b', 'c', 'd'].map((id, i) => entry(id, i));
    expect(summarizeUsage(entries, 2).byModel).toHaveLength(2);
  });
});

describe('usage store', () => {
  beforeEach(() => {
    Storage.clear();
    useUsageStore.setState(useUsageStore.getInitialState());
    useLlmStore.setState({ loadedModelId: 'model-1' });
  });

  it('attributes a run to the loaded model', () => {
    useUsageStore.getState().record('chat', { tokens: 42, ms: 900, at: 1000 });
    const entries = useUsageStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ modelId: 'model-1', kind: 'chat', tokens: 42, ms: 900, at: 1000 });
  });

  it('skips the entry when no model is loaded', () => {
    useLlmStore.setState({ loadedModelId: null });
    useUsageStore.getState().record('chat', { tokens: 1 });
    expect(useUsageStore.getState().entries).toHaveLength(0);
  });

  it('honors an explicit model override (test hook)', () => {
    useUsageStore.getState().record('variants', { modelId: 'model-2', tokens: null });
    expect(useUsageStore.getState().entries[0].modelId).toBe('model-2');
  });

  it('caps the log so it never grows unbounded', () => {
    for (let i = 0; i < USAGE_CAP + 5; i++) {
      useUsageStore.getState().record('chat', { modelId: `m${i}`, tokens: 1, at: i });
    }
    const entries = useUsageStore.getState().entries;
    expect(entries).toHaveLength(USAGE_CAP);
    expect(entries[0].modelId).toBe('m5');
  });

  it('clear wipes the log', () => {
    useUsageStore.getState().record('chat', { tokens: 1 });
    useUsageStore.getState().clear();
    expect(useUsageStore.getState().entries).toHaveLength(0);
  });
});

describe('usageTimeline', () => {
  // Local 2026-11-07 15:30 — safely away from any midnight edge.
  const now = new Date(2026, 10, 7, 15, 30).getTime();
  const atDay = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();

  it('builds seven zero-filled local-day buckets ending today, oldest first', () => {
    const timeline = usageTimeline([], 7, now);
    expect(timeline.map((b) => b.dayKey)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(timeline.every((b) => b.runs === 0 && b.tokens === 0)).toBe(true);
  });

  it('counts runs and tokens into their local day', () => {
    const timeline = usageTimeline(
      [
        entry('a', atDay(2026, 10, 6, 9), 'chat', 100),
        entry('a', atDay(2026, 10, 6, 23), 'chat', 50),
        entry('b', atDay(2026, 10, 7, 0), 'summary', null),
        entry('a', atDay(2026, 10, 5), 'chat', 10),
      ],
      7,
      now,
    );
    expect(timeline.find((b) => b.dayKey === '2026-11-06')).toMatchObject({ runs: 2, tokens: 150 });
    expect(timeline.find((b) => b.dayKey === '2026-11-07')).toMatchObject({ runs: 1, tokens: 0 });
    expect(timeline.find((b) => b.dayKey === '2026-11-05')).toMatchObject({ runs: 1, tokens: 10 });
  });

  it('ignores entries outside the window and from the future', () => {
    const timeline = usageTimeline([entry('a', atDay(2026, 9, 30)), entry('a', atDay(2026, 10, 8))], 7, now);
    expect(timeline.reduce((n, b) => n + b.runs, 0)).toBe(0);
  });

  it('supports the 30-day span and clamps wild day counts', () => {
    expect(usageTimeline([], 30, now)).toHaveLength(30);
    expect(usageTimeline([], 0, now)).toHaveLength(1);
    expect(usageTimeline([], 5000, now)).toHaveLength(TIMELINE_MAX_DAYS);
  });

  it('localDayKey zero-pads the device-local day', () => {
    expect(localDayKey(new Date(2026, 2, 1, 7).getTime())).toBe('2026-03-01');
    expect(localDayKey(now)).toBe('2026-11-07');
  });
});
