// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  NOTES_CAP,
  capNotes,
  makeNote,
  normalizeNoteInput,
  summarizeNotes,
} from '../src/agent/notes';
import { makePhase1Registry } from '../src/agent/tools/phase1';
import type { ToolContext } from '../src/agent/types';

const ctx: ToolContext = {
  locale: 'ar',
  now: () => new Date(1_800_000_000_000),
  model: { id: 'demo', name: 'demo-model' },
};

const memory = (() => {
  let notes: { id: string; title: string; body: string; createdAt: number }[] = [];
  return {
    addNote: (title: string, body: string, createdAt: number) => {
      notes = capNotes([makeNote(`n_${createdAt}`, title, body, createdAt), ...notes]);
      return { ok: true as const, data: 'حُفظت' };
    },
    getNotes: () => notes,
  };
})();

describe('normalizeNoteInput', () => {
  it.each([
    { name: 'a plain title passes', title: 'موعد الدكتور', body: undefined, ok: true },
    { name: 'a title and body pass', title: 'موعد', body: 'الساعة ٥', ok: true },
    { name: 'an empty title fails', title: '   ', body: undefined, ok: false },
    { name: 'a non-string title fails', title: 42, body: undefined, ok: false },
    { name: 'a non-string body fails', title: 'موعد', body: 7, ok: false },
    { name: 'an over-long title passes (capped, never rejected)', title: 'x'.repeat(500), body: undefined, ok: true },
    { name: 'an over-long body passes (capped, never rejected)', title: 'موعد', body: 'x'.repeat(5000), ok: true },
  ])('$name', ({ title, body, ok }) => {
    expect(normalizeNoteInput(title, body).ok).toBe(ok);
  });

  it('caps accepted fields to the documented maxima', () => {
    const result = normalizeNoteInput('x'.repeat(300), 'y'.repeat(3000));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toHaveLength(120);
      expect(result.body).toHaveLength(2000);
    }
  });
});

describe('capNotes', () => {
  it('keeps the newest first and enforces the shelf cap', () => {
    const notes = Array.from({ length: NOTES_CAP + 5 }, (_, i) => makeNote(`n${i}`, `t${i}`, '', i));
    const capped = capNotes(notes);
    expect(capped).toHaveLength(NOTES_CAP);
    expect(capped[0].id).toBe(`n${NOTES_CAP + 4}`);
    expect(capped[capped.length - 1].id).toBe(`n${5}`);
  });
});

describe('summarizeNotes', () => {
  it('says there are no notes honestly', () => {
    expect(summarizeNotes([], 'ar')).toBe('لا توجد مذكرات محفوظة.');
    expect(summarizeNotes([], 'en')).toBe('No saved notes.');
  });

  it('renders titles, bodies and dates without raw JSON', () => {
    const text = summarizeNotes([makeNote('n1', 'موعد الدكتور', 'الساعة ٥', 1_800_000_000_000)], 'ar');
    expect(text).toContain('1. موعد الدكتور');
    expect(text).toContain('— الساعة ٥');
    expect(text).not.toContain('{');
  });
});

describe('phase1 notes tools', () => {
  it('notes.create saves through the injected shelf and reports success', async () => {
    const registry = makePhase1Registry(memory);
    const tool = registry.get('notes.create')!;
    const result = await tool.run({ title: 'أتصل على أبوي بعد العصر', body: 'مهم' }, ctx);
    expect(result.ok).toBe(true);
    expect(memory.getNotes()).toHaveLength(1);
    expect(memory.getNotes()[0].title).toBe('أتصل على أبوي بعد العصر');
  });

  it('notes.create rejects an empty title without touching the shelf', async () => {
    const registry = makePhase1Registry(memory);
    const tool = registry.get('notes.create')!;
    const result = await tool.run({ title: '   ' }, ctx);
    expect(result.ok).toBe(false);
    expect(memory.getNotes()).toHaveLength(1);
  });

  it('notes.list reports the shelf through the injected reader', async () => {
    const registry = makePhase1Registry(memory);
    const tool = registry.get('notes.list')!;
    const result = await tool.run({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('أتصل على أبوي');
  });

  it('time.now reports the device clock in ISO and locale form', async () => {
    const registry = makePhase1Registry();
    const tool = registry.get('time.now')!;
    const result = await tool.run({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('ISO: 2027-01-15T');
  });

  it('device.model_info names the loaded model, or says none is loaded', async () => {
    const registry = makePhase1Registry();
    const withModel = await registry.get('device.model_info')!.run({}, ctx);
    expect(withModel.data).toContain('demo-model');
    const without = await registry.get('device.model_info')!.run({}, { ...ctx, model: null });
    expect(without.data).toContain('لا يوجد نموذج');
  });

  it('the phase-1 registry has exactly four tools and marks only notes.create mutating', () => {
    const registry = makePhase1Registry();
    expect(registry.list().map((t) => t.name).sort()).toEqual(['device.model_info', 'notes.create', 'notes.list', 'time.now']);
    expect(registry.list().filter((t) => t.mutating).map((t) => t.name)).toEqual(['notes.create']);
  });
});
