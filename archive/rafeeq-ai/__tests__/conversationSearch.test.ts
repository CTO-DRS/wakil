// Copyright (c) 2026 DRS AI. All rights reserved.
import { findMessageMatches, IN_CHAT_MIN_QUERY } from '../src/utils/conversationSearch';

const m = (id: string, content: string) => ({ id, content });

describe('findMessageMatches', () => {
  const messages = [m('a', 'مرحبا بالعالم'), m('b', 'Hello World'), m('c', 'مُرَحِّبًا بكم'), m('d', 'لا شيء هنا')];

  it('uses the same minimum as the global search', () => {
    expect(IN_CHAT_MIN_QUERY).toBe(2);
  });

  it('returns matching ids in conversation order', () => {
    expect(findMessageMatches(messages, 'مرح')).toEqual(['a', 'c']);
    expect(findMessageMatches(messages, 'world')).toEqual(['b']);
    expect(findMessageMatches(messages, 'هنا')).toEqual(['d']);
  });

  it('matches Arabic with diacritics and tatweel stripped, case-insensitively', () => {
    expect(findMessageMatches(messages, 'مرحبا')).toEqual(['a', 'c']);
    expect(findMessageMatches(messages, 'العَالــم')).toEqual(['a']); // needle normalized too
    expect(findMessageMatches(messages, 'HELLO')).toEqual(['b']);
  });

  it('requires at least two letters by default', () => {
    expect(findMessageMatches(messages, 'م')).toEqual([]);
    // The floor is a parameter, so a caller may loosen it.
    expect(findMessageMatches(messages, 'م', 1)).toEqual(['a', 'c']);
  });

  it('ignores blank queries and empty lists', () => {
    expect(findMessageMatches(messages, '   ')).toEqual([]);
    expect(findMessageMatches([], 'مرحبا')).toEqual([]);
  });

  it('trims the query before matching', () => {
    expect(findMessageMatches(messages, '  hello  ')).toEqual(['b']);
  });

  it('returns every hit when everything matches', () => {
    const all = findMessageMatches([...messages, m('e', 'مرحبا مرة أخرى')], 'مرحبا');
    expect(all).toEqual(['a', 'c', 'e']);
  });
});
