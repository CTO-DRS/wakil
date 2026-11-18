// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';

import i18n from '../i18n';
import { notify } from './dialogStore';
import { useModelStore } from './modelStore';

/**
 * Pure transition check: did any model move from downloading/paused to
 * downloaded between two file snapshots? Returns the finished model's name
 * (its id when unnamed), or null when nothing just completed — initial disk
 * syncs and re-checks of already-downloaded files never celebrate.
 */
export function detectDownloadCompleted(
  prev: Record<string, { status: string } | undefined>,
  next: Record<string, { status: string } | undefined>,
  nameOf: (id: string) => string | undefined,
): string | null {
  for (const id of Object.keys(next)) {
    const before = prev[id]?.status;
    const now = next[id]?.status;
    if (now === 'downloaded' && (before === 'downloading' || before === 'paused')) return nameOf(id) ?? id;
  }
  return null;
}

type DownloadCelebrateState = {
  /** Model name of the most recently finished download; null when dismissed. */
  justCompleted: string | null;
  /** Whether the Models tab currently owns the screen (banner instead of popup). */
  modelsScreenVisible: boolean;
  /** The model the popup already fired for — one notice per completion per session. */
  notifiedFor: string | null;
  setModelsScreenVisible: (visible: boolean) => void;
  markCompleted: (name: string) => void;
  dismiss: () => void;
};

export const useDownloadCelebrateStore = create<DownloadCelebrateState>()((set, get) => ({
  justCompleted: null,
  modelsScreenVisible: false,
  notifiedFor: null,
  setModelsScreenVisible: (visible) => set({ modelsScreenVisible: visible }),
  markCompleted: (name) => {
    set({ justCompleted: name });
    // The in-card banner covers a user already watching the Models screen;
    // anyone elsewhere in the app gets the notification right away.
    if (!get().modelsScreenVisible && get().notifiedFor !== name) {
      set({ notifiedFor: name });
      notify(i18n.t('models.doneNotifyTitle'), i18n.t('models.doneNotifyBody', { name }), i18n.t('common.ok'));
    }
  },
  dismiss: () => set({ justCompleted: null }),
}));

/** Subscribes to model file transitions for the whole app session. Returns the unsubscriber. */
export function startDownloadCelebrationWatch(): () => void {
  return useModelStore.subscribe((state, prevState) => {
    const name = detectDownloadCompleted(prevState.files, state.files, (id) => useModelStore.getState().getModel(id)?.name);
    if (name) useDownloadCelebrateStore.getState().markCompleted(name);
  });
}
