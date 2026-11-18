// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Local notes — the first mutating capability the agent owns. Records live in
 * the on-device KV store (SQLite-backed), never leave the phone, and the pure
 * helpers here (normalize / cap / summarize) are what the tools call, so the
 * whole feature is table-driven testable without a device.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';

export interface NoteRecord {
  id: string;
  title: string;
  body: string;
  createdAt: number;
}

export const NOTES_STORAGE_KEY = 'rafeeq.notes.v1';
/** Oldest notes fall off the shelf beyond this cap. */
export const NOTES_CAP = 200;
export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 2000;

export type NoteInput = { ok: true; title: string; body: string } | { ok: false; error: string };

/**
 * Trims and caps a note's fields. Over-long input is CAPPED, not rejected —
 * a small model cannot count characters, and a rejected call would fail the
 * whole step; the shelf keeps tidy records either way. Only a missing title
 * and a wrong body type are rejected.
 */
export function normalizeNoteInput(title: unknown, body: unknown): NoteInput {
  if (typeof title !== 'string' || title.trim().length === 0) return { ok: false, error: 'NOTE_TITLE_REQUIRED' };
  if (body !== undefined && body !== null && typeof body !== 'string') return { ok: false, error: 'NOTE_BODY_TYPE' };
  const safeBody = typeof body === 'string' ? body.trim() : '';
  return { ok: true, title: title.trim().slice(0, NOTE_TITLE_MAX), body: safeBody.slice(0, NOTE_BODY_MAX) };
}

/** Newest first, capped. Pure so the tools and tests share one rule. */
export function capNotes(notes: readonly NoteRecord[]): NoteRecord[] {
  return [...notes].sort((a, b) => b.createdAt - a.createdAt).slice(0, NOTES_CAP);
}

export function makeNote(id: string, title: string, body: string, createdAt: number): NoteRecord {
  return { id, title, body, createdAt };
}

const DATE_LOCALE = { ar: 'ar-SA', en: 'en-GB' } as const;

/** Renders the note list as the tool's observation text (never raw JSON). */
export function summarizeNotes(notes: readonly NoteRecord[], locale: 'ar' | 'en', max = 10): string {
  if (notes.length === 0) {
    return locale === 'ar' ? 'لا توجد مذكرات محفوظة.' : 'No saved notes.';
  }
  return notes
    .slice(0, max)
    .map((n, i) => {
      const when = new Date(n.createdAt).toLocaleString(DATE_LOCALE[locale]);
      const body = n.body ? ` — ${n.body}` : '';
      return `${i + 1}. ${n.title}${body} (${when})`;
    })
    .join('\n');
}

type NotesState = {
  notes: NoteRecord[];
  addNote: (note: NoteRecord) => void;
  getNotes: () => NoteRecord[];
  deleteNote: (id: string) => void;
  clearNotes: () => void;
};

/** KV-backed notes shelf; the notes tools read and write through it. */
export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: [],
      addNote: (note) => set((s) => ({ notes: capNotes([note, ...s.notes]) })),
      getNotes: () => get().notes,
      deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      clearNotes: () => set({ notes: [] }),
    }),
    { name: NOTES_STORAGE_KEY, storage: createJSONStorage(() => kvStorage), version: 1 },
  ),
);
