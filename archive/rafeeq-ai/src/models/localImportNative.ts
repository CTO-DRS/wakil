// Copyright (c) 2026 DRS AI. All rights reserved.
import { File, FileMode } from 'expo-file-system';

import { currentModelsDir } from './expoTransport';
import { Sha256 } from './sha256';

/** Bytes read per FileHandle.readBytes call while hashing (bridge crossings kept low). */
const HASH_CHUNK_BYTES = 1 << 20; // 1 MiB

/**
 * Copies a picked document (a content:// URI on Android, file:// elsewhere)
 * into the models dir and returns the final file path. The copy lands in a
 * ".part" staging file first, so a half-copied file can never look like a
 * real model, and is moved into place only when complete.
 * Throws when the source is unreadable or the copy fails (e.g. disk full).
 */
export async function copyPickedIntoModelsDir(sourceUri: string, targetFileName: string): Promise<string> {
  const dir = currentModelsDir();
  const part = new File(dir, `${targetFileName}.part`);
  if (part.exists) part.delete();
  const final = new File(dir, targetFileName);
  if (final.exists) final.delete(); // defensive: the caller plans a unique name

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { copyAsync } = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  // The legacy surface still owns cross-provider copies (content:// → file://).
  await copyAsync({ from: sourceUri, to: part.uri });

  if (!part.exists || part.size <= 0) throw new Error('EMPTY_COPY');
  part.moveSync(final);
  return final.uri;
}

/** Streams the imported file through SHA-256; null when hashing is not possible. */
export async function hashImportedModel(path: string): Promise<string | null> {
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
