// Copyright (c) 2026 DRS AI. All rights reserved.
import type { DownloadTransport, ProgressFn, TransferTask } from '../src/models/downloadManager';

type Deferred = { resolve: (v: boolean) => void; reject: (e: unknown) => void };

/** Controllable in-memory transport for download tests. */
export class FakeTransport implements DownloadTransport {
  files = new Map<string, number>();
  free: number | null = 10 * 1024 * 1024 * 1024;
  tasks: FakeTask[] = [];
  /** path -> sha256 reported by hashFile (absent = hashing unavailable, returns null). */
  hashes = new Map<string, string>();
  /** When set, hashFile holds until releaseHash() (tests the hashing heartbeat). */
  holdHash = false;
  private heldValue: string | null = null;
  private hashWait: ((v: string | null) => void) | null = null;

  finalPath(name: string) {
    return `file:///models/${name}`;
  }
  partialPath(name: string) {
    return `file:///models/${name}.part`;
  }
  createTask(url: string, dest: string, onProgress: ProgressFn, resumeState?: unknown): TransferTask {
    const t = new FakeTask(this, url, dest, onProgress, resumeState);
    this.tasks.push(t);
    return t;
  }
  exists(p: string) {
    return this.files.has(p);
  }
  size(p: string) {
    return this.files.get(p) ?? 0;
  }
  move(from: string, to: string) {
    const s = this.files.get(from);
    if (s === undefined) throw new Error('missing');
    this.files.delete(from);
    this.files.set(to, s);
  }
  remove(p: string) {
    this.files.delete(p);
  }
  freeDiskBytes() {
    return this.free;
  }
  async hashFile(p: string) {
    const v = this.hashes.get(p) ?? null;
    if (!this.holdHash) return v;
    this.heldValue = v;
    return new Promise<string | null>((resolve) => {
      this.hashWait = resolve;
    });
  }

  /** Releases a hashFile() call held by holdHash, delivering the held value. */
  releaseHash() {
    this.holdHash = false;
    const resolve = this.hashWait;
    this.hashWait = null;
    if (resolve) resolve(this.heldValue);
  }
  get last(): FakeTask {
    return this.tasks[this.tasks.length - 1];
  }
}

export class FakeTask implements TransferTask {
  private pending: Deferred | null = null;
  cancelled = false;
  written = 0;
  /** When set, the next pause() rejects (simulates expo pauseAsync failure). */
  failPause = false;

  constructor(
    private readonly t: FakeTransport,
    readonly url: string,
    readonly dest: string,
    private readonly onProgress: ProgressFn,
    readonly resumeState?: unknown,
  ) {}

  private wait() {
    return new Promise<boolean>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }
  start() {
    return this.wait();
  }
  resume() {
    return this.wait();
  }
  async pause() {
    if (this.failPause) {
      this.failPause = false;
      throw new Error('PAUSE_FAILED');
    }
    this.pending?.resolve(false);
    this.pending = null;
    return { url: this.url, fileUri: this.dest, resumeData: `bytes=${this.written}` };
  }
  /** Ends the transfer as "not completed" without a pause (simulates a transport quirk). */
  stall() {
    this.pending?.resolve(false);
    this.pending = null;
  }
  cancel() {
    this.cancelled = true;
    this.pending?.reject(new Error('cancelled'));
    this.pending = null;
  }
  progress(written: number, total: number) {
    this.written = written;
    this.t.files.set(this.dest, written);
    this.onProgress(written, total);
  }
  complete(size: number) {
    this.t.files.set(this.dest, size);
    this.pending?.resolve(true);
    this.pending = null;
  }
  fail(msg: string) {
    this.pending?.reject(new Error(msg));
    this.pending = null;
  }
}

export const flush = () => new Promise<void>((r) => setImmediate(r));
