// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The Phase-1 tool set: safe on-device capabilities that need no native
 * modules — device time, loaded-model info, and local notes (the first
 * mutating tool, gated behind the confirmation card). Phase 2 fills this
 * registry with the native Kotlin tools (alarms, calendar, contacts…).
 */

import { ToolRegistry } from '../registry';
import type { ToolDefinition, ToolResult } from '../types';
import { makeNote, normalizeNoteInput, summarizeNotes, useNotesStore } from '../notes';

export interface Phase1ToolDeps {
  /** Where notes land; defaults to the KV-backed store (tests inject memory). */
  addNote?: (title: string, body: string, createdAt: number) => ToolResult;
  getNotes?: () => { id: string; title: string; body: string; createdAt: number }[];
}

const timeNow: ToolDefinition = {
  name: 'time.now',
  descriptionAr: 'يعيد الوقت والتاريخ الحاليين على الجهاز.',
  descriptionEn: 'Returns the device current time and date.',
  category: 'time',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_args, ctx): Promise<ToolResult> {
    const now = ctx.now();
    const localeTag = ctx.locale === 'ar' ? 'ar-SA' : 'en-GB';
    const shown = now.toLocaleString(localeTag, { dateStyle: 'full', timeStyle: 'short' });
    return { ok: true, data: `${shown} (ISO: ${now.toISOString()})` };
  },
};

const modelInfo: ToolDefinition = {
  name: 'device.model_info',
  descriptionAr: 'يعيد معلومات النموذج المحمّل حاليًا في رفيق.',
  descriptionEn: 'Returns info about the currently loaded Rafeeq model.',
  category: 'device',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_args, ctx): Promise<ToolResult> {
    if (!ctx.model) {
      return { ok: true, data: ctx.locale === 'ar' ? 'لا يوجد نموذج محمّل حاليًا.' : 'No model is loaded right now.' };
    }
    return {
      ok: true,
      data: ctx.locale === 'ar'
        ? `النموذج المحمّل: ${ctx.model.name} (${ctx.model.id}).`
        : `Loaded model: ${ctx.model.name} (${ctx.model.id}).`,
    };
  },
};

function makeNotesCreate(deps: Phase1ToolDeps): ToolDefinition {
  return {
    name: 'notes.create',
    descriptionAr: 'يحفظ مذكرة جديدة على الجهاز (يتطلب موافقتك).',
    descriptionEn: 'Saves a new note on the device (requires your approval).',
    category: 'notes',
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        body: { type: 'string', description: 'Optional note body' },
      },
      required: ['title'],
    },
    async run(args, ctx): Promise<ToolResult> {
      const input = normalizeNoteInput(args.title, args.body);
      if (!input.ok) return { ok: false, error: input.error };
      const createdAt = ctx.now().getTime();
      if (deps.addNote) {
        return deps.addNote(input.title, input.body, createdAt);
      }
      const id = `n_${createdAt.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
      useNotesStore.getState().addNote(makeNote(id, input.title, input.body, createdAt));
      return {
        ok: true,
        data: ctx.locale === 'ar'
          ? `حفظت المذكرة: «${input.title}». يمكنك حذفها لاحقًا من شاشة المذكرات.`
          : `Saved the note “${input.title}”. You can delete it anytime from Notes.`,
      };
    },
  };
}

function makeNotesList(deps: Phase1ToolDeps): ToolDefinition {
  return {
    name: 'notes.list',
    descriptionAr: 'يعرض أحدث مذكراتك المحفوظة على الجهاز.',
    descriptionEn: 'Shows your most recent saved notes on the device.',
    category: 'notes',
    mutating: false,
    parameters: { type: 'object', properties: {}, required: [] },
    async run(_args, ctx): Promise<ToolResult> {
      const notes = deps.getNotes ? deps.getNotes() : useNotesStore.getState().getNotes();
      return { ok: true, data: summarizeNotes(notes, ctx.locale) };
    },
  };
}

/** Builds the Phase-1 registry; deps override note persistence in tests. */
export function makePhase1Registry(deps: Phase1ToolDeps = {}): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(timeNow);
  registry.register(modelInfo);
  registry.register(makeNotesCreate(deps));
  registry.register(makeNotesList(deps));
  return registry;
}
