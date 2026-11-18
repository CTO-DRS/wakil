// Copyright (c) 2026 DRS AI. All rights reserved.

/** Android ComponentCallbacks2 trim levels. */
export const TRIM_MEMORY_RUNNING_LOW = 10;
export const TRIM_MEMORY_RUNNING_CRITICAL = 15;
export const TRIM_MEMORY_UI_HIDDEN = 20;
export const TRIM_MEMORY_BACKGROUND = 40;

export type ReleaseInput = {
  /** RN AppState value: 'active' | 'background' | 'inactive' | 'unknown' | 'extension'. */
  appState: string;
  /** Highest trim level received since the app last became active, or null. */
  trimLevel: number | null;
  /** iOS/RN memoryWarning seen since last active. */
  memoryWarning: boolean;
  lowMemory: boolean;
  generating: boolean;
  modelLoaded: boolean;
};

/**
 * Decides whether to release the loaded model. We keep it while the user is in the app,
 * and release it in the background only under memory pressure, so switching apps briefly
 * does not force a slow reload. A critical warning while active also releases (unless we
 * are mid-generation, where the user is actively waiting).
 */
export function shouldReleaseModel(i: ReleaseInput): boolean {
  if (!i.modelLoaded) return false;
  const pressured =
    i.memoryWarning || i.lowMemory || (i.trimLevel !== null && i.trimLevel >= TRIM_MEMORY_RUNNING_LOW && i.trimLevel !== TRIM_MEMORY_UI_HIDDEN);
  if (i.appState === 'background') return pressured;
  if (i.generating) return false;
  return i.trimLevel !== null && i.trimLevel >= TRIM_MEMORY_RUNNING_CRITICAL && i.trimLevel < TRIM_MEMORY_UI_HIDDEN;
}
