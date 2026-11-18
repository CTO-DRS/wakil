// Copyright (c) 2026 DRS AI. All rights reserved.
import { validateArgs } from '../src/agent/schema';
import type { ToolSchema } from '../src/agent/types';

const noteSchema: ToolSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Note title' },
    body: { type: 'string', description: 'Optional body' },
    priority: { type: 'integer', description: 'Priority', enum: ['1', '2', '3'] },
    pinned: { type: 'boolean', description: 'Pinned' },
    tags: { type: 'string', description: 'Tag list', items: { type: 'string', description: 'Tag' } },
  },
  required: ['title'],
};

describe('validateArgs', () => {
  it.each([
    { name: 'a bare title passes', args: { title: 'موعد الدكتور' }, ok: true },
    { name: 'title plus optional body passes', args: { title: 'x', body: 'تفاصيل' }, ok: true },
    { name: 'boolean passes', args: { title: 'x', pinned: true }, ok: true },
    { name: 'an array of strings passes', args: { title: 'x', tags: ['a', 'b'] }, ok: true },
    { name: 'missing required title fails', args: {}, ok: false },
    { name: 'a number instead of a string fails', args: { title: 7 }, ok: false },
    { name: 'an empty string fails', args: { title: '   ' }, ok: false },
    { name: 'an unknown key fails', args: { title: 'x', hacker: true }, ok: false },
    { name: 'a non-object payload fails', args: 'title', ok: false },
    { name: 'an array payload fails', args: ['title'], ok: false },
    { name: 'a non-boolean pinned fails', args: { title: 'x', pinned: 'yes' }, ok: false },
    { name: 'a non-integer number fails', args: { title: 'x', priority: 1.5 }, ok: false },
    { name: 'an out-of-enum value fails', args: { title: 'x', priority: '9' }, ok: false },
    { name: 'a non-string array element fails', args: { title: 'x', tags: [1] }, ok: false },
  ])('$name', ({ args, ok }) => {
    const result = validateArgs(noteSchema, args);
    expect(result.ok).toBe(ok);
  });

  it('reports which argument failed', () => {
    const result = validateArgs(noteSchema, { title: 'x', pinned: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('pinned');
  });

  it('accepts an empty schema with an empty object', () => {
    const empty: ToolSchema = { type: 'object', properties: {}, required: [] };
    expect(validateArgs(empty, {})).toEqual({ ok: true });
    expect(validateArgs(empty, { extra: 1 }).ok).toBe(false);
  });
});
