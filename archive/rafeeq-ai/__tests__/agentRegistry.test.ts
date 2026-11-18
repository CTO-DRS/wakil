// Copyright (c) 2026 DRS AI. All rights reserved.
import { requiresConfirmation, riskLevel } from '../src/agent/confirmation';
import { renderToolCatalog, ToolRegistry } from '../src/agent/registry';
import type { ToolDefinition } from '../src/agent/types';

function makeTool(name: string, mutating = false): ToolDefinition {
  return {
    name,
    descriptionAr: 'وصف',
    descriptionEn: 'A description',
    category: 'notes',
    mutating,
    parameters: { type: 'object', properties: { title: { type: 'string', description: 't' } }, required: ['title'] },
    run: async () => ({ ok: true }),
  };
}

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('notes.create'));
    registry.register(makeTool('notes.list'));
    expect(registry.get('notes.create')?.name).toBe('notes.create');
    expect(registry.has('notes.list')).toBe(true);
    expect(registry.size).toBe(2);
  });

  it('rejects malformed names and duplicates', () => {
    const registry = new ToolRegistry();
    expect(() => registry.register(makeTool('notescreate'))).toThrow('INVALID_TOOL_NAME');
    expect(() => registry.register(makeTool('Notes.Create'))).toThrow('INVALID_TOOL_NAME');
    registry.register(makeTool('notes.create'));
    expect(() => registry.register(makeTool('notes.create'))).toThrow('DUPLICATE_TOOL');
  });

  it('lists tools sorted by name', () => {
    const registry = new ToolRegistry();
    registry.register(makeTool('time.now'));
    registry.register(makeTool('aether.ping'));
    registry.register(makeTool('notes.create'));
    expect(registry.list().map((t) => t.name)).toEqual(['aether.ping', 'notes.create', 'time.now']);
  });
});

describe('confirmation policy', () => {
  it.each([
    { name: 'a mutating tool is risky and needs approval', mutating: true, risk: 'mutating', confirm: true },
    { name: 'a read-only tool runs directly', mutating: false, risk: 'read-only', confirm: false },
  ])('$name', ({ mutating, risk, confirm }) => {
    const tool = makeTool('x.y', mutating);
    expect(riskLevel(tool)).toBe(risk);
    expect(requiresConfirmation(tool)).toBe(confirm);
  });
});

describe('renderToolCatalog', () => {
  it('marks mutating tools in Arabic and lists required args with a star', () => {
    const line = renderToolCatalog([makeTool('notes.create', true)], 'ar');
    expect(line).toContain('notes.create');
    expect(line).toContain('[يغيّر بيانات]');
    expect(line).toContain('وصف');
    expect(line).toContain('title: string*');
  });

  it('uses read-only badge and English text in English locale', () => {
    const line = renderToolCatalog([makeTool('notes.list', false)], 'en');
    expect(line).toContain('[read-only]');
    expect(line).toContain('A description');
  });

  it('renders an empty catalog gracefully', () => {
    expect(renderToolCatalog([], 'ar')).toBe('(لا توجد أدوات)');
    expect(renderToolCatalog([], 'en')).toBe('(no tools)');
  });
});
