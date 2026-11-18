// Copyright (c) 2026 DRS AI. All rights reserved.
import { DownloadManager, type StatePatch } from '../src/models/downloadManager';
import type { FastSidecar } from '../src/models/fastdl/types';
import { etaParts, etaSeconds, SpeedMeter, speedParts } from '../src/models/speed';
import { chooseTransport, createAdaptiveTransport, sidecarPathFor, type FastTaskFactory } from '../src/models/transportSelect';
import type { ModelInfo } from '../src/types';
import { FakeTransport, flush } from './fakeTransport';

const fastState: FastSidecar = {
  kind: 'fastdl',
  v: 1,
  url: 'https://x/m.gguf',
  finalUrl: 'https://cdn/m',
  total: 1000,
  ranged: true,
  segments: [{ id: 0, start: 0, end: 1000, pos: 400 }],
};

const model: ModelInfo = {
  id: 'm1',
  name: 'Test',
  description: '',
  url: 'https://x/m.gguf',
  fileName: 'm.gguf',
  sizeBytes: 1000,
  params: '1B',
  quant: 'Q4_K_M',
  license: '',
  source: 'catalog',
};

describe('chooseTransport', () => {
  it('uses fast for fresh downloads only when enabled and available', () => {
    expect(chooseTransport({ fastEnabled: true, fastAvailable: true })).toBe('fast');
    expect(chooseTransport({ fastEnabled: false, fastAvailable: true })).toBe('expo');
    expect(chooseTransport({ fastEnabled: true, fastAvailable: false })).toBe('expo');
  });

  it('sends a saved state back to the engine that produced it', () => {
    expect(chooseTransport({ fastEnabled: false, fastAvailable: true, resumeState: fastState })).toBe('fast');
    expect(chooseTransport({ fastEnabled: true, fastAvailable: true, resumeState: { resumeData: 'x' } })).toBe('expo');
    expect(chooseTransport({ fastEnabled: true, fastAvailable: false, resumeState: fastState })).toBe('expo');
  });
});

describe('createAdaptiveTransport', () => {
  function build(enabled: boolean, withFast = true) {
    const base = new FakeTransport();
    const fastCalls: unknown[][] = [];
    const fast: FastTaskFactory = (url, dest, onProgress, resumeState) => {
      fastCalls.push([url, dest, resumeState]);
      return base.createTask(url, dest, onProgress, resumeState);
    };
    const sidecars = new Map<string, unknown>();
    let on = enabled;
    const t = createAdaptiveTransport({
      base,
      fast: withFast ? fast : null,
      fastEnabled: () => on,
      readSidecar: (p) => sidecars.get(p) ?? null,
    });
    return { base, t, fastCalls, sidecars, setOn: (v: boolean) => (on = v) };
  }

  it('routes by the setting at task creation time', () => {
    const { t, fastCalls, base, setOn } = build(true);
    t.createTask('u', 'file:///models/m.gguf.part', () => {});
    expect(fastCalls).toHaveLength(1);
    setOn(false);
    t.createTask('u', 'file:///models/m.gguf.part', () => {});
    expect(fastCalls).toHaveLength(1);
    expect(base.tasks).toHaveLength(2);
  });

  it('drops a stale fast sidecar when a fresh expo download starts', () => {
    const { t, base } = build(false);
    const part = 'file:///models/m.gguf.part';
    base.files.set(sidecarPathFor(part), 10);
    t.createTask('u', part, () => {});
    expect(base.exists(sidecarPathFor(part))).toBe(false);
  });

  it('never hands a fast plan to expo when the native module is missing', () => {
    const { t, base } = build(true, false);
    t.createTask('u', 'file:///models/m.gguf.part', () => {}, fastState);
    expect(base.last.resumeState).toBeUndefined();
  });

  it('removes the sidecar along with the .part file and after moving it into place', () => {
    const { t, base } = build(true);
    const part = 'file:///models/m.gguf.part';
    base.files.set(part, 5);
    base.files.set(sidecarPathFor(part), 1);
    t.remove(part);
    expect(base.exists(sidecarPathFor(part))).toBe(false);
    base.files.set(part, 5);
    base.files.set(sidecarPathFor(part), 1);
    t.move(part, 'file:///models/m.gguf');
    expect(base.exists(sidecarPathFor(part))).toBe(false);
  });

  it('recovers a fast plan after an app kill only when the .part matches it', () => {
    const { t, base, sidecars } = build(true);
    const part = base.partialPath('m.gguf');
    sidecars.set(sidecarPathFor(part), fastState);
    expect(t.recoverResumeState!('m.gguf')).toBeNull(); // no .part
    base.files.set(part, 999);
    expect(t.recoverResumeState!('m.gguf')).toBeNull(); // wrong size
    base.files.set(part, 1000);
    expect(t.recoverResumeState!('m.gguf')).toEqual(fastState);
    sidecars.set(sidecarPathFor(part), { ...fastState, ranged: false });
    expect(t.recoverResumeState!('m.gguf')).toBeNull();
  });

  it('lets the DownloadManager surface recovered state', () => {
    const { t, base, sidecars } = build(true);
    const part = base.partialPath('m.gguf');
    sidecars.set(sidecarPathFor(part), fastState);
    base.files.set(part, 1000);
    const mgr = new DownloadManager(t, () => {});
    expect(mgr.recoverResumeState(model)).toEqual(fastState);
  });
});

describe('download speed', () => {
  it('measures bytes per second over a sliding window', () => {
    const m = new SpeedMeter(3000);
    expect(m.sample(0, 0)).toBe(0);
    expect(m.sample(1_000_000, 1000)).toBe(1_000_000);
    expect(m.sample(3_000_000, 2000)).toBe(1_500_000);
    m.sample(10_000_000, 6000); // older samples fall out of the window
    expect(m.speed()).toBeCloseTo((7_000_000 * 1000) / 4000);
    expect(m.sample(0, 7000)).toBe(0); // restart resets
  });

  it('estimates the time left and splits labels', () => {
    expect(etaSeconds(500, 1000, 100)).toBe(5);
    expect(etaSeconds(500, 0, 100)).toBeNull();
    expect(etaSeconds(500, 1000, 0)).toBeNull();
    expect(speedParts(12_345_678)).toEqual({ unit: 'MB', value: '12.3' });
    expect(speedParts(250_000_000)).toEqual({ unit: 'MB', value: '250' });
    expect(speedParts(900)).toEqual({ unit: 'KB', value: '1' });
    expect(etaParts(45)).toMatchObject({ kind: 's', s: 45 });
    expect(etaParts(185)).toMatchObject({ kind: 'm', m: 3, s: 5 });
    expect(etaParts(3720)).toMatchObject({ kind: 'h', h: 1, m: 2 });
  });

  it('DownloadManager reports speed with progress', async () => {
    const transport = new FakeTransport();
    const events: StatePatch[] = [];
    let now = 0;
    const mgr = new DownloadManager(transport, (_id, p) => events.push(p), () => now, 250);
    const done = mgr.start(model);
    now = 1000;
    transport.last.progress(100, 1000);
    now = 2000;
    transport.last.progress(300, 1000);
    const last = events.filter((e) => e.speedBps !== undefined).pop()!;
    expect(last.speedBps).toBe(200); // (300-100) bytes over 1 s
    transport.last.complete(1000);
    await done;
    await flush();
  });
});
