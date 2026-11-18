// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { CATALOG, VOICE_MODELS } from '../models/catalog';
import { DownloadManager, type DownloadTransport, type StatePatch } from '../models/downloadManager';
import { customModelFromParsed, fetchRemoteMeta, parseHuggingFaceUrl } from '../models/huggingface';
import { localModelFromImport, planLocalImport } from '../models/localImport';
import i18n from '../i18n';
import { kvStorage } from '../storage/kv';
import type { ModelFileState, ModelInfo } from '../types';
import { modelBuildLabel, useModelHistoryStore, type ModelEventKind } from './modelHistoryStore';
import { useSettingsStore } from './settingsStore';

export const EMPTY_FILE_STATE: ModelFileState = {
  status: 'idle',
  bytesWritten: 0,
  totalBytes: 0,
  error: null,
  resumeState: null,
};

export type AddModelResult =
  | { ok: true; model: ModelInfo }
  | { ok: false; reason: 'invalid' | 'duplicate' | 'network'; message?: string };

export type LocalImportResult =
  | { ok: true; model: ModelInfo }
  | { ok: false; reason: 'invalid' | 'duplicate' | 'nospace' | 'failed'; message?: string };

type ModelState = {
  customModels: ModelInfo[];
  files: Record<string, ModelFileState>;
  allModels: () => ModelInfo[];
  getModel: (id: string) => ModelInfo | undefined;
  fileState: (id: string) => ModelFileState;
  downloadedModels: () => ModelInfo[];
  localPath: (id: string) => string | null;
  /** Reconciles persisted state with the files actually on disk. Call once at startup. */
  syncWithDisk: () => void;
  /** Resumes downloads the app interrupted (not ones the user paused). Returns the count. */
  resumeAutoDownloads: () => number;
  /** Re-decides the models root, migrates files if needed, then syncs + auto-resumes. */
  reinitStorage: () => Promise<void>;
  startDownload: (id: string) => void;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  deleteModelFile: (id: string) => void;
  removeCustomModel: (id: string) => void;
  /** Merges custom models restored from a full backup; returns how many landed. */
  importCustomModels: (models: ModelInfo[]) => number;
  addFromUrl: (url: string, description: string, fetchImpl?: Parameters<typeof fetchRemoteMeta>[1]) => Promise<AddModelResult>;
  /** Registers a .gguf picked from device storage: copy into the models dir, hash, add as custom. */
  addFromLocalFile: (sourceUri: string, pickedName: string, pickedSize: number) => Promise<LocalImportResult>;
  applyPatch: (id: string, patch: StatePatch) => void;
};

/** Appends one line to the persisted download/version log (fire and forget). */
function recordModelEvent(model: ModelInfo, kind: ModelEventKind, sizeBytes?: number): void {
  useModelHistoryStore.getState().record({
    modelId: model.id,
    modelName: model.name,
    kind,
    build: modelBuildLabel(model),
    sizeBytes: sizeBytes ?? model.sizeBytes,
  });
}

let transport: DownloadTransport | null = null;
let manager: DownloadManager | null = null;

/** Overrides the platform transport (tests) — resets the manager. */
export function setDownloadTransport(t: DownloadTransport | null) {
  transport = t;
  manager = null;
}

function getTransport(): DownloadTransport {
  if (!transport) {
    // Lazy require keeps expo-file-system and the native module out of module init
    // (and out of unit tests). Fast (multi-connection) transfers are used when the
    // setting is on and the native module is linked; otherwise expo-file-system.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAppTransport } = require('../models/fastTransport') as typeof import('../models/fastTransport');
    transport = createAppTransport({
      fastEnabled: () => useSettingsStore.getState().fastDownload,
      connections: () => useSettingsStore.getState().downloadConnections,
      title: () => i18n.t('models.downloadNotification'),
    });
  }
  return transport;
}

function getManager(): DownloadManager {
  if (!manager) {
    manager = new DownloadManager(getTransport(), (id, patch) => useModelStore.getState().applyPatch(id, patch));
  }
  return manager;
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      customModels: [],
      files: {},

      allModels: () => [...CATALOG, ...VOICE_MODELS, ...get().customModels],
      getModel: (id) => get().allModels().find((m) => m.id === id),
      fileState: (id) => get().files[id] ?? EMPTY_FILE_STATE,
      /** The LLM picker everywhere uses this; voice models never load into llama. */
      downloadedModels: () =>
        get()
          .allModels()
          .filter((m) => m.source !== 'voice' && get().fileState(m.id).status === 'downloaded'),
      localPath: (id) => {
        const m = get().getModel(id);
        if (!m || get().fileState(id).status !== 'downloaded') return null;
        return getManager().localPath(m);
      },

      applyPatch: (id, patch) => {
        set((s) => {
          // Speed only means something while bytes are flowing.
          const extra = patch.status && patch.status !== 'downloading' ? { speedBps: 0 } : {};
          return { files: { ...s.files, [id]: { ...(s.files[id] ?? EMPTY_FILE_STATE), ...patch, ...extra } } };
        });
        // The log records completed transfers only: pauses, cancels and errors
        // stay out of it (syncWithDisk also bypasses applyPatch on purpose).
        if (patch.status === 'downloaded') {
          const m = get().getModel(id);
          if (m) recordModelEvent(m, 'download', patch.totalBytes);
        }
      },

      syncWithDisk: () => {
        const mgr = getManager();
        const next: Record<string, ModelFileState> = {};
        for (const m of get().allModels()) {
          const cur = get().files[m.id] ?? EMPTY_FILE_STATE;
          if (mgr.isDownloaded(m)) {
            next[m.id] = { ...cur, status: 'downloaded', error: null, resumeState: null, autoResume: false };
          } else if (cur.status === 'downloading') {
            // The app was killed mid-transfer: become paused when a resume is
            // possible (a fast download's on-disk sidecar is newer than any
            // state saved at pause time), else idle. Marked auto-resumable —
            // this pause was never the user's choice.
            const recovered = mgr.recoverResumeState(m);
            const resumeState = recovered ?? cur.resumeState;
            next[m.id] = resumeState
              ? { ...cur, status: 'paused', resumeState, speedBps: 0, autoResume: true }
              : { ...EMPTY_FILE_STATE, totalBytes: m.sizeBytes };
          } else if (cur.status === 'paused') {
            // A deliberate user pause survives the restart exactly as left:
            // never auto-resumed, no matter what a sidecar offers.
            next[m.id] = { ...cur, speedBps: 0 };
          } else if (cur.status === 'downloaded') {
            next[m.id] = { ...EMPTY_FILE_STATE, totalBytes: m.sizeBytes };
          } else {
            next[m.id] = cur;
          }
        }
        set({ files: next });
      },

      resumeAutoDownloads: () => {
        let resumed = 0;
        for (const [id, f] of Object.entries(get().files)) {
          // Only interruptions the app created resume themselves; a deliberate
          // user pause never turns into a surprise download.
          if (f.status !== 'paused' || !f.autoResume || !f.resumeState) continue;
          if (getManager().isActive(id)) continue;
          const m = get().getModel(id);
          if (!m) continue;
          get().resumeDownload(id);
          resumed += 1;
        }
        return resumed;
      },

      reinitStorage: async () => {
        // Lazy require keeps expo-file-system and the native module out of module
        // init (and out of unit tests), mirroring the transport pattern above.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const storage = require('../models/publicStorage') as typeof import('../models/publicStorage');
        const root = await storage.initModelsRoot();
        if (root === 'public') {
          await storage.migrateIntoActiveRoot(get().allModels().map((m) => m.fileName));
        }
        get().syncWithDisk();
        get().resumeAutoDownloads();
      },

      startDownload: (id) => {
        const m = get().getModel(id);
        if (!m) return;
        try {
          void getManager().start(m);
        } catch (e) {
          get().applyPatch(id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
        }
      },
      pauseDownload: (id) => getManager().pause(id),
      resumeDownload: (id) => {
        const m = get().getModel(id);
        if (!m) return;
        try {
          void getManager().resume(m, get().fileState(id).resumeState);
        } catch (e) {
          get().applyPatch(id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
        }
      },
      cancelDownload: (id) => {
        const m = get().getModel(id);
        if (m) getManager().cancel(m);
      },
      deleteModelFile: (id) => {
        const m = get().getModel(id);
        if (!m) return;
        getManager().deleteFile(m);
        recordModelEvent(m, 'deleted');
      },
      removeCustomModel: (id) => {
        const m = get().customModels.find((x) => x.id === id);
        if (!m) return;
        getManager().deleteFile(m);
        set((s) => {
          const files = { ...s.files };
          delete files[id];
          return { customModels: s.customModels.filter((x) => x.id !== id), files };
        });
        recordModelEvent(m, 'deleted');
      },

      importCustomModels: (models) => {
        // Double-check inside the store too: ids and download URLs must both
        // stay unique against the catalog, the voice list and existing customs.
        const knownIds = new Set(get().allModels().map((m) => m.id));
        const knownUrls = new Set(get().allModels().map((m) => m.url));
        const fresh: ModelInfo[] = [];
        for (const m of models) {
          if (knownIds.has(m.id) || knownUrls.has(m.url)) continue;
          knownIds.add(m.id);
          knownUrls.add(m.url);
          fresh.push(m);
        }
        if (fresh.length > 0) set((s) => ({ customModels: [...s.customModels, ...fresh] }));
        return fresh.length;
      },

      addFromUrl: async (url, description, fetchImpl) => {
        const parsed = parseHuggingFaceUrl(url);
        if (!parsed) return { ok: false, reason: 'invalid' };
        const existing = get().allModels().find((m) => m.url === parsed.downloadUrl);
        if (existing) return { ok: false, reason: 'duplicate' };
        let meta: Awaited<ReturnType<typeof fetchRemoteMeta>> = { size: 0, sha256: null };
        try {
          meta = await fetchRemoteMeta(parsed.downloadUrl, fetchImpl);
        } catch (e) {
          return { ok: false, reason: 'network', message: e instanceof Error ? e.message : String(e) };
        }
        const model = customModelFromParsed(parsed, meta.size, description, meta.sha256);
        if (get().allModels().some((m) => m.id === model.id)) return { ok: false, reason: 'duplicate' };
        set((s) => ({ customModels: [...s.customModels, model] }));
        recordModelEvent(model, 'added', meta.size);
        return { ok: true, model };
      },

      addFromLocalFile: async (sourceUri, pickedName, pickedSize) => {
        const existing = get().allModels();
        const plan = planLocalImport({
          pickedName,
          pickedSize,
          existingFileNames: existing.map((m) => m.fileName),
          freeBytes: getTransport().freeDiskBytes(),
        });
        if (!plan.ok) return { ok: false, reason: plan.reason };
        const t = getTransport();
        try {
          // Lazy require keeps expo-file-system out of module init (and out of unit
          // tests), mirroring the transport pattern above.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const native = require('../models/localImportNative') as typeof import('../models/localImportNative');
          const finalPath = await native.copyPickedIntoModelsDir(sourceUri, plan.targetFileName);
          const sha = await native.hashImportedModel(finalPath);

          // The exact same content is already registered: drop the fresh copy.
          if (sha && existing.some((m) => m.sha256 === sha && (m.sizeBytes === pickedSize || m.sizeBytes === 0))) {
            t.remove(finalPath);
            return { ok: false, reason: 'duplicate' };
          }

          const model = localModelFromImport(plan.targetFileName, plan.displayName, pickedSize, sha, plan.kind);
          if (get().allModels().some((m) => m.id === model.id || m.url === model.url)) {
            t.remove(finalPath);
            return { ok: false, reason: 'duplicate' };
          }

          // Bypasses applyPatch on purpose: an import is logged as 'added', not 'downloaded'.
          set((s) => ({
            customModels: [...s.customModels, model],
            files: {
              ...s.files,
              [model.id]: { ...EMPTY_FILE_STATE, status: 'downloaded', bytesWritten: pickedSize, totalBytes: pickedSize },
            },
          }));
          recordModelEvent(model, 'added', pickedSize);
          return { ok: true, model };
        } catch (e) {
          return { ok: false, reason: 'failed', message: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
    {
      name: 'rafeeq.models.v1',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ customModels: s.customModels, files: s.files }),
    },
  ),
);
