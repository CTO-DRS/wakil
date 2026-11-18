// Copyright (c) 2026 DRS AI. All rights reserved.
import { FastTransferTask, type FastTaskOptions } from '../src/models/fastdl/fastTask';
import { isValidPlan } from '../src/models/fastdl/segments';
import type { FastSidecar, KeepAlive } from '../src/models/fastdl/types';
import { FakeFastNative, MemorySidecars, tick } from './fakeFastNative';

const MB = 1 << 20;
const URL = 'https://huggingface.co/a/b/resolve/main/m.gguf';
const DEST = 'file:///models/m.gguf.part';
const SIDE = `${DEST}.json`;

function setup(over: Partial<FastTaskOptions> = {}, total = 64 * MB) {
  const native = new FakeFastNative();
  native.probeResult = { finalUrl: 'https://cdn.example/signed?1', totalBytes: total, acceptRanges: true };
  const sidecars = new MemorySidecars();
  const progress: [number, number][] = [];
  const sizes = new Map<string, number>([[DEST, total]]);
  let now = 0;
  const keep: string[] = [];
  const keepAlive: KeepAlive = {
    start: (k) => keep.push(`start:${k}`),
    update: () => {},
    stop: (k) => keep.push(`stop:${k}`),
  };
  const opts: FastTaskOptions = {
    native,
    sidecars,
    keepAlive,
    url: URL,
    dest: DEST,
    sidecarPath: SIDE,
    connections: 4,
    onProgress: (w, t) => progress.push([w, t]),
    fileSize: (p) => sizes.get(p) ?? 0,
    now: () => now,
    ...over,
  };
  const task = new FastTransferTask(opts);
  return { native, sidecars, progress, sizes, task, keep, advance: (ms: number) => (now += ms), opts };
}

async function startAndWait(task: FastTransferTask) {
  const p = task.start();
  await tick();
  return p;
}

describe('FastTransferTask', () => {
  it('probes, preallocates and downloads N ranges in parallel from the redirected URL', async () => {
    const { native, task, sidecars, progress, keep } = setup();
    const done = startAndWait(task);
    await tick();
    expect(native.probes).toEqual([URL]);
    expect(native.preallocated).toEqual([{ path: DEST, size: 64 * MB }]);
    expect(native.ids()).toEqual([0, 1, 2, 3]);
    expect(native.requests.every((r) => r.url === 'https://cdn.example/signed?1' && r.path === DEST)).toBe(true);
    expect(sidecars.files.has(SIDE)).toBe(true);
    for (const id of [0, 1, 2, 3]) native.finish(id);
    await expect(done).resolves.toBe(true);
    expect(progress[progress.length - 1]).toEqual([64 * MB, 64 * MB]);
    expect(sidecars.files.has(SIDE)).toBe(false); // cleaned on completion
    expect(native.listenerCount).toBe(0);
    expect(keep[0]).toMatch(/^start:/);
    expect(keep[keep.length - 1]).toMatch(/^stop:/);
  });

  it('reports summed progress from native position events', async () => {
    const { native, task, progress } = setup();
    void startAndWait(task);
    await tick();
    native.advance(0, MB);
    native.advance(2, 3 * MB);
    expect(progress[progress.length - 1]).toEqual([4 * MB, 64 * MB]);
  });

  it('splits the largest remaining range when a connection frees up (work stealing)', async () => {
    const { native, task } = setup();
    const done = startAndWait(task);
    await tick();
    native.advance(1, 15 * MB); // range 1 nearly done
    native.advance(2, 2 * MB); // range 2 has the most left (14 MB)
    native.advance(3, 8 * MB);
    native.advance(0, 4 * MB);
    native.finish(1);
    await tick();
    // A new range 4 was carved out of range 2 and started.
    expect(native.ids()).toEqual([0, 2, 3, 4]);
    const plan = task.plan;
    const r2 = plan.find((s) => s.id === 2)!;
    const r4 = plan.find((s) => s.id === 4)!;
    expect(r4.start).toBe(r2.end);
    expect(native.find(2)!.end).toBe(r2.end);
    expect(isValidPlan(plan, 64 * MB)).toBe(true);
    for (const id of [0, 2, 3, 4]) native.finish(id);
    await tick();
    // Further steals may follow; finish whatever is still running.
    while (native.running.length) {
      for (const id of native.ids()) native.finish(id);
      await tick();
    }
    await expect(done).resolves.toBe(true);
  });

  it('does not split when the victim already passed the split point', async () => {
    const { native, task } = setup();
    void startAndWait(task);
    await tick();
    const spy = jest.spyOn(native, 'setSegmentEnd').mockReturnValue(false);
    native.finish(0);
    await tick();
    expect(spy).toHaveBeenCalled();
    expect(native.ids()).toEqual([1, 2, 3]);
    expect(task.plan).toHaveLength(4);
  });

  it('pauses with a resumable plan and resumes only the missing bytes', async () => {
    const first = setup();
    const done = startAndWait(first.task);
    await tick();
    first.native.advance(0, 10 * MB);
    first.native.finish(1);
    await tick();
    const state = (await first.task.pause()) as FastSidecar;
    await expect(done).resolves.toBe(false);
    expect(state.kind).toBe('fastdl');
    expect(isValidPlan(state.segments, 64 * MB)).toBe(true);
    expect(first.sidecars.files.get(SIDE)).toEqual(state);
    expect(first.native.running).toHaveLength(0);

    // A new task (as after an app restart) continues from the sidecar.
    const second = setup({ resumeState: state, sidecars: first.sidecars });
    second.native.probeResult = { finalUrl: 'https://cdn.example/signed?2', totalBytes: 64 * MB, acceptRanges: true };
    const resumed = second.task.resume();
    await tick();
    await tick();
    expect(second.native.preallocated).toEqual([]); // keeps the existing .part
    const r0 = second.native.requests.find((r) => r.segmentId === 0)!;
    expect(r0.pos).toBe(10 * MB);
    expect(second.native.requests.some((r) => r.segmentId === 1 && r.pos === r.end)).toBe(false);
    expect(second.native.requests.every((r) => r.url === 'https://cdn.example/signed?2')).toBe(true);
    while (second.native.running.length) {
      for (const id of second.native.ids()) second.native.finish(id);
      await tick();
    }
    await expect(resumed).resolves.toBe(true);
  });

  it('restarts from scratch when the .part file does not match the saved plan', async () => {
    const first = setup();
    void startAndWait(first.task);
    await tick();
    const state = await first.task.pause();
    const second = setup({ resumeState: state });
    second.sizes.set(DEST, 0); // .part is gone
    void second.task.resume();
    await tick();
    await tick();
    expect(second.native.preallocated).toEqual([{ path: DEST, size: 64 * MB }]);
    expect(second.native.requests.every((r) => r.pos === r.start)).toBe(true);
  });

  it('refreshes an expired CDN URL from the original link and retries the range', async () => {
    const { native, task } = setup();
    void startAndWait(task);
    await tick();
    native.probeResult = { ...native.probeResult, finalUrl: 'https://cdn.example/signed?fresh' };
    native.advance(2, MB);
    native.fail(2, 'HTTP_403');
    await tick();
    await tick();
    expect(native.probes).toEqual([URL, URL]);
    const retry = native.requests.filter((r) => r.segmentId === 2);
    expect(retry).toHaveLength(2);
    expect(retry[1].url).toBe('https://cdn.example/signed?fresh');
    expect(retry[1].pos).toBe(retry[0].pos + MB);
  });

  it('falls back to the original URL when re-resolving fails', async () => {
    const { native, task } = setup();
    void startAndWait(task);
    await tick();
    native.probeError = new Error('offline');
    native.fail(1, 'HTTP_410');
    await tick();
    await tick();
    const retry = native.requests.filter((r) => r.segmentId === 1);
    expect(retry[1].url).toBe(URL);
  });

  it('fails with the native error code for fatal errors', async () => {
    const { native, task, sidecars } = setup();
    const done = startAndWait(task);
    await tick();
    native.fail(0, 'HTTP_404');
    await expect(done).rejects.toThrow('HTTP_404');
    expect(native.running).toHaveLength(0); // other ranges stopped
    expect(sidecars.files.has(SIDE)).toBe(true);
  });

  it('uses one plain stream when the server has no range support', async () => {
    const { native, task, sidecars } = setup();
    native.probeResult = { finalUrl: URL, totalBytes: -1, acceptRanges: false };
    const done = startAndWait(task);
    await tick();
    expect(native.preallocated).toEqual([{ path: DEST, size: -1 }]);
    expect(native.requests).toHaveLength(1);
    expect(native.requests[0]).toMatchObject({ start: 0, pos: 0, end: -1 });
    native.finish(0, 5 * MB);
    await expect(done).resolves.toBe(true);
    expect(sidecars.writes).toBe(0); // nothing to resume for a plain stream
  });

  it('switches to a single stream when the server starts ignoring ranges', async () => {
    const { native, task } = setup();
    const done = startAndWait(task);
    await tick();
    native.fail(3, 'RANGE_IGNORED');
    await tick();
    await tick();
    expect(native.running).toHaveLength(1);
    expect(native.running[0].req).toMatchObject({ start: 0, pos: 0, end: -1 });
    native.finish(0, 64 * MB);
    await expect(done).resolves.toBe(true);
  });

  it('cancel stops native work and removes the sidecar', async () => {
    const { native, task, sidecars } = setup();
    const done = startAndWait(task);
    await tick();
    task.cancel();
    await expect(done).rejects.toThrow('cancelled');
    expect(native.running).toHaveLength(0);
    expect(sidecars.files.has(SIDE)).toBe(false);
  });

  it('honours the connections setting', async () => {
    const { native, task } = setup({ connections: 2 });
    void startAndWait(task);
    await tick();
    expect(native.ids()).toEqual([0, 1]);
  });

  it('persists progress to the sidecar at most every interval', async () => {
    const { native, task, sidecars, advance } = setup({ sidecarIntervalMs: 2000 });
    void startAndWait(task);
    await tick();
    const base = sidecars.writes;
    native.advance(0, MB);
    native.advance(0, MB);
    expect(sidecars.writes).toBe(base);
    advance(2500);
    native.advance(0, MB);
    expect(sidecars.writes).toBe(base + 1);
    expect(sidecars.files.get(SIDE)!.segments[0].pos).toBe(3 * MB);
  });
});
