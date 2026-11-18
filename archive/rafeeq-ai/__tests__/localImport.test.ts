// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  localModelFromImport,
  planLocalImport,
  sanitizeImportBaseName,
  uniqueImportFileName,
} from '../src/models/localImport';

describe('sanitizeImportBaseName', () => {
  const cases: { name: string; input: string; expected: { base: string; ext: 'gguf' | 'bin' } | null }[] = [
    { name: 'plain gguf name', input: 'model.gguf', expected: { base: 'model', ext: 'gguf' } },
    { name: 'uppercase extension, multi-dot name', input: 'MODEL.Q4_K_M.GGUF', expected: { base: 'MODEL.Q4_K_M', ext: 'gguf' } },
    { name: 'posix path: last segment only', input: '/storage/downloads/llama-3.gguf', expected: { base: 'llama-3', ext: 'gguf' } },
    { name: 'windows path: last segment only', input: 'C:\\Downloads\\qwen.gguf', expected: { base: 'qwen', ext: 'gguf' } },
    { name: 'whitespace trimmed', input: '  spaced.gguf  ', expected: { base: 'spaced', ext: 'gguf' } },
    { name: 'arabic file name survives', input: 'نموذج-لغوي.gguf', expected: { base: 'نموذج-لغوي', ext: 'gguf' } },
    { name: 'whisper bin import: voice model', input: 'ggml-whisper-small-ar-dialectal.bin', expected: { base: 'ggml-whisper-small-ar-dialectal', ext: 'bin' } },
    { name: 'uppercase BIN accepted', input: 'DIALECT.BIN', expected: { base: 'DIALECT', ext: 'bin' } },
    { name: 'wrong extension rejected', input: 'weights.safetensors', expected: null },
    { name: 'missing extension rejected', input: 'gguf', expected: null },
    { name: 'extension only rejected', input: '.gguf', expected: null },
    { name: 'dotdot base rejected', input: '..gguf', expected: null },
    { name: 'empty rejected', input: '', expected: null },
    { name: 'blank rejected', input: '   ', expected: null },
  ];
  it.each(cases)('$name', ({ input, expected }) => {
    expect(sanitizeImportBaseName(input)).toEqual(expected);
  });
});

describe('uniqueImportFileName', () => {
  const cases: { name: string; base: string; existing: string[]; ext: 'gguf' | 'bin'; expected: string }[] = [
    { name: 'free dir: base name as-is', base: 'tiny', existing: [], ext: 'gguf', expected: 'tiny.gguf' },
    { name: 'one clash: suffix (2)', base: 'tiny', existing: ['tiny.gguf'], ext: 'gguf', expected: 'tiny (2).gguf' },
    { name: 'many clashes: next free suffix', base: 'tiny', existing: ['tiny.gguf', 'tiny (2).gguf'], ext: 'gguf', expected: 'tiny (3).gguf' },
    { name: 'case-insensitive clash', base: 'tiny', existing: ['TINY.GGUF'], ext: 'gguf', expected: 'tiny (2).gguf' },
    { name: 'unrelated names untouched', base: 'tiny', existing: ['other.gguf', 'thing.gguf'], ext: 'gguf', expected: 'tiny.gguf' },
    { name: 'staging .part of the same name avoided', base: 'tiny', existing: ['tiny.gguf.part'], ext: 'gguf', expected: 'tiny (2).gguf' },
    { name: 'voice bin: free dir', base: 'dialectal', existing: [], ext: 'bin', expected: 'dialectal.bin' },
    { name: 'voice bin: clash stays inside the bin family', base: 'dialectal', existing: ['dialectal.bin'], ext: 'bin', expected: 'dialectal (2).bin' },
    { name: 'voice bin: staging .part avoided, llm sibling ignored', base: 'dialectal', existing: ['dialectal.gguf', 'dialectal.bin.part'], ext: 'bin', expected: 'dialectal (2).bin' },
  ];
  it.each(cases)('$name', ({ base, existing, ext, expected }) => {
    expect(uniqueImportFileName(base, existing, ext)).toBe(expected);
  });
});

describe('planLocalImport', () => {
  const okBase = { pickedSize: 4_000_000_000, existingFileNames: [], freeBytes: null };
  it('accepts a gguf pick as an llm import and extracts the quant tag', () => {
    expect(planLocalImport({ ...okBase, pickedName: 'llama-3-8b-Q4_K_M.gguf' })).toEqual({
      ok: true,
      kind: 'llm',
      targetFileName: 'llama-3-8b-Q4_K_M.gguf',
      displayName: 'llama-3-8b-Q4_K_M',
      quant: 'Q4_K_M',
    });
  });
  it('accepts a bin pick as a voice import with the GGML quant tag', () => {
    expect(planLocalImport({ pickedName: 'whisper-small-ar-dialectal.bin', pickedSize: 487_000_000, existingFileNames: [], freeBytes: null })).toEqual({
      ok: true,
      kind: 'voice',
      targetFileName: 'whisper-small-ar-dialectal.bin',
      displayName: 'whisper-small-ar-dialectal',
      quant: 'GGML',
    });
  });
  it('renames to the next free file name', () => {
    expect(
      planLocalImport({ pickedName: 'm.gguf', pickedSize: 100, existingFileNames: ['m.gguf'], freeBytes: null }).ok,
    ).toBe(true);
    expect(
      planLocalImport({ pickedName: 'm.gguf', pickedSize: 100, existingFileNames: ['m.gguf'], freeBytes: null }),
    ).toMatchObject({ ok: true, targetFileName: 'm (2).gguf' });
  });
  const invalidArgs: { name: string; pickedName: string; pickedSize: number }[] = [
    { name: 'not a gguf or bin', pickedName: 'weights.safetensors', pickedSize: 100 },
    { name: 'zero size', pickedName: 'm.gguf', pickedSize: 0 },
    { name: 'negative size', pickedName: 'm.gguf', pickedSize: -5 },
    { name: 'unknown size (NaN)', pickedName: 'm.gguf', pickedSize: Number.NaN },
    { name: 'infinite size', pickedName: 'm.gguf', pickedSize: Number.POSITIVE_INFINITY },
  ];
  it.each(invalidArgs)('rejects: $name', ({ pickedName, pickedSize }) => {
    expect(planLocalImport({ ...okBase, pickedName, pickedSize })).toEqual({ ok: false, reason: 'invalid' });
  });
  it('rejects when free space cannot hold the copy plus the safety margin', () => {
    const plan = planLocalImport({ ...okBase, pickedName: 'm.gguf', freeBytes: okBase.pickedSize });
    expect(plan).toEqual({ ok: false, reason: 'nospace' });
  });
});

describe('localModelFromImport', () => {
  it('builds a custom llm model with a local:// url and a stable id', () => {
    const model = localModelFromImport('My Model.gguf', 'My Model', 1234, 'a'.repeat(64));
    expect(model).toEqual({
      id: 'local:my model',
      name: 'My Model',
      description: '',
      url: 'local://My Model.gguf',
      fileName: 'My Model.gguf',
      sizeBytes: 1234,
      params: '',
      quant: '',
      license: '',
      source: 'custom',
      sha256: 'a'.repeat(64),
    });
  });
  it('derives the quant tag from the file name when present', () => {
    expect(localModelFromImport('Mistral-7B-Q5_K_M.gguf', 'Mistral-7B-Q5_K_M', 10, null).quant).toBe('Q5_K_M');
  });
  it('keeps the shared guessQuant heuristic: first Q-tag in the name wins', () => {
    expect(localModelFromImport('q3-8b-Q5_K_M.gguf', 'q3-8b-Q5_K_M', 10, null).quant).toBe('Q3');
  });
  it('guards against unusable sizes', () => {
    expect(localModelFromImport('m.gguf', 'm', Number.NaN, null).sizeBytes).toBe(0);
    expect(localModelFromImport('m.gguf', 'm', -3, null).sizeBytes).toBe(0);
  });
  it('builds a voice model for a bin import: voice-local id, voice source, Arabic pinned', () => {
    const model = localModelFromImport('whisper-small-ar-dialectal.bin', 'whisper-small-ar-dialectal', 487_000_000, 'b'.repeat(64), 'voice');
    expect(model).toEqual({
      id: 'voice-local:whisper-small-ar-dialectal',
      name: 'whisper-small-ar-dialectal',
      description: '',
      url: 'local://whisper-small-ar-dialectal.bin',
      fileName: 'whisper-small-ar-dialectal.bin',
      sizeBytes: 487_000_000,
      params: '',
      quant: 'GGML',
      license: '',
      source: 'voice',
      sha256: 'b'.repeat(64),
      voiceLanguage: 'ar',
    });
  });
  it('voice model guards against unusable sizes too', () => {
    expect(localModelFromImport('v.bin', 'v', -1, null, 'voice').sizeBytes).toBe(0);
  });
});
