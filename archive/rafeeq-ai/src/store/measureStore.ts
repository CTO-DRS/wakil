// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The measure lab's store: which protocol session is running, its sampled
 * rows, and the finished session each summary is computed from. Rows come
 * from the native probe one call at a time — the store never samples on its
 * own (the screen owns the timer, so tests inject samples directly) — and
 * everything persists locally like the rest of the app: no row ever leaves
 * the phone. This is what turns the Phase-5 measurement tables from an adb
 * script into a one-tap, in-app lab.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MeasureSample } from '../../modules/rafeeq-measure';
import {
  MEASURE_ROWS_CAP,
  MEASURE_SESSION_IDS,
  computeSessionSummary,
  normalizeSample,
  type MeasureSessionId,
  type MeasureSessionSummary,
} from '../measure/session';
import { kvStorage } from '../storage/kv';

export const MEASURE_STORAGE_KEY = 'rafeeq.measure.v1';

export interface StoredMeasureSession {
  id: MeasureSessionId;
  startedAt: number;
  endedAt: number | null;
  rows: MeasureSample[];
}

interface MeasureState {
  active: StoredMeasureSession | null;
  sessions: Record<MeasureSessionId, StoredMeasureSession | null>;
  /** Starts a session; false when another one is already running. */
  begin: (id: MeasureSessionId, now: number) => boolean;
  /** Appends one (normalized) sample to the active session; null when none is running. */
  tick: (raw: unknown) => MeasureSample | null;
  /** Ends the active session and files it under its id. */
  finish: (now: number) => boolean;
  clear: (id: MeasureSessionId) => void;
  clearAll: () => void;
}

function emptySessions(): Record<MeasureSessionId, StoredMeasureSession | null> {
  return Object.fromEntries(MEASURE_SESSION_IDS.map((id) => [id, null])) as Record<
    MeasureSessionId,
    StoredMeasureSession | null
  >;
}

export const useMeasureStore = create<MeasureState>()(
  persist(
    (set, get) => ({
      active: null,
      sessions: emptySessions(),
      begin: (id, now) => {
        if (get().active) return false;
        set({ active: { id, startedAt: now, endedAt: null, rows: [] } });
        return true;
      },
      tick: (raw) => {
        const sample = normalizeSample(raw);
        const active = get().active;
        if (!sample || !active) return null;
        const rows = [...active.rows, sample].slice(-MEASURE_ROWS_CAP);
        set({ active: { ...active, rows } });
        return sample;
      },
      finish: (now) => {
        const active = get().active;
        if (!active) return false;
        set({ sessions: { ...get().sessions, [active.id]: { ...active, endedAt: now } }, active: null });
        return true;
      },
      clear: (id) => set({ sessions: { ...get().sessions, [id]: null } }),
      clearAll: () => set({ sessions: emptySessions() }),
    }),
    { name: MEASURE_STORAGE_KEY, storage: createJSONStorage(() => kvStorage) },
  ),
);

/** Summary for a stored session (finished or mid-run); null with no rows. */
export function sessionSummary(
  id: MeasureSessionId,
  sessions: Record<MeasureSessionId, StoredMeasureSession | null>,
): MeasureSessionSummary | null {
  const s = sessions[id];
  if (!s || s.rows.length === 0) return null;
  // The wall span (startedAt → endedAt) is the honest duration source: a
  // session that ran 30 real minutes reports 30 minutes even when the
  // screen-off stretch left few rows behind.
  return computeSessionSummary(id, s.rows, { startedAt: s.startedAt, endedAt: s.endedAt });
}
