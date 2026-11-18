// Copyright (c) 2026 DRS AI. All rights reserved.
import { buildPlanGrammar, buildSingleToolCallGrammar, buildToolCallGrammar } from '../src/agent/grammar';
import type { ToolDefinition } from '../src/agent/types';

const notesCreate: ToolDefinition = {
  name: 'notes.create',
  descriptionAr: 'يحفظ مذكرة',
  descriptionEn: 'Saves a note',
  category: 'notes',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title' },
      body: { type: 'string', description: 'Body' },
      pinned: { type: 'boolean', description: 'Pinned' },
      level: { type: 'integer', description: 'Level', enum: ['low', 'high'] },
    },
    required: ['title'],
  },
  run: async () => ({ ok: true }),
};

const timeNow: ToolDefinition = {
  name: 'time.now',
  descriptionAr: 'الوقت الحالي',
  descriptionEn: 'Current time',
  category: 'time',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  run: async () => ({ ok: true, data: 'now' }),
};

describe('buildToolCallGrammar', () => {
  const grammar = buildToolCallGrammar([notesCreate, timeNow]);

  it('declares the shared primitives and the root rule', () => {
    expect(grammar).toContain('root ::= ');
    expect(grammar).toContain(String.raw`str ::= "\""`);
    expect(grammar).toContain('ws ::= [ \\t\\n\\r]*');
    expect(grammar).toContain('num ::=');
    expect(grammar).toContain('int ::= "-"? [0-9]+');
  });

  it('matches JSON keys with their quote characters', () => {
    expect(grammar).toContain(String.raw`"\"tool\""`);
    expect(grammar).toContain(String.raw`"\"arguments\""`);
    expect(grammar).toContain(String.raw`"\"title\""`);
  });

  it('lists every tool as a quoted JSON alternative', () => {
    expect(grammar).toContain(String.raw`"\"notes.create\""`);
    expect(grammar).toContain(String.raw`"\"time.now\"`);
    expect(grammar).toContain(' | ');
  });

  it('renders enum values as literal alternations', () => {
    expect(grammar).toContain(String.raw`("\"low\"" | "\"high\"")`);
  });

  it('renders booleans as true/false alternatives', () => {
    expect(grammar).toContain('("true" | "false")');
  });

  it('keeps optional properties as optional groups', () => {
    expect(grammar).toContain(String.raw`ws ( "," ws "\"body\"" ws ":" ws str )?`);
  });

  it('throws on an empty tool list', () => {
    expect(() => buildToolCallGrammar([])).toThrow('NO_TOOLS_FOR_GRAMMAR');
  });
});

describe('buildSingleToolCallGrammar', () => {
  it('locks the tool literal and the arguments object', () => {
    const grammar = buildSingleToolCallGrammar(notesCreate);
    expect(grammar).toContain(
      String.raw`root ::= ws "{" ws "\"tool\"" ws ":" ws "\"notes.create\"" ws "," ws "\"arguments\"" ws ":" ws args ws "}" ws`,
    );
    expect(grammar).toContain(String.raw`args ::= "{" ws "\"title\"" ws ":" ws str`);
  });

  it('emits an empty-args rule for argument-free tools', () => {
    const grammar = buildSingleToolCallGrammar(timeNow);
    expect(grammar).toContain('args ::= "{" ws "}"');
  });
});

describe('buildPlanGrammar', () => {
  it('wraps the steps array and allows null tool steps', () => {
    const grammar = buildPlanGrammar(['notes.create', 'time.now']);
    expect(grammar).toContain(String.raw`"\"steps\""`);
    expect(grammar).toContain('steps ::= step ( ws "," ws step )*');
    expect(grammar).toContain('| "null"');
    expect(grammar).toContain(String.raw`"\"title\"" ws ":" ws str ws "," ws "\"tool\"" ws ":" ws`);
    expect(grammar).toContain(String.raw`"\"detail\"" ws ":" ws str`);
  });

  it('throws on an empty tool list', () => {
    expect(() => buildPlanGrammar([])).toThrow('NO_TOOLS_FOR_GRAMMAR');
  });
});
