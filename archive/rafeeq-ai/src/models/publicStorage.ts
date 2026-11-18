// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * IO side of the models storage decision: asks Android for "All files access",
 * switches the transport's models root to the shared Download/Rafeeq folder,
 * and migrates already-downloaded models there. The pure decisions live in
 * modelStorage.ts (tested); every native touch here is lazy so tests never
 * load expo-file-system or the modules.
 *
 * Why this exists: the internal files directory dies with an uninstall,
 * a "Clear data" tap or an aggressive phone cleaner — and re-downloading a
 * gigabyte on metered data is exactly the loss the user complained about
 * ("النماذج لا تحفظ بعد التحديث"). Download/Rafeeq survives all of them.
 */

import { useSettingsStore } from '../store/settingsStore';
import { getRafeeqNative } from '../agent/tools/native';
import {
  DEFAULT_MODELS_ROOT_URI,
  currentModelsDir,
  setModelsRootOverride,
} from './expoTransport';
import {
  PUBLIC_DIR_NAME,
  decideModelsRoot,
  planMigration,
  type ModelsRootKind,
} from './modelStorage';

type Expfs = typeof import('expo-file-system');

function requireExpfs(): Expfs {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-file-system') as Expfs;
}

let activeRoot: ModelsRootKind = 'internal';
let allFilesSupported = false;
let allFilesGranted = false;
let publicRootUri: string | null = null;

export type ModelsStorageStatus = {
  /** Where model files live right now. */
  root: ModelsRootKind;
  /** Android 11+ (the grant exists at all). */
  supported: boolean;
  /** "All files access" currently granted. */
  granted: boolean;
  /** The user's "keep models in Downloads" switch. */
  settingEnabled: boolean;
  /** Absolute folder path when the public root is active, else null. */
  publicPath: string | null;
};

/** The last known storage state (refreshed by initModelsRoot/refreshStatus). */
export function storageStatus(): ModelsStorageStatus {
  return {
    root: activeRoot,
    supported: allFilesSupported,
    granted: allFilesGranted,
    settingEnabled: useSettingsStore.getState().publicModels,
    publicPath: publicRootUri,
  };
}

/**
 * Re-decides the models root from the current permission + setting state and
 * applies it to the transport. Idempotent and cheap; call at startup and after
 * the user returns from the permission screen or flips the setting.
 */
export async function initModelsRoot(): Promise<ModelsRootKind> {
  const tools = getRafeeqNative();
  const st = tools ? await tools.allFilesAccessStatus().catch(() => null) : null;
  allFilesSupported = st?.supported === true;
  allFilesGranted = st?.granted === true;
  const settingEnabled = useSettingsStore.getState().publicModels;
  const root = decideModelsRoot({
    platformSupports: allFilesSupported,
    settingEnabled,
    allFilesGranted,
  });
  if (root === 'public' && tools) {
    const d = await tools.publicDownloadsDir().catch(() => null);
    const base = typeof d?.path === 'string' && d.path.length > 0 ? d.path : null;
    if (base) {
      try {
        const fs = requireExpfs();
        const dir = new fs.Directory(base, PUBLIC_DIR_NAME);
        if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
        setModelsRootOverride(dir.uri);
        publicRootUri = dir.uri;
        activeRoot = 'public';
        return 'public';
      } catch {
        // Unusable public folder (weird storage config): stay internal.
      }
    }
  }
  setModelsRootOverride(null);
  publicRootUri = null;
  activeRoot = 'internal';
  return 'internal';
}

/**
 * Moves every known model file from the internal root into the active public
 * root, fully safe against mid-way failure: pass one copies + verifies ALL
 * files into staging names, pass two (only when every copy verified) moves
 * them into place and deletes the internal originals. Any failure leaves the
 * internal originals untouched and reverts to the internal root, so the user
 * never loses a model to a half-done migration.
 */
export async function migrateIntoActiveRoot(
  fileNames: string[],
): Promise<{ moved: string[]; failed: string[] }> {
  const fs = requireExpfs();
  const wanted = new Set(fileNames.filter((n) => typeof n === 'string' && n.length > 0 && !n.includes('/')));
  if (activeRoot !== 'public' || !publicRootUri || wanted.size === 0) {
    return { moved: [], failed: [] };
  }

  const sourceDir = new fs.Directory(DEFAULT_MODELS_ROOT_URI);
  if (!sourceDir.exists) return { moved: [], failed: [] };

  // Only known model files participate; .part/.json sidecars and stranger
  // files are left exactly where they are.
  const sourceSizes: Record<string, number> = {};
  for (const entry of sourceDir.list()) {
    const name = entry.name;
    if (!wanted.has(name) || !(entry instanceof fs.File) || !entry.exists) continue;
    sourceSizes[name] = entry.size;
  }
  if (Object.keys(sourceSizes).length === 0) return { moved: [], failed: [] };

  const targetDir = currentModelsDir();
  const targetSizes: Record<string, number> = {};
  if (targetDir.exists) {
    for (const entry of targetDir.list()) {
      if (!(entry instanceof fs.File) || !entry.exists || !wanted.has(entry.name)) continue;
      targetSizes[entry.name] = entry.size;
    }
  }

  const { move } = planMigration(sourceSizes, targetSizes);
  if (move.length === 0) return { moved: [], failed: [] };

  // Pass 1: copy + verify every file into a staging name. Sources untouched.
  const staged: { name: string; staging: InstanceType<Expfs['File']> }[] = [];
  const failed: string[] = [];
  for (const name of move) {
    try {
      const src = new fs.File(sourceDir, name);
      const staging = new fs.File(targetDir, `${name}.migrating`);
      if (staging.exists) staging.delete();
      src.copySync(staging, { overwrite: true });
      if (!staging.exists || staging.size !== sourceSizes[name]) {
        staging.delete();
        failed.push(name);
        continue;
      }
      staged.push({ name, staging });
    } catch {
      failed.push(name);
    }
  }
  if (staged.length === 0) return { moved: [], failed };

  // Something failed: clean the staging copies and keep the internal root —
  // a partial migration must never look like a finished one.
  if (failed.length > 0) {
    for (const { staging } of staged) {
      try {
        staging.delete();
      } catch {
        // best effort
      }
    }
    return { moved: [], failed };
  }

  // Pass 2: every copy verified — move into place and retire the originals.
  const moved: string[] = [];
  for (const { name, staging } of staged) {
    try {
      const dst = new fs.File(targetDir, name);
      if (dst.exists) dst.delete();
      staging.moveSync(dst);
      const src = new fs.File(sourceDir, name);
      if (src.exists) src.delete();
      moved.push(name);
    } catch {
      failed.push(name);
    }
  }
  return { moved, failed };
}

/** Re-queries the native permission state without switching the root. */
export async function refreshStatus(): Promise<ModelsStorageStatus> {
  const tools = getRafeeqNative();
  const st = tools ? await tools.allFilesAccessStatus().catch(() => null) : null;
  allFilesSupported = st?.supported === true;
  allFilesGranted = st?.granted === true;
  return storageStatus();
}

/** Opens Android's "All files access" screen; false when unavailable. */
export async function openAllFilesAccessSettings(): Promise<boolean> {
  const tools = getRafeeqNative();
  if (!tools) return false;
  const res = await tools.openAllFilesAccessSettings().catch(() => null);
  return res?.ok === true;
}
