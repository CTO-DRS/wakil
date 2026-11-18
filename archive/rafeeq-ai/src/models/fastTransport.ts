// Copyright (c) 2026 DRS AI. All rights reserved.
import { File } from 'expo-file-system';

import { RafeeqFastDl } from '../../modules/rafeeq-fastdl';
import type { DownloadTransport } from './downloadManager';
import { expoTransport } from './expoTransport';
import { FastTransferTask } from './fastdl/fastTask';
import { isFastSidecar, type FastNative, type FastSidecar, type KeepAlive, type SidecarStore } from './fastdl/types';
import { createAdaptiveTransport, sidecarPathFor } from './transportSelect';

/** JSON sidecar persistence through expo-file-system. */
export const fileSidecars: SidecarStore = {
  read(path) {
    try {
      const f = new File(path);
      if (!f.exists) return null;
      const parsed: unknown = JSON.parse(f.textSync());
      return isFastSidecar(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  write(path, data: FastSidecar) {
    const f = new File(path);
    if (!f.exists) f.create({ overwrite: true });
    f.writeSync(JSON.stringify(data));
  },
  remove(path) {
    const f = new File(path);
    if (f.exists) f.delete();
  },
};

function nativeAdapter(): FastNative | null {
  const n = RafeeqFastDl;
  if (!n) return null;
  return {
    probe: (url) => n.probe(url),
    preallocate: (path, size) => n.preallocate(path, size),
    runSegment: (req) => n.runSegment(req),
    setSegmentEnd: (taskId, id, end) => n.setSegmentEnd(taskId, id, end),
    stopTask: (taskId) => n.stopTask(taskId),
    addProgressListener: (listener) => {
      const sub = n.addListener('onProgress', (e) => listener(e.taskId, e.positions));
      return { remove: () => sub.remove() };
    },
  };
}

function keepAliveAdapter(): KeepAlive | null {
  const n = RafeeqFastDl;
  if (!n) return null;
  let asked = false;
  return {
    start: (key, title) => {
      if (!asked) {
        asked = true;
        // Android 13+: without the permission the service still runs, just silently.
        n.requestNotificationPermission().catch(() => {});
      }
      n.startKeepAlive(key, title);
    },
    update: (key, title, pct) => n.updateKeepAlive(key, title, pct),
    stop: (key) => n.stopKeepAlive(key),
  };
}

export type FastTransportConfig = {
  fastEnabled: () => boolean;
  connections: () => number;
  /** Notification title for the keep-alive service. */
  title: () => string;
};

/** True when the native fast-download module is linked into this build. */
export function isFastDownloadAvailable(): boolean {
  return RafeeqFastDl !== null;
}

/**
 * The app's download transport: expo-file-system file layout, with transfers routed
 * to the multi-connection engine when enabled and available, otherwise to expo.
 */
export function createAppTransport(cfg: FastTransportConfig): DownloadTransport {
  const native = nativeAdapter();
  const keepAlive = keepAliveAdapter();
  return createAdaptiveTransport({
    base: expoTransport,
    fastEnabled: cfg.fastEnabled,
    readSidecar: (p) => fileSidecars.read(p),
    fast: native
      ? (url, dest, onProgress, resumeState) =>
          new FastTransferTask({
            native,
            sidecars: fileSidecars,
            keepAlive,
            url,
            dest,
            sidecarPath: sidecarPathFor(dest),
            connections: cfg.connections(),
            onProgress,
            fileSize: (p) => expoTransport.size(p),
            resumeState,
            title: cfg.title(),
          })
      : null,
  });
}
