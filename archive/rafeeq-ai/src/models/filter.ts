// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * Pure catalog filtering for the Models screen: size buckets (small / medium /
 * large) and a "fits my phone" pass that keeps the models whose runtime RAM
 * estimate stays inside the device's free memory. Storage-free and deterministic
 * so the rules are table-driven testable.
 */

export type ModelFilterId = 'all' | 'small' | 'medium' | 'large' | 'fits';

export const MODEL_FILTERS: readonly ModelFilterId[] = ['all', 'small', 'medium', 'large', 'fits'];

/** Bucket boundaries: small below 1 GiB, medium up to 2 GiB, large beyond. */
export const SMALL_MODEL_MAX_BYTES = 1073741824;
export const MEDIUM_MODEL_MAX_BYTES = 2147483648;

export type ModelSizeClass = 'small' | 'medium' | 'large' | 'unknown';

export function classifyModelSize(sizeBytes: number): ModelSizeClass {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 'unknown';
  if (sizeBytes < SMALL_MODEL_MAX_BYTES) return 'small';
  if (sizeBytes <= MEDIUM_MODEL_MAX_BYTES) return 'medium';
  return 'large';
}

export type FilterContext = {
  /** Free device RAM in bytes; null when the OS would not say. */
  freeRamBytes: number | null;
  /** Runtime RAM need per model in bytes (null = voice or unknowable). */
  runtimeBytes: (sizeBytes: number) => number | null;
};

export function applyModelFilter<T extends { readonly sizeBytes: number }>(
  models: readonly T[],
  filter: ModelFilterId,
  ctx: FilterContext,
): T[] {
  if (filter === 'all') return models.slice();
  if (filter === 'fits') {
    // Without a RAM reading every model stays visible; nothing is hidden on a maybe.
    if (ctx.freeRamBytes === null || ctx.freeRamBytes <= 0) return models.slice();
    return models.filter((m) => {
      const need = ctx.runtimeBytes(m.sizeBytes);
      return need === null || need <= ctx.freeRamBytes!;
    });
  }
  return models.filter((m) => classifyModelSize(m.sizeBytes) === filter);
}
