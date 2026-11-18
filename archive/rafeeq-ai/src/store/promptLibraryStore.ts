// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';
import { newId, titleFromMessage } from '../utils/format';
import { MAX_PROMPTS, PROMPT_BODY_MAX, PROMPT_TITLE_MAX } from '../utils/promptLimits';

export type PromptItem = {
  id: string;
  /** Display name; derived from the body when the user leaves it empty. */
  title: string;
  body: string;
  createdAt: number;
};

type PromptLibraryState = {
  /** Saved prompts, newest first. Persisted. */
  items: PromptItem[];
  /** Saves a prompt; returns it, or null when the body is empty or the library is full. */
  add: (body: string, title?: string) => PromptItem | null;
  /** Edits title/body in place (the order never reshuffles); false for unknown ids. */
  update: (id: string, patch: { title?: string; body?: string }) => boolean;
  /** Deletes a prompt; unknown ids are a no-op. */
  remove: (id: string) => void;
  /** Inserts pre-planned items from a backup on top of the list; returns the count added. */
  importItems: (incoming: PromptItem[]) => number;
};

const cleanBody = (body: string) => body.trim().slice(0, PROMPT_BODY_MAX);

/**
 * The prompt library: reusable message texts kept on this device only, so a
 * message typed once can be re-inserted with one tap. Like the PIN lock store
 * this rides on the sqlite kv storage — no cloud, no accounts.
 */
export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set, get) => ({
      items: [],

      add: (body, title) => {
        const clean = cleanBody(body);
        if (!clean) return null;
        if (get().items.length >= MAX_PROMPTS) return null;
        const item: PromptItem = {
          id: newId('p_'),
          title: (title ?? '').trim().slice(0, PROMPT_TITLE_MAX) || titleFromMessage(clean, 40),
          body: clean,
          createdAt: Date.now(),
        };
        set({ items: [item, ...get().items] });
        return item;
      },

      update: (id, patch) => {
        // A prompt without a body is not a prompt: reject instead of truncating.
        if (patch.body !== undefined && !patch.body.trim()) return false;
        const body = patch.body !== undefined ? cleanBody(patch.body) : null;
        if (patch.body === undefined && patch.title === undefined) return false;
        let found = false;
        const items = get().items.map((item) => {
          if (item.id !== id) return item;
          found = true;
          const nextBody = body ?? item.body;
          const title =
            patch.title !== undefined
              ? patch.title.trim().slice(0, PROMPT_TITLE_MAX) || titleFromMessage(nextBody, 40)
              : item.title;
          return { ...item, title, body: nextBody };
        });
        if (!found) return false;
        set({ items });
        return true;
      },

      remove: (id) => set({ items: get().items.filter((item) => item.id !== id) }),

      // Items arrive pre-validated, deduped and capped by planPromptImport in
      // utils/backup — the store only inserts them, newest-first order intact.
      importItems: (incoming) => {
        if (incoming.length === 0) return 0;
        set((s) => ({ items: [...incoming, ...s.items] }));
        return incoming.length;
      },
    }),
    {
      name: 'rafeeq.prompts.v1',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);

/**
 * Pure merge for inserting a saved prompt into the composer: an empty (or
 * whitespace-only) draft is replaced outright, otherwise the prompt lands on
 * its own line below whatever the user already typed.
 */
export function insertPromptIntoDraft(draft: string, body: string): string {
  const prompt = body.trim();
  if (!prompt) return draft;
  const base = draft.trimEnd();
  if (!base) return prompt;
  return `${base}\n${prompt}`;
}
