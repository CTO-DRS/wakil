// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Long-term memory — what Rafeeq remembers about you: your preferences, the
 * people in your life, your routines and plain facts you told it once. Every
 * record lives in the on-device KV store (SQLite-backed), never leaves the
 * phone, and the user can read, edit or delete every single one (the memory
 * screen). The pure helpers here (normalize / dedupe / cap / summarize) are
 * what the memory tools call, so the whole shelf is table-driven testable
 * without a device.
 *
 * Competition framing (Create AI Agents Championship): memory is what turns a
 * command executor into a personal agent — "remember that my father's number
 * is the one I call after Asr" — and privacy is the architecture: the memory
 * shelf is a local KV blob, user-owned, with a one-tap wipe.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';

/** The four kinds of things worth remembering about a person. */
export type MemoryKind = 'preference' | 'person' | 'routine' | 'fact';

export const MEMORY_KINDS: readonly MemoryKind[] = ['preference', 'person', 'routine', 'fact'];

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  /** One fact, stated the way the user would say it (Arabic in practice). */
  text: string;
  /** Who wrote it: the agent (memory.save) or the user (the memory screen). */
  source: 'agent' | 'user';
  createdAt: number;
  updatedAt: number;
}

export const MEMORY_STORAGE_KEY = 'rafeeq.agent.memory.v1';
/** Oldest memories fall off the shelf beyond this cap. */
export const MEMORY_CAP = 300;
export const MEMORY_TEXT_MAX = 500;

export type MemoryInput = { ok: true; text: string; kind: MemoryKind } | { ok: false; error: string };

/** Coerces a raw kind value into the enum, defaulting to 'fact'. */
export function normalizeMemoryKind(kind: unknown): MemoryKind {
  return MEMORY_KINDS.includes(kind as MemoryKind) ? (kind as MemoryKind) : 'fact';
}

/** Collapses whitespace runs into single spaces (the dedupe key's shape). */
export function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Trims and caps a memory's fields. Over-long text is CAPPED, not rejected —
 * a small model cannot count characters, and a rejected save would fail the
 * whole step; the shelf keeps tidy records either way. Only a missing text is
 * rejected.
 */
export function normalizeMemoryInput(text: unknown, kind: unknown): MemoryInput {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'MEMORY_TEXT_REQUIRED' };
  }
  return { ok: true, text: text.trim().slice(0, MEMORY_TEXT_MAX), kind: normalizeMemoryKind(kind) };
}

/**
 * Finds an existing record with the same whitespace-collapsed text — the
 * dedupe key. Saving "أحب القهوة بعد الفجر" twice updates one record instead
 * of stacking copies.
 */
export function findMemoryByText(memories: readonly MemoryRecord[], text: string): MemoryRecord | null {
  const key = collapseSpaces(text);
  if (!key) return null;
  return memories.find((m) => collapseSpaces(m.text) === key) ?? null;
}

/** Newest-updated first, capped. Pure so the tools and tests share one rule. */
export function capMemories(memories: readonly MemoryRecord[]): MemoryRecord[] {
  return [...memories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MEMORY_CAP);
}

export function makeMemory(id: string, kind: MemoryKind, text: string, source: 'agent' | 'user', now: number): MemoryRecord {
  return { id, kind, text, source, createdAt: now, updatedAt: now };
}

const KIND_LABELS_AR: Record<MemoryKind, string> = {
  preference: 'تفضيل',
  person: 'شخص',
  routine: 'عادة',
  fact: 'معلومة',
};
const KIND_LABELS_EN: Record<MemoryKind, string> = {
  preference: 'preference',
  person: 'person',
  routine: 'routine',
  fact: 'fact',
};

export function memoryKindLabel(kind: MemoryKind, locale: 'ar' | 'en'): string {
  return locale === 'ar' ? KIND_LABELS_AR[kind] : KIND_LABELS_EN[kind];
}

/** Renders the memory list as a tool's observation text (never raw JSON). */
export function summarizeMemories(memories: readonly MemoryRecord[], locale: 'ar' | 'en', max = 5): string {
  if (memories.length === 0) {
    return locale === 'ar' ? 'الذاكرة فارغة — لم أحفظ شيئًا بعد.' : 'The memory is empty — nothing saved yet.';
  }
  return memories
    .slice(0, max)
    .map((m, i) => {
      const kind = memoryKindLabel(m.kind, locale);
      return `${i + 1}. [${kind}] ${m.text} #${m.id}`;
    })
    .join('\n');
}

/**
 * Renders the retrieved-memories block injected into the planner/answer
 * prompts: short, bounded lines the small model can actually use.
 */
export function renderMemoryContext(ranked: readonly MemoryRecord[], locale: 'ar' | 'en', max = 3): string {
  if (ranked.length === 0) return '';
  const head = locale === 'ar' ? 'معلومات معروفة عن المستخدم (من الذاكرة المحلية):' : 'Known facts about the user (from local memory):';
  const lines = ranked.slice(0, max).map((m) => `- [${memoryKindLabel(m.kind, locale)}] ${m.text}`);
  return `${head}\n${lines.join('\n')}`;
}

type MemoryState = {
  memories: MemoryRecord[];
  addMemory: (record: MemoryRecord) => void;
  /** Inserts or refreshes by text-dedupe; the agent's save path. */
  upsertMemory: (record: MemoryRecord) => void;
  updateMemory: (id: string, patch: { text?: string; kind?: MemoryKind }) => boolean;
  deleteMemory: (id: string) => boolean;
  clearMemories: () => void;
  getMemories: () => MemoryRecord[];
};

/** KV-backed memory shelf; the memory tools and the memory screen share it. */
export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      memories: [],
      addMemory: (record) => set((s) => ({ memories: capMemories([record, ...s.memories]) })),
      upsertMemory: (record) =>
        set((s) => {
          const existing = findMemoryByText(s.memories, record.text);
          if (existing) {
            // Same fact again: refresh text/kind/stamp, keep the original id.
            return {
              memories: capMemories(
                s.memories.map((m) =>
                  m.id === existing.id
                    ? { ...m, text: record.text, kind: record.kind, source: record.source, updatedAt: record.updatedAt }
                    : m,
                ),
              ),
            };
          }
          return { memories: capMemories([record, ...s.memories]) };
        }),
      updateMemory: (id, patch) => {
        const found = get().memories.some((m) => m.id === id);
        if (!found) return false;
        set((s) => ({
          memories: capMemories(
            s.memories.map((m) =>
              m.id === id
                ? {
                    ...m,
                    text: patch.text !== undefined ? collapseSpaces(patch.text).slice(0, MEMORY_TEXT_MAX) : m.text,
                    kind: patch.kind !== undefined ? normalizeMemoryKind(patch.kind) : m.kind,
                    updatedAt: Date.now(),
                  }
                : m,
            ),
          ),
        }));
        return true;
      },
      deleteMemory: (id) => {
        const found = get().memories.some((m) => m.id === id);
        if (!found) return false;
        set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
        return true;
      },
      clearMemories: () => set({ memories: [] }),
      getMemories: () => get().memories,
    }),
    { name: MEMORY_STORAGE_KEY, storage: createJSONStorage(() => kvStorage), version: 1 },
  ),
);
