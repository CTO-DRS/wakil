// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Temporary-trash rules: a deleted conversation is hidden (never listed,
 * searched, counted or backed up) but keeps its messages for a grace period so
 * "delete" stays reversible. Once the retention window passes the row is purged
 * for good, on the next app start.
 */

/** How long a soft-deleted conversation survives before the next purge. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Same window in whole days, for the localized hint text. */
export const TRASH_RETENTION_DAYS = 30;

/** How long the undo pill stays on screen after a deletion. */
export const UNDO_TOAST_MS = 6000;

/** True when a soft-deleted conversation is past its grace period. */
export function isTrashExpired(deletedAt: number, now: number, retentionMs: number = TRASH_RETENTION_MS): boolean {
  return now - deletedAt >= retentionMs;
}

/** Trash ordering: most recently deleted first (fallback: updatedAt). */
export function sortTrash<T extends { deletedAt?: number | null; updatedAt: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => (b.deletedAt ?? b.updatedAt) - (a.deletedAt ?? a.updatedAt));
}
