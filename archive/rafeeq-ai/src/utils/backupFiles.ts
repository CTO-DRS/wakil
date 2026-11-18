// Copyright (c) 2026 DRS AI. All rights reserved.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Regular backups and the full export write differently named files. */
export type BackupVariant = 'backup' | 'full';

/** Human-friendly, sortable backup file name, e.g. rafeeq-backup-20260105-0930.json. */
export function backupFileName(exportedAt: number, variant: BackupVariant = 'backup'): string {
  const d = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stem = variant === 'full' ? 'rafeeq-full-backup' : 'rafeeq-backup';
  return `${stem}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/** Writes the backup JSON into the cache directory and returns its file URI. */
export async function writeBackupFile(
  json: string,
  exportedAt = Date.now(),
  variant: BackupVariant = 'backup',
): Promise<string> {
  const file = new File(Paths.cache, backupFileName(exportedAt, variant));
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
  return file.uri;
}

/** Opens the system share sheet for the backup file. Resolves false on failure. */
export async function shareBackupFile(uri: string): Promise<boolean> {
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Rafeeq AI backup' });
    return true;
  } catch {
    return false;
  }
}

/** Opens the system file picker and returns the chosen file's text (null on cancel or failure). */
export async function readPickedBackup(): Promise<string | null> {
  try {
    const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
    if (picked.canceled || !picked.result) return null;
    return await picked.result.text();
  } catch {
    return null;
  }
}
