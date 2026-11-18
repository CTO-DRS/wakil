// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Pure lookup/search helpers over the model library. No React, no stores —
 * the screens call these and jest exercises every branch, including the
 * Arabic text normalization that makes "السعودي" and "السعودية" queries both
 * find the Saudi models regardless of hamza/alef spelling.
 */

import type { LibraryCategoryId, LibraryModel } from './types';
import { LIBRARY_MODELS } from './data';
import { LIBRARY_CATEGORY_IDS } from './categories';

/** Collapses Arabic orthography variants so spelling differences stop hiding results. */
export function normalizeArabicText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, '') // harakat + dagger alef
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

/** Lowercased haystack built once per model: name, developer, license and tags. */
function modelHaystack(m: LibraryModel): string {
  return normalizeArabicText(
    [m.name, m.developer, m.license ?? '', m.params ?? '', ...m.tags].join(' \u00b7 '),
  );
}

const HAYSTACKS: readonly { model: LibraryModel; hay: string }[] = LIBRARY_MODELS.map((model) => ({
  model,
  hay: modelHaystack(model),
}));

/** Every library entry in one list (registry order). */
export function allLibraryModels(): readonly LibraryModel[] {
  return LIBRARY_MODELS;
}

/** One model by its `lib.` id; null when unknown. */
export function libraryModel(id: string): LibraryModel | null {
  return LIBRARY_MODELS.find((m) => m.id === id) ?? null;
}

/** All models of one category, in registry order. */
export function modelsForCategory(categoryId: LibraryCategoryId): readonly LibraryModel[] {
  return LIBRARY_MODELS.filter((m) => m.categoryId === categoryId);
}

/** Model count per category id (0 for a category with no entries yet). */
export function categoryModelCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of LIBRARY_CATEGORY_IDS) counts[id] = 0;
  for (const m of LIBRARY_MODELS) counts[m.categoryId] = (counts[m.categoryId] ?? 0) + 1;
  return counts;
}

/**
 * Free-text search across the whole library with an optional category scope.
 * Empty/whitespace queries return the scope unchanged; multi-word queries
 * require every word to hit somewhere in the haystack (AND semantics).
 */
export function searchLibraryModels(
  query: string,
  categoryId?: LibraryCategoryId | null,
): readonly LibraryModel[] {
  const scope = categoryId
    ? LIBRARY_MODELS.filter((m) => m.categoryId === categoryId)
    : LIBRARY_MODELS;
  const words = normalizeArabicText(query)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return scope;
  return scope.filter((m) => {
    const hay =
      HAYSTACKS.find((h) => h.model.id === m.id)?.hay ?? modelHaystack(m);
    return words.every((w) => hay.includes(w));
  });
}
