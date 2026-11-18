// Copyright (c) 2026 DRS AI. All rights reserved.

/** Hard cap for a folder name; longer input is clamped, never rejected. */
export const MAX_FOLDER_NAME = 24;

/**
 * Cleans free user input into a folder name: whitespace collapsed, clamped to
 * the cap, and empty input becomes null — the "no folder" marker. Pure so the
 * store, the backup parser and the UI all share one definition of a valid name.
 */
export function normalizeFolderName(raw: string): string | null {
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME);
  return clean || null;
}

/** A conversation shape the lister needs; everything else is irrelevant here. */
type Foldered = { folder?: string | null };

/**
 * Unique folder names in use, alphabetically sorted. Null/empty folders (the
 * default "no folder" state) never produce an entry.
 */
export function listFolderNames(conversations: readonly Foldered[]): string[] {
  const names = new Set<string>();
  for (const c of conversations) {
    const name = normalizeFolderName(c.folder ?? '');
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
