// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ModelFileState, ModelInfo } from '../types';
import { hasDiskSpace } from './resources';
import { SpeedMeter } from './speed';
import { DOWNLOAD_STALL_CHECK_MS, DOWNLOAD_STALL_TIMEOUT_MS, isStalled } from './modelStorage';

export type ProgressFn = (bytesWritten: number, totalBytes: number) => void;

/** One network transfer. `start`/`resume` resolve true when complete, false when paused. */
export interface TransferTask {
  start(): Promise<boolean>;
  resume(): Promise<boolean>;
  /** Pauses and resolves with serializable resume state (or null if unsupported). */
  pause(): Promise<unknown | null>;
  cancel(): void;
}

/** Platform adapter: file system + network. Mocked in unit tests. */
export interface DownloadTransport {
  finalPath(fileName: string): string;
  partialPath(fileName: string): string;
  createTask(url: string, destPath: string, onProgress: ProgressFn, resumeState?: unknown): TransferTask;
  exists(path: string): boolean;
  size(path: string): number;
  move(from: string, to: string): void;
  remove(path: string): void;
  freeDiskBytes(): number | null;
  /** SHA-256 of a file as lowercase hex, or null when hashing is unavailable/unsupported. */
  hashFile(path: string): Promise<string | null>;
  /**
   * Resume state recovered from disk for an interrupted transfer (e.g. a fast-download
   * sidecar written before the app was killed), or null. Optional.
   */
  recoverResumeState?(fileName: string): unknown | null;
}

export type StatePatch = Partial<ModelFileState>;
export type StateListener = (modelId: string, patch: StatePatch) => void;

export class InsufficientDiskError extends Error {
  constructor(
    public readonly needed: number,
    public readonly available: number,
  ) {
    super('INSUFFICIENT_DISK');
    this.name = 'InsufficientDiskError';
  }
}

type Clock = () => number;

/**
 * Coordinates model downloads: start, pause, resume (also across restarts via saved
 * resume state), cancel and delete. Writes to a ".part" file and moves it into place
 * on completion so a half-finished download is never mistaken for a model.
 */
export class DownloadManager {
  private tasks = new Map<string, TransferTask>();
  private lastEmit = new Map<string, number>();
  private watchdogs = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly transport: DownloadTransport,
    private readonly onState: StateListener,
    private readonly now: Clock = Date.now,
    private readonly progressIntervalMs = 250,
    /** Silence window after which a transfer is auto-paused instead of hanging. */
    private readonly stallTimeoutMs = DOWNLOAD_STALL_TIMEOUT_MS,
    private readonly stallCheckMs = DOWNLOAD_STALL_CHECK_MS,
  ) {}

  isActive(modelId: string): boolean {
    return this.tasks.has(modelId);
  }

  localPath(model: ModelInfo): string {
    return this.transport.finalPath(model.fileName);
  }

  isDownloaded(model: ModelInfo): boolean {
    const p = this.transport.finalPath(model.fileName);
    if (!this.transport.exists(p)) return false;
    if (model.sizeBytes > 0) return this.transport.size(p) >= model.sizeBytes * 0.99;
    return this.transport.size(p) > 0;
  }

  /** Resume state that survived an app kill on disk, when the transport keeps one. */
  recoverResumeState(model: ModelInfo): unknown | null {
    try {
      return this.transport.recoverResumeState?.(model.fileName) ?? null;
    } catch {
      return null;
    }
  }

  // ---- stall watchdog -----------------------------------------------------
  // A transfer whose bytes stopped flowing (dead connection, a background kill
  // that spared the JS thread, a hung socket) used to freeze the UI on
  // "downloading" forever. The watchdog auto-pauses it instead, with the
  // resume state preserved, so the user (or the startup auto-resume) can
  // continue where it stopped.

  private disarmWatchdog(modelId: string): void {
    const timer = this.watchdogs.get(modelId);
    if (timer) {
      clearInterval(timer);
      this.watchdogs.delete(modelId);
    }
  }

  private armWatchdog(model: ModelInfo, task: TransferTask): void {
    this.disarmWatchdog(model.id);
    const timer = setInterval(() => {
      void this.checkStall(model, task);
    }, this.stallCheckMs);
    this.watchdogs.set(model.id, timer);
  }

  private async checkStall(model: ModelInfo, task: TransferTask): Promise<void> {
    if (this.tasks.get(model.id) !== task) {
      this.disarmWatchdog(model.id);
      return;
    }
    if (!isStalled(this.lastEmit.get(model.id) ?? 0, this.now(), this.stallTimeoutMs)) return;
    this.disarmWatchdog(model.id);
    // Claim the flow BEFORE awaiting the pause: task.pause() resolves the
    // transfer's start() promise with false, and run()'s continuation runs one
    // microtask ahead of this function's — without the early delete it would
    // misread the watchdog pause as a transport quirk and drop the resume state.
    this.tasks.delete(model.id);
    try {
      const resumeState = await task.pause();
      this.onState(model.id, { status: 'paused', resumeState: resumeState ?? null, speedBps: 0, autoResume: true });
    } catch {
      // Pause itself failed: stop the transfer for real. A fast plan on disk
      // (sidecar) still lets the next attempt continue; anything else restarts.
      task.cancel();
      const recovered = this.recoverResumeState(model);
      this.onState(model.id, { status: 'paused', resumeState: recovered, speedBps: 0, autoResume: true });
    }
  }

  private progress(modelId: string, total: number): ProgressFn {
    const meter = new SpeedMeter();
    return (written, reportedTotal) => {
      const t = this.now();
      const speedBps = meter.sample(written, t);
      const last = this.lastEmit.get(modelId) ?? 0;
      const totalBytes = reportedTotal > 0 ? reportedTotal : total;
      const done = totalBytes > 0 && written >= totalBytes;
      if (!done && t - last < this.progressIntervalMs) return;
      this.lastEmit.set(modelId, t);
      this.onState(modelId, { bytesWritten: written, totalBytes, speedBps });
    };
  }

  private async run(model: ModelInfo, task: TransferTask, op: 'start' | 'resume'): Promise<void> {
    this.tasks.set(model.id, task);
    // The stall clock starts now: silence from here on is a stall.
    this.lastEmit.set(model.id, this.now());
    this.armWatchdog(model, task);
    this.onState(model.id, { status: 'downloading', error: null });
    try {
      const completed = op === 'start' ? await task.start() : await task.resume();
      if (this.tasks.get(model.id) !== task) return; // cancelled meanwhile
      if (!completed) {
        // Ended without completing and without a recorded pause (transport quirk):
        // clear the active task so the model does not stay stuck in "downloading".
        if (this.tasks.get(model.id) === task) {
          this.tasks.delete(model.id);
          this.onState(model.id, { status: 'paused', resumeState: null, autoResume: true });
        }
        return;
      }
      const part = this.transport.partialPath(model.fileName);
      const final = this.transport.finalPath(model.fileName);
      // The transfer's bytes are complete: the stall clock restarts for the
      // hashing/move phase — no network progress exists there by design, so a
      // heartbeat keeps the clock warm at watchdog cadence until the state
      // leaves "downloading" (a multi-GB hash can outlast the stall window).
      this.lastEmit.set(model.id, this.now());
      const beat = setInterval(() => {
        if (this.tasks.get(model.id) === task) this.lastEmit.set(model.id, this.now());
      }, this.stallCheckMs);
      try {
        // Hash while the task is still registered so a mismatch lands in the error path below.
        if (model.sha256) {
          await this.verifyHash(part, model.sha256);
          if (this.tasks.get(model.id) !== task) return; // paused/cancelled during hashing
        }
        this.tasks.delete(model.id);
        if (this.transport.exists(final)) this.transport.remove(final);
        this.transport.move(part, final);
        const size = this.transport.size(final);
        this.onState(model.id, {
          status: 'downloaded',
          bytesWritten: size,
          totalBytes: size,
          error: null,
          resumeState: null,
          autoResume: false,
        });
      } finally {
        clearInterval(beat);
      }
    } catch (e) {
      if (this.tasks.get(model.id) !== task) return; // cancelled: not an error
      this.tasks.delete(model.id);
      this.onState(model.id, {
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        resumeState: null,
        autoResume: false,
      });
    } finally {
      this.disarmWatchdog(model.id);
    }
  }

  /** Starts a fresh download. Throws InsufficientDiskError when storage is short. */
  start(model: ModelInfo): Promise<void> {
    if (this.tasks.has(model.id)) return Promise.resolve();
    const free = this.transport.freeDiskBytes();
    if (!hasDiskSpace(model.sizeBytes, free)) {
      throw new InsufficientDiskError(model.sizeBytes, free ?? 0);
    }
    const part = this.transport.partialPath(model.fileName);
    if (this.transport.exists(part)) this.transport.remove(part);
    this.onState(model.id, { bytesWritten: 0, totalBytes: model.sizeBytes, resumeState: null, autoResume: false });
    const task = this.transport.createTask(model.url, part, this.progress(model.id, model.sizeBytes));
    return this.run(model, task, 'start');
  }

  async pause(modelId: string): Promise<void> {
    const task = this.tasks.get(modelId);
    if (!task) return;
    this.disarmWatchdog(modelId);
    let resumeState: unknown | null = null;
    try {
      resumeState = await task.pause();
    } catch (e) {
      // Pause failed (e.g. the platform pauseAsync rejects). Stop the transfer for real
      // so it does not keep downloading behind a stuck "downloading" state.
      if (this.tasks.get(modelId) !== task) return; // cancel()/another flow handled it
      task.cancel();
      this.tasks.delete(modelId);
      this.onState(modelId, { status: 'error', error: e instanceof Error ? e.message : String(e), resumeState: null, autoResume: false });
      return;
    }
    this.tasks.delete(modelId);
    // A deliberate pause stays paused: the user decides when it continues.
    this.onState(modelId, { status: 'paused', resumeState: resumeState ?? null, autoResume: false });
  }

  /** Compares the downloaded file's SHA-256 with the expected hash; throws on mismatch. */
  private async verifyHash(partPath: string, expected: string): Promise<void> {
    const actual = await this.transport.hashFile(partPath);
    if (!actual) return; // hashing unsupported on this transport: skip verification
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      // Corrupted or tampered download: drop the partial file and refuse the model.
      try {
        this.transport.remove(partPath);
      } catch {
        // best effort
      }
      throw new Error('SHA256_MISMATCH');
    }
  }

  /** Resumes from saved state; falls back to a fresh start when no state is available. */
  resume(model: ModelInfo, resumeState: unknown | null): Promise<void> {
    if (this.tasks.has(model.id)) return Promise.resolve();
    if (!resumeState) return this.start(model);
    const task = this.transport.createTask(
      model.url,
      this.transport.partialPath(model.fileName),
      this.progress(model.id, model.sizeBytes),
      resumeState,
    );
    return this.run(model, task, 'resume');
  }

  cancel(model: ModelInfo): void {
    const task = this.tasks.get(model.id);
    this.tasks.delete(model.id);
    this.disarmWatchdog(model.id);
    task?.cancel();
    const part = this.transport.partialPath(model.fileName);
    try {
      if (this.transport.exists(part)) this.transport.remove(part);
    } catch {
      // best effort
    }
    this.onState(model.id, { status: 'idle', bytesWritten: 0, error: null, resumeState: null, autoResume: false });
  }

  deleteFile(model: ModelInfo): void {
    this.cancel(model);
    const final = this.transport.finalPath(model.fileName);
    if (this.transport.exists(final)) this.transport.remove(final);
    this.onState(model.id, { status: 'idle', bytesWritten: 0, totalBytes: model.sizeBytes, autoResume: false });
  }
}
