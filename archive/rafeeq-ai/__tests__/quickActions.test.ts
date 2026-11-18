// Copyright (c) 2026 DRS AI. All rights reserved.
import type { QuickActionInput } from '../src/utils/quickActions';
import { quickActionsFor } from '../src/utils/quickActions';

const base: QuickActionInput = {
  role: 'assistant',
  streaming: false,
  editing: false,
  content: 'رد كامل',
  isLast: true,
  allowRegenerate: true,
};

const cases: { name: string; over: Partial<QuickActionInput>; expected: string[] }[] = [
  { name: 'completed latest reply: copy + speak + regenerate + variants', over: {}, expected: ['copy', 'speak', 'regenerate', 'variants'] },
  { name: 'older reply: copy + speak only', over: { isLast: false }, expected: ['copy', 'speak'] },
  { name: 'engine busy or unloaded: no regenerate nor variants', over: { allowRegenerate: false }, expected: ['copy', 'speak'] },
  { name: 'streaming reply: nothing yet', over: { streaming: true }, expected: [] },
  { name: 'empty content: nothing', over: { content: '' }, expected: [] },
  { name: 'whitespace content: nothing', over: { content: '  \n ' }, expected: [] },
  { name: 'inline edit open: nothing', over: { editing: true }, expected: [] },
  { name: 'user message: nothing (the long-press menu handles it)', over: { role: 'user' as const }, expected: [] },
];

describe('quickActionsFor', () => {
  it.each(cases)('$name', ({ over, expected }) => {
    expect(quickActionsFor({ ...base, ...over })).toEqual(expected);
  });
});
