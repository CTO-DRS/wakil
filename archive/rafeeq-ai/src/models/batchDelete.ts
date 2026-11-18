// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * Pure planner for deleting several models in one go. Given the selected ids,
 * the per-model file states, the currently loaded model and the custom-entry
 * ids, it sorts the work into unload → remove-entry → delete-file steps the
 * caller can run without touching live downloads or the loaded engine blind.
 */

export type BatchDeletePlan = {
  /** Loaded LLM ids that must be released before their files vanish. */
  unloadModelIds: string[];
  /** Downloaded files to erase from disk (catalog + voice). */
  deleteFileIds: string[];
  /** Custom entries to remove (entry + file, per the model store). */
  removeCustomIds: string[];
  /** Selected ids with nothing on disk to clean (idle / error rows). */
  skipped: string[];
};

export type BatchFileState = {
  readonly status: string;
};

export function planBatchDelete(
  ids: readonly string[],
  files: Readonly<Record<string, BatchFileState>>,
  loadedModelId: string | null,
  customIds: ReadonlySet<string>,
): BatchDeletePlan {
  const plan: BatchDeletePlan = { unloadModelIds: [], deleteFileIds: [], removeCustomIds: [], skipped: [] };
  for (const id of ids) {
    const status = files[id]?.status;
    if (customIds.has(id)) {
      // Custom entries vanish together with their file via removeCustomModel.
      if (loadedModelId === id) plan.unloadModelIds.push(id);
      plan.removeCustomIds.push(id);
      continue;
    }
    if (status === 'downloaded' || status === 'paused' || status === 'error') {
      if (loadedModelId === id) plan.unloadModelIds.push(id);
      plan.deleteFileIds.push(id);
      continue;
    }
    plan.skipped.push(id);
  }
  return plan;
}

/** Number of models the plan will actually touch (files or entries). */
export function batchDeleteCount(plan: BatchDeletePlan): number {
  return plan.deleteFileIds.length + plan.removeCustomIds.length;
}
