// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';

import { LlamaRnEngine, type LlmEngine } from '../llm/engine';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

type LlmState = {
  status: EngineStatus;
  loadedModelId: string | null;
  loadedContextSize: number | null;
  error: string | null;
  loadModel: (modelId: string, modelPath: string, nCtx: number) => Promise<void>;
  release: () => Promise<void>;
};

let engine: LlmEngine | null = null;

export function getEngine(): LlmEngine {
  if (!engine) engine = new LlamaRnEngine();
  return engine;
}

/** Overrides the engine (tests). */
export function setEngine(e: LlmEngine | null) {
  engine = e;
}

export const useLlmStore = create<LlmState>()((set, get) => ({
  status: 'idle',
  loadedModelId: null,
  loadedContextSize: null,
  error: null,

  loadModel: async (modelId, modelPath, nCtx) => {
    if (get().status === 'loading') return;
    if (get().status === 'ready' && get().loadedModelId === modelId && get().loadedContextSize === nCtx) return;
    set({ status: 'loading', error: null });
    try {
      await getEngine().load(modelPath, { nCtx });
      set({ status: 'ready', loadedModelId: modelId, loadedContextSize: nCtx });
    } catch (e) {
      set({
        status: 'error',
        loadedModelId: null,
        loadedContextSize: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  release: async () => {
    try {
      await getEngine().release();
    } finally {
      set({ status: 'idle', loadedModelId: null, loadedContextSize: null });
    }
  },
}));
