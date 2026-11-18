// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The user trial's on-device diary store: one counters-only entry per local
 * day, the end-of-week SUS answers, and the nightly reminder switch. The
 * researcher never reads content because none is stored — the export button
 * hands the participant their own CSV to share if and when they choose to.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { SUS_STATEMENTS, type DiaryEntry } from '../trial/diary';
import { kvStorage } from '../storage/kv';

export const TRIAL_STORAGE_KEY = 'rafeeq.trial.v1';

function emptySus(): (number | null)[] {
  return Array.from({ length: SUS_STATEMENTS }, () => null);
}

interface TrialState {
  entries: Record<string, DiaryEntry>;
  sus: (number | null)[];
  reminderEnabled: boolean;
  /** The scheduled nightly-diary notification id (for cancel-on-disable). */
  scheduledId: string | null;
  saveEntry: (entry: DiaryEntry) => void;
  deleteEntry: (dateKey: string) => void;
  setSusAnswer: (index: number, value: number) => void;
  setReminder: (enabled: boolean, scheduledId: string | null) => void;
  clearWeek: () => void;
}

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      entries: {},
      sus: emptySus(),
      reminderEnabled: false,
      scheduledId: null,
      saveEntry: (entry) => set({ entries: { ...get().entries, [entry.dateKey]: entry } }),
      deleteEntry: (dateKey) => {
        const next = { ...get().entries };
        delete next[dateKey];
        set({ entries: next });
      },
      setSusAnswer: (index, value) => {
        if (index < 0 || index >= SUS_STATEMENTS) return;
        const v = Math.min(5, Math.max(1, Math.round(value)));
        const sus = [...get().sus];
        sus[index] = v;
        set({ sus });
      },
      setReminder: (enabled, scheduledId) => set({ reminderEnabled: enabled, scheduledId }),
      clearWeek: () => set({ entries: {}, sus: emptySus() }),
    }),
    { name: TRIAL_STORAGE_KEY, storage: createJSONStorage(() => kvStorage) },
  ),
);
