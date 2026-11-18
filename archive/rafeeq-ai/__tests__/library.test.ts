// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Data-integrity and search tests for the model library. The catalog's honesty
 * contract is enforced here: unique ids, bilingual completeness, integrated
 * refs that actually resolve to downloadable entries (with matching sizes),
 * and Arabic-normalized search that keeps spelling variants findable.
 */
import { CATALOG, VOICE_MODELS } from '../src/models/catalog';
import { LIBRARY_CATEGORIES, LIBRARY_CATEGORY_IDS, libraryCategory } from '../src/models/library/categories';
import { LIBRARY_MODELS } from '../src/models/library/data';
import {
  allLibraryModels,
  categoryModelCounts,
  libraryModel,
  modelsForCategory,
  normalizeArabicText,
  searchLibraryModels,
} from '../src/models/library/search';
import type { LibraryModel } from '../src/models/library/types';

const ids = () => LIBRARY_MODELS.map((m) => m.id);

describe('library registry integrity', () => {
  it('has at least one model for every declared category and no orphan models', () => {
    const counts = categoryModelCounts();
    for (const id of LIBRARY_CATEGORY_IDS) expect(counts[id]).toBeGreaterThan(0);
    for (const m of LIBRARY_MODELS) expect(counts[m.categoryId]).toBeDefined();
  });

  it('uses unique, lib.-prefixed ids that never collide with download ids', () => {
    const all = [...ids(), ...CATALOG.map((c) => c.id), ...VOICE_MODELS.map((v) => v.id)];
    expect(new Set(ids()).size).toBe(ids().length);
    expect(ids().every((id) => id.startsWith('lib.'))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(ids())('%s — bilingual fields are complete and the url is https', (id) => {
    const m = libraryModel(id) as LibraryModel;
    for (const field of ['requirements', 'quality', 'limits', 'cost', 'desc'] as const) {
      expect(m[field].ar.length).toBeGreaterThan(4);
      expect(m[field].en.length).toBeGreaterThan(4);
    }
    expect(m.features.ar.length).toBeGreaterThan(0);
    expect(m.features.en.length).toBe(m.features.ar.length);
    expect(m.name.length).toBeGreaterThan(2);
    expect(m.developer.length).toBeGreaterThan(1);
    expect(m.io.in.length).toBeGreaterThan(0);
    expect(m.io.out.length).toBeGreaterThan(0);
    expect(m.url.startsWith('https://')).toBe(true);
    expect(m.tags.length).toBeGreaterThan(1);
  });

  it('integrated entries resolve to real downloadable ids with matching sizes', () => {
    const downloads = new Map([...CATALOG, ...VOICE_MODELS].map((c) => [c.id, c]));
    const integrated = LIBRARY_MODELS.filter((m) => m.availability === 'integrated');
    expect(integrated.length).toBeGreaterThanOrEqual(6); // 4 chat GGUF + 2 whisper (+ builtin)
    for (const m of integrated) {
      if (m.kind === 'builtin') {
        expect(m.integratedRef).toBeUndefined();
        continue;
      }
      const entry = downloads.get(m.integratedRef ?? '');
      expect(entry).toBeDefined();
      expect(m.sizeBytes).toBe(entry?.sizeBytes);
      expect(m.quant).toBe(entry?.quant);
    }
  });

  it('catalog entries never pretend to be downloadable', () => {
    for (const m of LIBRARY_MODELS.filter((x) => x.availability === 'catalog')) {
      expect(m.integratedRef).toBeUndefined();
      expect(m.sizeBytes).toBeUndefined();
    }
  });

  it('covers all twelve categories', () => {
    expect(LIBRARY_CATEGORY_IDS).toHaveLength(12);
    expect(LIBRARY_CATEGORIES).toHaveLength(12);
    expect(libraryCategory('chat')?.icon).toBe('chat');
    expect(libraryCategory('nope')).toBeNull();
  });
});

describe('library search', () => {
  it('returns the full registry for empty queries', () => {
    expect(searchLibraryModels('').length).toBe(LIBRARY_MODELS.length);
    expect(searchLibraryModels('   ').length).toBe(LIBRARY_MODELS.length);
    expect(allLibraryModels().length).toBe(LIBRARY_MODELS.length);
  });

  it('matches by name, developer and tags (case-insensitive)', () => {
    expect(searchLibraryModels('whisper').map((m) => m.id)).toContain('lib.stt.whisper-tiny');
    expect(searchLibraryModels('SDAIA').map((m) => m.id)).toContain('lib.chat.allam-7b');
    expect(searchLibraryModels('meta').map((m) => m.id).length).toBeGreaterThan(0);
  });

  it('normalizes Arabic spelling variants (hamza/alef/ta-marbuta)', () => {
    // ة→ه and ى→ي: the same word spelled differently must normalize equal
    expect(normalizeArabicText('سعودية')).toBe(normalizeArabicText('سعوديه'));
    expect(normalizeArabicText('سعودى')).toBe(normalizeArabicText('سعودي'));
    // أ→ا: hamza spelling must not hide a result
    const plain = searchLibraryModels('سعودي').map((m) => m.id);
    const variant = searchLibraryModels('سعودى').map((m) => m.id);
    expect(variant).toEqual(plain);
    expect(plain).toContain('lib.stt.oddadmix-saudi');
    expect(plain).toContain('lib.tts.rafeeq-builtin');
    expect(plain).toContain('lib.chat.allam-7b');
  });

  it('requires every word of a multi-word query to hit (AND semantics)', () => {
    expect(searchLibraryModels('whisper small').map((m) => m.id)).toContain('lib.stt.whisper-small');
    expect(searchLibraryModels('whisper small')).not.toContainEqual(
      expect.objectContaining({ id: 'lib.stt.whisper-tiny' }),
    );
  });

  it('scopes by category when asked', () => {
    const scoped = searchLibraryModels('', 'chat');
    expect(scoped.length).toBe(modelsForCategory('chat').length);
    expect(scoped.every((m) => m.categoryId === 'chat')).toBe(true);
    expect(libraryModel('lib.chat.allam-7b')).not.toBeNull();
    expect(libraryModel('lib.nope')).toBeNull();
  });
});
