// Copyright (c) 2026 DRS AI. All rights reserved.
import { useShallow } from 'zustand/react/shallow';

import { useModelStore } from '../store/modelStore';
import { useSettingsStore } from '../store/settingsStore';
import type { DownloadStatus } from '../types';
import { progressRatio } from '../utils/format';

export type ActiveDownload = { id: string; name: string; ratio: number; status: DownloadStatus } | null;

/** The download in progress (or paused), preferring the user's selected model. */
export function useActiveDownload(): ActiveDownload {
  const selected = useSettingsStore((s) => s.selectedModelId);
  return useModelStore(
    useShallow((s): ActiveDownload => {
      const ids = Object.keys(s.files).filter((id) => {
        const st = s.files[id]?.status;
        return st === 'downloading' || st === 'paused';
      });
      if (ids.length === 0) return null;
      const id = selected && ids.includes(selected) ? selected : ids[0];
      const f = s.files[id];
      const model = s.getModel(id);
      const total = f.totalBytes || model?.sizeBytes || 0;
      return { id, name: model?.name ?? id, ratio: progressRatio(f.bytesWritten, total), status: f.status };
    }),
  );
}

