// Copyright (c) 2026 DRS AI. All rights reserved.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { encodeStatsCardPng, statsCardFileName, type StatsCardSummary } from './statsCard';

/**
 * Renders a share card and hands it to the system share sheet. The IO steps
 * (writing bytes, opening the sheet) are injectable so tests can run the whole
 * flow without native modules.
 */
/** Injectable share-sheet IO (named after the original card module). */
export type ShareCardIO = {
  writeFile?: (name: string, bytes: Uint8Array) => Promise<string>;
  share?: (uri: string) => Promise<boolean>;
  now?: () => number;
};

async function defaultWriteFile(name: string, bytes: Uint8Array): Promise<string> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  return file.uri;
}

async function defaultShare(uri: string): Promise<boolean> {
  try {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Rafeeq AI' });
    return true;
  } catch {
    return false;
  }
}

/** The shared render → write → share flow every card goes through. */
export async function shareCardPng(name: string, bytes: Uint8Array, io: ShareCardIO = {}): Promise<boolean> {
  const writeFile = io.writeFile ?? defaultWriteFile;
  const share = io.share ?? defaultShare;
  try {
    const uri = await writeFile(name, bytes);
    return await share(uri);
  } catch {
    return false;
  }
}

/** Renders + writes + shares the score card; resolves false when any step gives up. */
export async function shareStatsCard(summary: StatsCardSummary, io: ShareCardIO = {}): Promise<boolean> {
  try {
    const bytes = encodeStatsCardPng(summary);
    const now = io.now ?? Date.now;
    return await shareCardPng(statsCardFileName(now()), bytes, io);
  } catch {
    return false;
  }
}
