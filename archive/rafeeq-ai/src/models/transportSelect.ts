// Copyright (c) 2026 DRS AI. All rights reserved.
import type { DownloadTransport, ProgressFn, TransferTask } from './downloadManager';
import { isFastSidecar } from './fastdl/types';

export type TransportKind = 'fast' | 'expo';

/**
 * Which transport runs a transfer. A saved resume state always goes back to the
 * transport that produced it (a fast plan with fast, an expo pause state with expo);
 * a fresh download uses fast when the setting is on and the native module exists.
 */
export function chooseTransport(opts: { fastEnabled: boolean; fastAvailable: boolean; resumeState?: unknown }): TransportKind {
  const { fastEnabled, fastAvailable, resumeState } = opts;
  if (resumeState) {
    if (isFastSidecar(resumeState)) return fastAvailable ? 'fast' : 'expo';
    return 'expo';
  }
  return fastEnabled && fastAvailable ? 'fast' : 'expo';
}

/** Sidecar JSON kept next to a .part file. */
export function sidecarPathFor(partPath: string): string {
  return `${partPath}.json`;
}

export type FastTaskFactory = (url: string, dest: string, onProgress: ProgressFn, resumeState?: unknown) => TransferTask;

/**
 * A DownloadTransport that keeps the base transport's file layout and file ops but
 * routes each transfer to the fast (multi-connection) or base (expo) engine.
 */
export function createAdaptiveTransport(opts: {
  base: DownloadTransport;
  fast: FastTaskFactory | null;
  fastEnabled: () => boolean;
  /** Reads a fast sidecar (null when absent/invalid). */
  readSidecar?: (path: string) => unknown | null;
}): DownloadTransport {
  const { base, fast, fastEnabled, readSidecar } = opts;
  const removeSidecar = (partPath: string) => {
    const sc = sidecarPathFor(partPath);
    try {
      if (base.exists(sc)) base.remove(sc);
    } catch {
      // best effort
    }
  };
  return {
    finalPath: (n) => base.finalPath(n),
    partialPath: (n) => base.partialPath(n),
    createTask: (url, dest, onProgress, resumeState) => {
      const kind = chooseTransport({ fastEnabled: fastEnabled(), fastAvailable: !!fast, resumeState });
      if (kind === 'fast' && fast) return fast(url, dest, onProgress, resumeState);
      if (!resumeState) removeSidecar(dest); // a fresh expo download makes any fast plan stale
      return base.createTask(url, dest, onProgress, isFastSidecar(resumeState) ? undefined : resumeState);
    },
    exists: (p) => base.exists(p),
    size: (p) => base.size(p),
    move: (from, to) => {
      base.move(from, to);
      removeSidecar(from);
    },
    remove: (p) => {
      base.remove(p);
      if (p.endsWith('.part')) removeSidecar(p);
    },
    freeDiskBytes: () => base.freeDiskBytes(),
    hashFile: (p) => base.hashFile(p),
    recoverResumeState: (fileName) => {
      if (!fast || !readSidecar) return null;
      const part = base.partialPath(fileName);
      const state = readSidecar(sidecarPathFor(part));
      if (!isFastSidecar(state) || !state.ranged) return null;
      if (!base.exists(part) || base.size(part) !== state.total) return null;
      return state;
    },
  };
}
