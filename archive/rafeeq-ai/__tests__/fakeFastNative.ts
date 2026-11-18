// Copyright (c) 2026 DRS AI. All rights reserved.
import type { FastNative, FastSidecar, ProbeResult, SegmentRequest, SegmentResult, SidecarStore } from '../src/models/fastdl/types';

type Running = {
  req: SegmentRequest;
  pos: number;
  end: number;
  resolve: (r: SegmentResult) => void;
  reject: (e: unknown) => void;
};

/** Controllable stand-in for the Kotlin module: ranges advance only when told to. */
export class FakeFastNative implements FastNative {
  probeResult: ProbeResult = { finalUrl: 'https://cdn.example/signed?1', totalBytes: 0, acceptRanges: true };
  probeError: Error | null = null;
  probes: string[] = [];
  preallocated: { path: string; size: number }[] = [];
  requests: SegmentRequest[] = [];
  running: Running[] = [];
  stopped: string[] = [];
  private listeners = new Set<(taskId: string, positions: { id: number; pos: number }[]) => void>();

  async probe(url: string) {
    this.probes.push(url);
    if (this.probeError) throw this.probeError;
    return { ...this.probeResult };
  }
  async preallocate(path: string, size: number) {
    this.preallocated.push({ path, size });
  }
  runSegment(req: SegmentRequest): Promise<SegmentResult> {
    this.requests.push(req);
    return new Promise((resolve, reject) => {
      this.running.push({ req, pos: req.pos, end: req.end, resolve, reject });
    });
  }
  setSegmentEnd(taskId: string, id: number, newEnd: number) {
    const r = this.find(id, taskId);
    if (!r || r.end < 0 || newEnd <= r.pos || newEnd >= r.end) return false;
    r.end = newEnd;
    return true;
  }
  stopTask(taskId: string) {
    this.stopped.push(taskId);
    for (const r of this.running.filter((x) => x.req.taskId === taskId)) {
      this.drop(r);
      r.resolve({ completed: false, pos: r.pos });
    }
  }
  addProgressListener(l: (taskId: string, positions: { id: number; pos: number }[]) => void) {
    this.listeners.add(l);
    return { remove: () => this.listeners.delete(l) };
  }

  get listenerCount() {
    return this.listeners.size;
  }
  find(id: number, taskId?: string): Running | undefined {
    return this.running.find((r) => r.req.segmentId === id && (taskId === undefined || r.req.taskId === taskId));
  }
  ids(): number[] {
    return this.running.map((r) => r.req.segmentId).sort((a, b) => a - b);
  }
  private drop(r: Running) {
    this.running = this.running.filter((x) => x !== r);
  }
  /** Moves a range forward and emits a progress event for its task. */
  advance(id: number, bytes: number) {
    const r = this.find(id)!;
    r.pos = r.end >= 0 ? Math.min(r.end, r.pos + bytes) : r.pos + bytes;
    this.emit(r.req.taskId);
  }
  emit(taskId: string) {
    const positions = this.running.filter((x) => x.req.taskId === taskId).map((x) => ({ id: x.req.segmentId, pos: x.pos }));
    for (const l of this.listeners) l(taskId, positions);
  }
  /** Completes a range (to its end, or at `eofPos` for open-ended ranges). */
  finish(id: number, eofPos?: number) {
    const r = this.find(id)!;
    this.drop(r);
    r.pos = r.end >= 0 ? r.end : (eofPos ?? r.pos);
    r.resolve({ completed: true, pos: r.pos });
  }
  fail(id: number, code: string) {
    const r = this.find(id)!;
    this.drop(r);
    r.reject(new Error(code));
  }
}

export class MemorySidecars implements SidecarStore {
  files = new Map<string, FastSidecar>();
  writes = 0;
  read(path: string) {
    const v = this.files.get(path);
    return v ? (JSON.parse(JSON.stringify(v)) as FastSidecar) : null;
  }
  write(path: string, data: FastSidecar) {
    this.writes += 1;
    this.files.set(path, JSON.parse(JSON.stringify(data)) as FastSidecar);
  }
  remove(path: string) {
    this.files.delete(path);
  }
}

export const tick = () => new Promise<void>((r) => setImmediate(r));
