// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../../storage/kv';
import { useLlmStore } from '../../store/llmStore';
import { trimUsage, type UsageEntry, type UsageKind } from './records';

/**
 * The on-device usage log backing the stats dashboard: one appended entry per
 * finished engine run, capped, persisted, nothing ever leaving the phone. The
 * model id comes from the live engine state, so a background pass (variants,
 * suggestions, summary) and a chat turn are all attributed correctly.
 */
type UsageStoreState = {
  entries: readonly UsageEntry[];
  /** Appends one finished run (no-op when no model is loaded). */
  record: (kind: UsageKind, opts?: { tokens?: number | null; ms?: number | null; at?: number; modelId?: string | null }) => void;
  clear: () => void;
};

export const USAGE_STORAGE_KEY = 'rafeeq.model.usage.v1';

export const useUsageStore = create<UsageStoreState>()(
  persist(
    (set) => ({
      entries: [],
      record: (kind, opts = {}) => {
        const modelId = opts.modelId !== undefined ? opts.modelId : useLlmStore.getState().loadedModelId;
        if (!modelId) return;
        const entry: UsageEntry = {
          modelId,
          kind,
          at: opts.at ?? Date.now(),
          tokens: opts.tokens ?? null,
          ms: opts.ms ?? null,
        };
        set((s) => ({ entries: trimUsage([...s.entries, entry]) }));
      },
      clear: () => set({ entries: [] }),
    }),
    {
      name: USAGE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);

/**
 * One-liner the engine pass sites call right after a completion: measures the
 * run's wall-clock length from `startedAt` and files the entry under the
 * currently loaded model.
 */
export function recordEngineRun(kind: UsageKind, startedAt: number, tokens: number | null): void {
  useUsageStore.getState().record(kind, { tokens, ms: Math.max(0, Date.now() - startedAt) });
}
