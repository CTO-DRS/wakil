// Copyright (c) 2026 DRS AI. All rights reserved.
import type { Segment } from './segments';

export type ProbeResult = {
  /** URL after following redirects (e.g. the CDN a Hugging Face resolve URL points at). */
  finalUrl: string;
  /** Content length in bytes, or -1 when the server does not say. */
  totalBytes: number;
  /** The server honoured a byte-range request (206 with Content-Range). */
  acceptRanges: boolean;
};

export type SegmentResult = {
  /** True when the range reached its end (or EOF for open-ended ranges). */
  completed: boolean;
  /** Next byte to write when it stopped. */
  pos: number;
};

export type SegmentRequest = {
  taskId: string;
  segmentId: number;
  url: string;
  path: string;
  start: number;
  pos: number;
  /** Exclusive end, or -1 for "until EOF" (no Range header). */
  end: number;
  maxRetries: number;
};

/**
 * Byte-moving primitives implemented natively (Kotlin). Everything else (planning,
 * stealing, resume, URL refresh) is decided in TypeScript.
 */
export interface FastNative {
  probe(url: string): Promise<ProbeResult>;
  /** Creates or resizes the file to `size` bytes (keeps existing content). size < 0 truncates to 0. */
  preallocate(path: string, size: number): Promise<void>;
  /**
   * Downloads one range straight into the file at its offsets. Retries transient
   * failures with backoff on its own; rejects with an Error whose message is a code
   * such as `HTTP_403`, `HTTP_404`, `RANGE_IGNORED`, `IO_ERROR`. Resolves with
   * completed=false when stopped via stopTask().
   */
  runSegment(req: SegmentRequest): Promise<SegmentResult>;
  /** Shrinks a running range's end. Returns false if it already wrote past `newEnd`. */
  setSegmentEnd(taskId: string, segmentId: number, newEnd: number): boolean;
  /** Stops every running range of a task. */
  stopTask(taskId: string): void;
  /** Throttled (~4/s) per-range positions for a task. */
  addProgressListener(listener: (taskId: string, positions: { id: number; pos: number }[]) => void): { remove(): void };
}

/** Optional keep-alive (Android foreground service with a progress notification). */
export interface KeepAlive {
  start(taskId: string, title: string): void;
  update(taskId: string, title: string, percent: number): void;
  stop(taskId: string): void;
}

/** What is saved next to the .part file (and in the store's resumeState). */
export type FastSidecar = {
  kind: 'fastdl';
  v: 1;
  url: string;
  finalUrl: string;
  total: number;
  /** false = single-connection mode (server without ranges or unknown length). */
  ranged: boolean;
  segments: Segment[];
};

export interface SidecarStore {
  read(path: string): FastSidecar | null;
  write(path: string, data: FastSidecar): void;
  remove(path: string): void;
}

export function isFastSidecar(v: unknown): v is FastSidecar {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<FastSidecar>;
  return o.kind === 'fastdl' && o.v === 1 && typeof o.url === 'string' && typeof o.total === 'number' && Array.isArray(o.segments);
}
