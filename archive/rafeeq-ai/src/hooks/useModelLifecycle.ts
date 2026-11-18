// Copyright (c) 2026 DRS AI. All rights reserved.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { addTrimMemoryListener, getMemoryInfo } from '../../modules/rafeeq-memory';
import { shouldReleaseModel } from '../llm/lifecycle';
import { useChatStore } from '../store/chatStore';
import { useLlmStore } from '../store/llmStore';

/**
 * Releases the loaded model when the app is in the background and the OS signals memory
 * pressure (Android onTrimMemory / RN memoryWarning). Mount once at the root.
 */
export function useModelLifecycle() {
  useEffect(() => {
    let appState: string = AppState.currentState ?? 'unknown';
    let trimLevel: number | null = null;
    let memoryWarning = false;

    const evaluate = () => {
      const llm = useLlmStore.getState();
      const release = shouldReleaseModel({
        appState,
        trimLevel,
        memoryWarning,
        lowMemory: getMemoryInfo()?.lowMemory ?? false,
        generating: useChatStore.getState().generating,
        modelLoaded: llm.status === 'ready',
      });
      if (release) {
        void (async () => {
          await useChatStore.getState().stopGeneration();
          await useChatStore.getState().cancelBackgroundPasses();
          await useLlmStore.getState().release();
        })();
      }
    };

    const stateSub = AppState.addEventListener('change', (next) => {
      appState = next;
      if (next === 'active') {
        trimLevel = null;
        memoryWarning = false;
      } else {
        evaluate();
      }
    });
    const warnSub = AppState.addEventListener('memoryWarning', () => {
      memoryWarning = true;
      evaluate();
    });
    const trimSub = addTrimMemoryListener((level) => {
      trimLevel = Math.max(trimLevel ?? 0, level);
      evaluate();
    });
    return () => {
      stateSub.remove();
      warnSub.remove();
      trimSub.remove();
    };
  }, []);
}
