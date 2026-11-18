// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Where model files live and how they move between homes — all pure decisions,
 * side-effect free so jest can exercise every branch. The IO side lives in
 * publicStorage.ts (root override, migration executor).
 *
 * Why a public root at all: the internal files directory survives an APK
 * update, but it is wiped by uninstalling the app, by "Clear data", and by
 * aggressive device cleaners (Transsion phones ship one). Model downloads are
 * the single most expensive thing the user does inside Rafeeq — hundreds of MB
 * to gigabytes on metered mobile data — so they must survive all of the above.
 * The shared Download/Rafeeq folder does, at the cost of a one-time
 * "All files access" grant on Android 11+.
 */

/** Subfolder of the shared public Downloads directory that holds model files. */
export const PUBLIC_DIR_NAME = 'Rafeeq';

/** Seconds of silence after which a "downloading" state is declared stalled. */
export const DOWNLOAD_STALL_TIMEOUT_MS = 45_000;

/** How often the stall watchdog samples progress (and the hashing heartbeat). */
export const DOWNLOAD_STALL_CHECK_MS = 5_000;

export type ModelsRootKind = 'public' | 'internal';

/**
 * Picks the active models root. The public folder wins only when the platform
 * supports the grant, the user enabled the setting, and Android actually
 * granted "All files access" — every other combination falls back to the
 * internal directory (today's behavior).
 */
export function decideModelsRoot(opts: {
  platformSupports: boolean;
  settingEnabled: boolean;
  allFilesGranted: boolean;
}): ModelsRootKind {
  const { platformSupports, settingEnabled, allFilesGranted } = opts;
  return platformSupports && settingEnabled && allFilesGranted ? 'public' : 'internal';
}

export type MigrationPlan = {
  /** Files to copy into the active root (missing there, or size mismatch). */
  move: string[];
  /** Files already present in the active root with a matching size. */
  alreadyThere: string[];
};

/**
 * Plans the internal → public migration from two size listings. A file moves
 * when the target copy is missing OR its size differs (a half-copied leftover
 * is replaced, never trusted). Unknown/foreign files in either listing are
 * ignored by the caller's filter before this runs.
 */
export function planMigration(
  internal: Record<string, number>,
  target: Record<string, number>,
): MigrationPlan {
  const move: string[] = [];
  const alreadyThere: string[] = [];
  for (const [name, size] of Object.entries(internal)) {
    const t = target[name];
    if (t === undefined || t !== size) move.push(name);
    else alreadyThere.push(name);
  }
  return { move, alreadyThere };
}

/** True when `timeoutMs` of silence have passed since the last progress event. */
export function isStalled(lastProgressAt: number, now: number, timeoutMs: number): boolean {
  return now - lastProgressAt >= timeoutMs;
}
