// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';
import type { ModelInfo } from '../types';

/** Kinds of model events kept in the on-device log. */
export type ModelEventKind = 'download' | 'deleted' | 'added';

export type ModelEvent = {
  id: string;
  modelId: string;
  modelName: string;
  kind: ModelEventKind;
  /** Build identity of the exact file (params · quant), empty when unknown. */
  build: string;
  /** File size in bytes; 0 when unknown. */
  sizeBytes: number;
  /** Epoch ms when the event happened. */
  at: number;
};

/** The log stays bounded on-device: the newest events win. */
export const MODEL_HISTORY_CAP = 100;

/** Pure append that keeps the log newest-first and capped (table-driven tested). */
export function appendEvent(events: ModelEvent[], event: ModelEvent, cap = MODEL_HISTORY_CAP): ModelEvent[] {
  return [event, ...events].slice(0, cap);
}

/** Human-facing build identity of a model file, e.g. "0.5B · Q4_K_M". */
export function modelBuildLabel(model: Pick<ModelInfo, 'params' | 'quant'>): string {
  return [model.params, model.quant].filter(Boolean).join(' · ');
}

let nextSeq = 0;

type ModelHistoryState = {
  events: ModelEvent[];
  /** Records one model event; id and time are assigned here. */
  record: (event: Omit<ModelEvent, 'id' | 'at'>) => void;
  /** Wipes the log; model files themselves are untouched. */
  clear: () => void;
};

export const useModelHistoryStore = create<ModelHistoryState>()(
  persist(
    (set) => ({
      events: [],
      record: (event) =>
        set((s) => ({
          events: appendEvent(s.events, { ...event, id: `ev-${Date.now()}-${nextSeq++}`, at: Date.now() }),
        })),
      clear: () => set({ events: [] }),
    }),
    {
      name: 'rafeeq.modelHistory.v1',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ events: s.events }),
    },
  ),
);
