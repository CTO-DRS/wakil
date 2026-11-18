// Copyright (c) 2026 DRS AI. All rights reserved.
import { Directory, DownloadTask, File, FileMode, Paths, type DownloadPauseState } from 'expo-file-system';

import type { DownloadTransport, ProgressFn, TransferTask } from './downloadManager';
import { Sha256 } from './sha256';

/** Bytes read per FileHandle.readBytes call while hashing (bridge crossings kept low). */
const HASH_CHUNK_BYTES = 1 << 20; // 1 MiB

/** The default (internal) models root — also the migration source. */
export const DEFAULT_MODELS_ROOT_URI = new Directory(Paths.document, 'models').uri;

/**
 * Active-root override: when "All files access" is granted and the setting is
 * on, model files live in the shared Download/Rafeeq folder and survive
 * updates, uninstall and device cleaners. Null restores the internal root.
 */
let overrideRootUri: string | null = null;

export function setModelsRootOverride(uri: string | null): void {
  overrideRootUri = uri;
}

/** The active models directory (override or default), created on demand. */
export function currentModelsDir(): Directory {
  const dir = new Directory(overrideRootUri ?? DEFAULT_MODELS_ROOT_URI);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function modelsDir(): Directory {
  return currentModelsDir();
}

/** Streams a file through SHA-256 in chunks; returns null when hashing is not possible. */
async function hashOnDisk(path: string): Promise<string | null> {
  try {
    const file = new File(path);
    if (!file.exists) return null;
    const handle = file.open(FileMode.ReadOnly);
    try {
      const hasher = new Sha256();
      for (;;) {
        const chunk = await handle.readBytes(HASH_CHUNK_BYTES);
        if (chunk.length === 0) break;
        hasher.update(chunk);
      }
      return hasher.digestHex();
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}

class ExpoTransferTask implements TransferTask {
  private task: DownloadTask;

  constructor(url: string, dest: File, onProgress: ProgressFn, resumeState?: unknown) {
    const options = {
      onProgress: (p: { bytesWritten: number; totalBytes: number }) => onProgress(p.bytesWritten, p.totalBytes),
    };
    this.task = resumeState
      ? DownloadTask.fromSavable(resumeState as DownloadPauseState, options)
      : new DownloadTask(url, dest, options);
  }

  async start(): Promise<boolean> {
    return (await this.task.downloadAsync()) !== null;
  }

  async resume(): Promise<boolean> {
    return (await this.task.resumeAsync()) !== null;
  }

  async pause(): Promise<unknown | null> {
    await this.task.pauseAsync();
    try {
      return this.task.savable();
    } catch {
      return null;
    }
  }

  cancel(): void {
    this.task.cancel();
  }
}

/** Download transport backed by expo-file-system (models live in <documents>/models). */
export const expoTransport: DownloadTransport = {
  finalPath: (fileName) => new File(modelsDir(), fileName).uri,
  partialPath: (fileName) => new File(modelsDir(), `${fileName}.part`).uri,
  createTask: (url, destPath, onProgress, resumeState) =>
    new ExpoTransferTask(url, new File(destPath), onProgress, resumeState),
  exists: (path) => new File(path).exists,
  size: (path) => {
    const f = new File(path);
    return f.exists ? f.size : 0;
  },
  move: (from, to) => {
    new File(from).moveSync(new File(to));
  },
  remove: (path) => {
    const f = new File(path);
    if (f.exists) f.delete();
  },
  freeDiskBytes: () => {
    try {
      return Paths.availableDiskSpace;
    } catch {
      return null;
    }
  },
  hashFile: (path) => hashOnDisk(path),
};
