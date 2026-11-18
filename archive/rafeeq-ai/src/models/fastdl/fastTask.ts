// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ProgressFn, TransferTask } from '../downloadManager';
import {
  allDone,
  applySplit,
  bytesDone,
  clampConnections,
  cloneSegments,
  isSegmentDone,
  isValidPlan,
  pickSteal,
  planSegments,
  updatePos,
  type Segment,
} from './segments';
import { isFastSidecar, type FastNative, type FastSidecar, type KeepAlive, type SegmentResult, type SidecarStore } from './types';

export type FastTaskOptions = {
  native: FastNative;
  sidecars: SidecarStore;
  keepAlive?: KeepAlive | null;
  url: string;
  /** The .part file the ranges are written into. */
  dest: string;
  sidecarPath: string;
  connections: number;
  onProgress: ProgressFn;
  /** Size of a file on disk (0 when missing): a resume needs the preallocated .part. */
  fileSize: (path: string) => number;
  resumeState?: unknown;
  title?: string;
  now?: () => number;
  /** Retries per range inside the native worker (with backoff). */
  maxRetries?: number;
  /** How many times an expired/forbidden CDN URL is re-resolved before failing. */
  maxUrlRefreshes?: number;
  sidecarIntervalMs?: number;
};

type Phase = 'idle' | 'preparing' | 'running' | 'paused' | 'cancelled' | 'done' | 'failed';

const URL_EXPIRED = /^HTTP_(401|403|410)$/;
let taskSeq = 0;

function errorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = /(HTTP_\d{3}|RANGE_IGNORED|IO_ERROR|NETWORK_ERROR)/.exec(msg);
  return m ? m[1] : msg || 'DOWNLOAD_FAILED';
}

/**
 * Multi-connection transfer: probes the URL (following redirects), plans N byte
 * ranges, runs them in parallel through the native module, splits the largest
 * remaining range whenever a connection frees up, and persists the plan to a JSON
 * sidecar so pause, resume and resume-after-app-kill continue where they stopped.
 */
export class FastTransferTask implements TransferTask {
  private phase: Phase = 'idle';
  private segments: Segment[] = [];
  private total = 0;
  private ranged = true;
  private finalUrl: string;
  private readonly baseId = `fdl-${Date.now().toString(36)}-${(taskSeq = (taskSeq + 1) % 1e6)}`;
  private generation = 0;
  private running = new Map<number, Promise<void>>();
  private finish: { resolve: (v: boolean) => void; reject: (e: unknown) => void } | null = null;
  private sub: { remove(): void } | null = null;
  private refreshes = 0;
  private refreshing = false;
  private restarting = false;
  private lastPersist = 0;
  private lastKeepAlive = 0;
  private readonly connections: number;
  private readonly now: () => number;

  constructor(private readonly o: FastTaskOptions) {
    this.finalUrl = o.url;
    this.connections = clampConnections(o.connections);
    this.now = o.now ?? Date.now;
  }

  private get taskId(): string {
    return `${this.baseId}-${this.generation}`;
  }

  /** Current plan, for tests and diagnostics. */
  get plan(): Segment[] {
    return cloneSegments(this.segments);
  }

  snapshot(): FastSidecar {
    return {
      kind: 'fastdl',
      v: 1,
      url: this.o.url,
      finalUrl: this.finalUrl,
      total: this.total,
      ranged: this.ranged,
      segments: cloneSegments(this.segments),
    };
  }

  async start(): Promise<boolean> {
    this.phase = 'preparing';
    try {
      this.o.sidecars.remove(this.o.sidecarPath);
    } catch {
      // best effort
    }
    const probe = await this.o.native.probe(this.o.url);
    if (this.phase !== 'preparing') return false;
    this.finalUrl = probe.finalUrl || this.o.url;
    this.total = probe.totalBytes > 0 ? probe.totalBytes : 0;
    this.ranged = probe.acceptRanges && this.total > 0;
    // Without range support the file is fetched as one plain stream until EOF.
    this.segments = this.ranged ? planSegments(this.total, this.connections) : [{ id: 0, start: 0, end: -1, pos: 0 }];
    await this.o.native.preallocate(this.o.dest, this.total > 0 ? this.total : -1);
    if (this.phase !== 'preparing') return false;
    this.persist();
    return this.run();
  }

  async resume(): Promise<boolean> {
    const saved = this.loadSaved();
    if (!saved || !saved.ranged || !isValidPlan(saved.segments, saved.total) || this.o.fileSize(this.o.dest) !== saved.total) {
      // Nothing trustworthy to continue from (or a single-connection transfer, which
      // cannot be resumed byte-exactly): start over.
      return this.start();
    }
    this.phase = 'preparing';
    this.total = saved.total;
    this.ranged = true;
    this.finalUrl = saved.finalUrl || this.o.url;
    this.segments = cloneSegments(saved.segments);
    // Signed CDN URLs expire: re-resolve from the original URL, keep the old one if offline.
    try {
      const probe = await this.o.native.probe(this.o.url);
      if (probe.totalBytes > 0 && probe.totalBytes !== saved.total) {
        // The file changed upstream; the partial bytes are useless.
        return this.start();
      }
      if (probe.finalUrl) this.finalUrl = probe.finalUrl;
    } catch {
      // keep saved finalUrl
    }
    if (this.phase !== 'preparing') return false;
    if (allDone(this.segments)) {
      this.phase = 'done';
      this.cleanupSidecar();
      return true;
    }
    return this.run();
  }

  private loadSaved(): FastSidecar | null {
    let fromDisk: FastSidecar | null = null;
    try {
      fromDisk = this.o.sidecars.read(this.o.sidecarPath);
    } catch {
      fromDisk = null;
    }
    // The sidecar on disk is written while downloading, so it is at least as new as the
    // state captured at pause time; fall back to the latter if the file is gone.
    if (isFastSidecar(fromDisk) && fromDisk.url === this.o.url) return fromDisk;
    const rs = this.o.resumeState;
    if (isFastSidecar(rs) && rs.url === this.o.url) return rs;
    return null;
  }

  private run(): Promise<boolean> {
    this.phase = 'running';
    this.sub = this.o.native.addProgressListener((id, positions) => {
      if (id !== this.taskId || this.phase !== 'running') return;
      for (const p of positions) updatePos(this.segments, p.id, p.pos);
      this.report();
    });
    try {
      this.o.keepAlive?.start(this.baseId, this.o.title ?? '');
    } catch {
      // keep-alive is optional
    }
    return new Promise<boolean>((resolve, reject) => {
      this.finish = { resolve, reject };
      this.report(true);
      this.schedule();
    });
  }

  /** Starts idle ranges, then steals work from the biggest running range. */
  private schedule(): void {
    if (this.phase !== 'running' || this.refreshing || this.restarting) return;
    if (allDone(this.segments)) {
      this.complete();
      return;
    }
    const limit = this.ranged ? this.connections : 1;
    for (const s of this.segments) {
      if (this.running.size >= limit) break;
      if (!isSegmentDone(s) && !this.running.has(s.id)) this.launch(s);
    }
    while (this.ranged && this.running.size < limit) {
      const steal = pickSteal(this.segments, this.running.keys());
      if (!steal) break;
      let accepted = false;
      try {
        accepted = this.o.native.setSegmentEnd(this.taskId, steal.victimId, steal.splitAt);
      } catch {
        accepted = false;
      }
      if (!accepted) break;
      const created = applySplit(this.segments, steal.victimId, steal.splitAt);
      if (!created) break;
      this.launch(created);
      this.persist();
    }
  }

  private launch(s: Segment): void {
    const gen = this.generation;
    const p = this.o.native
      .runSegment({
        taskId: this.taskId,
        segmentId: s.id,
        url: this.finalUrl,
        path: this.o.dest,
        start: s.start,
        pos: s.pos,
        end: s.end,
        maxRetries: this.o.maxRetries ?? 5,
      })
      .then(
        (res) => this.onSegmentEnd(gen, s.id, res),
        (err) => this.onSegmentError(gen, s.id, err),
      );
    this.running.set(s.id, p);
  }

  private onSegmentEnd(gen: number, id: number, res: SegmentResult): void {
    if (gen !== this.generation) return;
    this.running.delete(id);
    const seg = this.segments.find((s) => s.id === id);
    if (seg) updatePos(this.segments, id, res.pos);
    if (this.phase !== 'running') return;
    if (!res.completed) {
      // Stopped without being asked to (native side shut down): treat as an error.
      this.fail('STOPPED');
      return;
    }
    if (seg) {
      if (seg.end < 0) {
        if (this.total > 0 && res.pos !== this.total) {
          this.fail('SHORT_READ');
          return;
        }
        seg.end = res.pos;
        seg.pos = res.pos;
        this.total = res.pos;
      } else {
        seg.pos = seg.end;
      }
    }
    this.persist();
    this.report();
    this.schedule();
  }

  private onSegmentError(gen: number, id: number, err: unknown): void {
    if (gen !== this.generation) return;
    this.running.delete(id);
    if (this.phase !== 'running') return;
    const code = errorCode(err);
    if (URL_EXPIRED.test(code) && this.refreshes < (this.o.maxUrlRefreshes ?? 3)) {
      this.refreshUrl();
      return;
    }
    if (code === 'RANGE_IGNORED' && this.ranged) {
      void this.fallbackToSingle();
      return;
    }
    this.fail(code);
  }

  /** The CDN URL expired or was refused: re-resolve from the original URL. */
  private refreshUrl(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    this.refreshes += 1;
    const tried = this.finalUrl;
    this.o.native
      .probe(this.o.url)
      .then(
        (p) => {
          // Same URL again would fail the same way: go through the original redirect.
          this.finalUrl = p.finalUrl && p.finalUrl !== tried ? p.finalUrl : this.o.url;
        },
        () => {
          this.finalUrl = this.o.url;
        },
      )
      .finally(() => {
        this.refreshing = false;
        this.schedule();
      });
  }

  /** The server stopped honouring ranges: drop the plan and fetch it in one stream. */
  private async fallbackToSingle(): Promise<void> {
    this.restarting = true;
    const old = this.taskId;
    this.generation += 1;
    try {
      this.o.native.stopTask(old);
    } catch {
      // ignore
    }
    const pending = [...this.running.values()];
    this.running.clear();
    await Promise.allSettled(pending);
    if (this.phase !== 'running') return;
    this.ranged = false;
    this.segments = [{ id: 0, start: 0, end: -1, pos: 0 }];
    this.persist();
    this.restarting = false;
    this.report(true);
    this.schedule();
  }

  private report(force = false): void {
    const written = bytesDone(this.segments);
    this.o.onProgress(written, this.total > 0 ? this.total : 0);
    const t = this.now();
    if (force || t - this.lastPersist >= (this.o.sidecarIntervalMs ?? 2000)) this.persist();
    if (this.o.keepAlive && (force || t - this.lastKeepAlive >= 1000)) {
      this.lastKeepAlive = t;
      const pct = this.total > 0 ? Math.floor((written / this.total) * 100) : -1;
      try {
        this.o.keepAlive.update(this.baseId, this.o.title ?? '', pct);
      } catch {
        // optional
      }
    }
  }

  private persist(): void {
    this.lastPersist = this.now();
    if (!this.ranged) return; // single-connection transfers restart from 0 anyway
    try {
      this.o.sidecars.write(this.o.sidecarPath, this.snapshot());
    } catch {
      // best effort: a missing sidecar only costs a restart
    }
  }

  private cleanupSidecar(): void {
    try {
      this.o.sidecars.remove(this.o.sidecarPath);
    } catch {
      // ignore
    }
  }

  private teardown(): void {
    this.sub?.remove();
    this.sub = null;
    try {
      this.o.keepAlive?.stop(this.baseId);
    } catch {
      // optional
    }
  }

  private complete(): void {
    this.phase = 'done';
    this.teardown();
    this.cleanupSidecar();
    this.o.onProgress(this.total, this.total);
    this.finish?.resolve(true);
    this.finish = null;
  }

  private fail(code: string): void {
    this.phase = 'failed';
    try {
      this.o.native.stopTask(this.taskId);
    } catch {
      // ignore
    }
    this.persist();
    this.teardown();
    this.finish?.reject(new Error(code));
    this.finish = null;
  }

  async pause(): Promise<unknown | null> {
    if (this.phase === 'preparing' || this.phase === 'idle') {
      this.phase = 'paused';
      this.teardown();
      return null;
    }
    if (this.phase !== 'running') return this.ranged ? this.snapshot() : null;
    this.phase = 'paused';
    try {
      this.o.native.stopTask(this.taskId);
    } catch {
      // ignore
    }
    const pending = [...this.running.values()];
    await Promise.allSettled(pending);
    this.running.clear();
    this.persist();
    this.teardown();
    this.finish?.resolve(false);
    this.finish = null;
    return this.ranged ? this.snapshot() : null;
  }

  cancel(): void {
    const wasRunning = this.phase === 'running';
    this.phase = 'cancelled';
    try {
      this.o.native.stopTask(this.taskId);
    } catch {
      // ignore
    }
    this.running.clear();
    this.teardown();
    this.cleanupSidecar();
    if (wasRunning) this.finish?.reject(new Error('cancelled'));
    this.finish = null;
  }
}
