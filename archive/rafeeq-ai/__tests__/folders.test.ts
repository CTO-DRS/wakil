// Copyright (c) 2026 DRS AI. All rights reserved.
import { MAX_FOLDER_NAME, listFolderNames, normalizeFolderName } from '../src/utils/folders';

describe('normalizeFolderName', () => {
  it.each([
    ['  العمل  ', 'العمل'],
    ['work\t and  study', 'work and study'],
    ['', null],
    ['   ', null],
    ['\n\t', null],
  ])('normalizes %j -> %j', (raw, expected) => {
    expect(normalizeFolderName(raw)).toBe(expected);
  });

  it('clamps names longer than the cap instead of rejecting them', () => {
    const long = 'ا'.repeat(MAX_FOLDER_NAME + 10);
    expect(normalizeFolderName(long)).toHaveLength(MAX_FOLDER_NAME);
  });
});

describe('listFolderNames', () => {
  it('collects unique names sorted alphabetically and skips unfilled conversations', () => {
    const list = [
      { folder: 'العمل' },
      { folder: null },
      { folder: 'study' },
      { folder: undefined },
      { folder: 'العمل' },
      { folder: '   ' },
      { folder: 'family' },
    ];
    expect(listFolderNames(list)).toEqual(['family', 'study', 'العمل']);
  });

  it('normalizes near-duplicates into one entry', () => {
    const list = [{ folder: ' العمل ' }, { folder: 'العمل' }, { folder: 'العمل' }];
    expect(listFolderNames(list)).toEqual(['العمل']);
  });

  it('returns an empty list for conversations without folders', () => {
    expect(listFolderNames([{}, { folder: null }, { folder: '' }])).toEqual([]);
  });
});
