// Copyright (c) 2026 DRS AI. All rights reserved.
import { DownloadManager, InsufficientDiskError, type StatePatch } from '../src/models/downloadManager';
import type { ModelInfo } from '../src/types';
import { FakeTransport, flush } from './fakeTransport';

const model: ModelInfo = {
  id: 'm1',
  name: 'Test',
  description: '',
  url: 'https://huggingface.co/a/b/resolve/main/test.gguf',
  fileName: 'test.gguf',
  sizeBytes: 1000,
  params: '1B',
  quant: 'Q4_K_M',
  license: '',
  source: 'catalog',
};

function setup(stallTimeoutMs = 45_000, stallCheckMs = 5_000) {
  const transport = new FakeTransport();
  const events: StatePatch[] = [];
  let now = 0;
  const mgr = new DownloadManager(transport, (_id, p) => events.push(p), () => now, 250, stallTimeoutMs, stallCheckMs);
  const advance = (ms: number) => {
    now += ms;
  };
  const merged = () => Object.assign({}, ...events);
  return { transport, events, mgr, advance, merged };
}

describe('DownloadManager', () => {
  it('downloads to a .part file and moves it into place on completion', async () => {
    const { transport, mgr, merged } = setup();
    const done = mgr.start(model);
    expect(mgr.isActive('m1')).toBe(true);
    expect(transport.last.dest).toBe('file:///models/test.gguf.part');
    transport.last.complete(1000);
    await done;
    expect(transport.exists('file:///models/test.gguf')).toBe(true);
    expect(transport.exists('file:///models/test.gguf.part')).toBe(false);
    expect(merged()).toMatchObject({ status: 'downloaded', bytesWritten: 1000, totalBytes: 1000 });
    expect(mgr.isDownloaded(model)).toBe(true);
    expect(mgr.isActive('m1')).toBe(false);
  });

  it('throttles progress events but always reports completion of bytes', () => {
    const { transport, mgr, events, advance } = setup();
    void mgr.start(model);
    advance(300);
    transport.last.progress(100, 1000);
    transport.last.progress(200, 1000); // throttled
    advance(300);
    transport.last.progress(300, 1000);
    transport.last.progress(1000, 1000); // final always emitted
    const progress = events.filter((e) => e.bytesWritten !== undefined && e.status === undefined).map((e) => e.bytesWritten);
    expect(progress).toEqual([0, 100, 300, 1000]);
    mgr.cancel(model); // disarm the watchdog: the transfer stays pending in this test
  });

  it('pauses with resume state and resumes from it', async () => {
    const { transport, mgr, merged } = setup();
    const first = mgr.start(model);
    transport.last.progress(400, 1000);
    await mgr.pause('m1');
    await first;
    const state = merged();
    expect(state.status).toBe('paused');
    expect(state.resumeState).toEqual({ url: model.url, fileUri: 'file:///models/test.gguf.part', resumeData: 'bytes=400' });
    expect(mgr.isActive('m1')).toBe(false);

    const second = mgr.resume(model, state.resumeState);
    expect(transport.last.resumeState).toEqual(state.resumeState);
    transport.last.complete(1000);
    await second;
    expect(merged().status).toBe('downloaded');
  });

  it('resume without saved state restarts from scratch', async () => {
    const { transport, mgr } = setup();
    void mgr.resume(model, null);
    expect(transport.last.resumeState).toBeUndefined();
    mgr.cancel(model); // disarm the watchdog: the transfer stays pending in this test
  });

  it('cancel removes the partial file and resets state without reporting an error', async () => {
    const { transport, mgr, merged } = setup();
    const p = mgr.start(model);
    transport.last.progress(500, 1000);
    mgr.cancel(model);
    await p;
    await flush();
    expect(transport.last.cancelled).toBe(true);
    expect(transport.exists('file:///models/test.gguf.part')).toBe(false);
    expect(merged()).toMatchObject({ status: 'idle', bytesWritten: 0, error: null });
  });

  it('reports network errors', async () => {
    const { transport, mgr, merged } = setup();
    const p = mgr.start(model);
    transport.last.fail('HTTP 500');
    await p;
    expect(merged()).toMatchObject({ status: 'error', error: 'HTTP 500' });
  });

  it('refuses to start when disk space is insufficient', () => {
    const { transport, mgr } = setup();
    transport.free = 10;
    expect(() => mgr.start(model)).toThrow(InsufficientDiskError);
  });

  it('deletes downloaded files', async () => {
    const { transport, mgr, merged } = setup();
    const p = mgr.start(model);
    transport.last.complete(1000);
    await p;
    mgr.deleteFile(model);
    expect(transport.exists('file:///models/test.gguf')).toBe(false);
    expect(merged().status).toBe('idle');
    expect(mgr.isDownloaded(model)).toBe(false);
  });

  it('treats a truncated final file as not downloaded', () => {
    const { transport, mgr } = setup();
    transport.files.set('file:///models/test.gguf', 10);
    expect(mgr.isDownloaded(model)).toBe(false);
  });

  it('accepts the download when the sha256 matches', async () => {
    const { transport, mgr, merged } = setup();
    const hashed: ModelInfo = { ...model, sha256: 'AA'.repeat(32) }; // case-insensitive compare
    transport.hashes.set('file:///models/test.gguf.part', 'aa'.repeat(32));
    const p = mgr.start(hashed);
    transport.last.complete(1000);
    await p;
    expect(merged()).toMatchObject({ status: 'downloaded', error: null });
    expect(transport.exists('file:///models/test.gguf')).toBe(true);
  });

  it('rejects and deletes a corrupted download when the sha256 does not match', async () => {
    const { transport, mgr, merged } = setup();
    const hashed: ModelInfo = { ...model, sha256: 'ab'.repeat(32) };
    transport.hashes.set('file:///models/test.gguf.part', 'cd'.repeat(32));
    const p = mgr.start(hashed);
    transport.last.complete(1000);
    await p;
    expect(merged()).toMatchObject({ status: 'error', error: 'SHA256_MISMATCH' });
    expect(transport.exists('file:///models/test.gguf.part')).toBe(false); // partial dropped
    expect(transport.exists('file:///models/test.gguf')).toBe(false); // never becomes a model
    expect(mgr.isDownloaded(hashed)).toBe(false);
  });

  it('skips verification when the transport cannot hash files', async () => {
    const { transport, mgr, merged } = setup();
    const hashed: ModelInfo = { ...model, sha256: 'ab'.repeat(32) };
    const p = mgr.start(hashed); // transport.hashes is empty -> hashFile returns null
    transport.last.complete(1000);
    await p;
    expect(merged().status).toBe('downloaded');
  });

  it('skips verification when the model has no known hash', async () => {
    const { transport, mgr, merged } = setup();
    transport.hashes.set('file:///models/test.gguf.part', 'cd'.repeat(32)); // would mismatch
    const p = mgr.start(model); // model.sha256 is undefined
    transport.last.complete(1000);
    await p;
    expect(merged().status).toBe('downloaded');
  });

  it('recovers when pause fails instead of leaving the model stuck downloading', async () => {
    const { transport, mgr, merged } = setup();
    const p = mgr.start(model);
    transport.last.failPause = true;
    await mgr.pause('m1');
    await p;
    expect(transport.last.cancelled).toBe(true); // transfer stopped for real
    expect(mgr.isActive('m1')).toBe(false);
    expect(merged()).toMatchObject({ status: 'error', error: 'PAUSE_FAILED' });
  });

  it('unsticks the model when the transfer ends without completion and without a pause', async () => {
    const { transport, mgr, merged } = setup();
    const p = mgr.start(model);
    transport.last.stall(); // resolves false with no pause() recorded
    await p;
    expect(mgr.isActive('m1')).toBe(false);
    expect(merged()).toMatchObject({ status: 'paused', resumeState: null, autoResume: true });
  });

  // ---- stall watchdog ----------------------------------------------------

  it('auto-pauses a transfer that went silent past the stall window, marked auto-resumable', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const { mgr, merged, advance } = setup(1_000, 10);
      const p = mgr.start(model);
      advance(2_000); // silence well past the 1s window
      jest.advanceTimersByTime(20); // watchdog ticks fire
      await p;
      await flush();
      expect(mgr.isActive('m1')).toBe(false);
      expect(merged()).toMatchObject({ status: 'paused', autoResume: true });
      expect(merged().resumeState).toEqual({ url: model.url, fileUri: 'file:///models/test.gguf.part', resumeData: 'bytes=0' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not pause while bytes keep flowing', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const { transport, mgr, merged, advance } = setup(1_000, 10);
      void mgr.start(model);
      for (let i = 0; i < 6; i++) {
        advance(400); // silence below the window
        transport.last.progress(100 * (i + 1), 1000); // fresh progress
        jest.advanceTimersByTime(20); // watchdog ticks fire
      }
      expect(merged().status).toBe('downloading');
      expect(mgr.isActive('m1')).toBe(true);
      mgr.cancel(model);
      await flush();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a hashing transfer alive past the stall window, then finishes it', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const { transport, mgr, merged, advance } = setup(1_000, 10);
      const hashed: ModelInfo = { ...model, sha256: 'ab'.repeat(32) };
      transport.hashes.set('file:///models/test.gguf.part', 'ab'.repeat(32));
      transport.holdHash = true;
      const p = mgr.start(hashed);
      transport.last.complete(1000);
      // Let run() reach the hashing phase (heartbeat armed)...
      await flush();
      // ...then sit in silence far past the stall window while hashing runs.
      // Time advances the way it really does: in steps, with ticks between.
      for (let i = 0; i < 10; i++) {
        advance(700);
        jest.advanceTimersByTime(30);
      }
      transport.releaseHash();
      await p;
      await flush();
      expect(merged().status).toBe('downloaded'); // the heartbeat beat the watchdog
      expect(mgr.isActive('m1')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a user pause never becomes auto-resumable', async () => {
    const { transport, mgr, merged } = setup(1_000, 10);
    const p = mgr.start(model);
    transport.last.progress(400, 1000);
    await mgr.pause('m1');
    await p;
    expect(merged()).toMatchObject({ status: 'paused', autoResume: false });
  });
});
