// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Device from 'expo-device';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { getMemoryInfo } from '../../modules/rafeeq-memory';
import { checkRam } from '../models/resources';
import { useChatStore } from '../store/chatStore';
import { confirmDialog, notify } from '../store/dialogStore';
import { useLlmStore } from '../store/llmStore';
import { useModelStore } from '../store/modelStore';
import { useSettingsStore } from '../store/settingsStore';
import { formatBytes } from '../utils/format';

/** Free RAM in bytes: live value from the native module, or a conservative guess from total RAM. */
export function availableRamBytes(): number | null {
  const info = getMemoryInfo();
  if (info) return info.availMem;
  const total = Device.totalMemory;
  return total ? total * 0.4 : null;
}

/** Returns a function that checks free RAM vs. model size, asks when tight, then loads. */
export function useModelLoader() {
  const { t } = useTranslation();

  return useCallback(
    async (modelId: string): Promise<boolean> => {
      const model = useModelStore.getState().getModel(modelId);
      const path = useModelStore.getState().localPath(modelId);
      if (!model || !path) return false;
      const nCtx = useSettingsStore.getState().contextSize;
      const size = model.sizeBytes || useModelStore.getState().fileState(modelId).totalBytes;
      const ram = checkRam(size, nCtx, availableRamBytes());
      const vars = { needed: formatBytes(ram.needed), available: formatBytes(ram.available) };

      if (ram.verdict === 'insufficient') {
        notify(t('chat.noModel'), t('models.notEnoughRam', vars), t('common.ok'));
        return false;
      }
      if (ram.verdict === 'tight') {
        const proceed = await confirmDialog({
          title: t('chat.loadModel'),
          message: t('models.lowRamWarning', vars),
          confirmLabel: t('models.continue'),
          cancelLabel: t('common.cancel'),
        });
        if (!proceed) return false;
      }
      useSettingsStore.getState().setSelectedModelId(modelId);
      // Background passes borrow the same engine: settle them before swapping models.
      await useChatStore.getState().cancelBackgroundPasses();
      await useLlmStore.getState().loadModel(modelId, path, nCtx);
      return useLlmStore.getState().status === 'ready';
    },
    [t],
  );
}
