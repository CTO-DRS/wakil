// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The measure lab's app-level driver. While a protocol session runs, the
 * sampler is owned here — not by the screen — so the S5 step (ask the morning
 * briefing in chat, then leave the screen off) no longer kills sampling by
 * unmounting the measure screen: the lab keeps sampling as long as the app
 * itself is foregrounded, on any screen.
 *
 * JS timers only run while the app is foregrounded, so a screen-off stretch
 * necessarily appears as a sampling gap; the session's wall duration is still
 * real and the summary discloses the gap as coverage. The session always ends
 * at its declared deadline: if the app is alive it auto-finishes (with a
 * notification); if the process was killed, the next foreground return — app
 * start or screen mount — reconciles the rehydrated session the same way.
 * Nothing samples in the background: every row is a real readNow() taken on a
 * due tick or a foreground reconcile.
 */

import { AppState } from 'react-native';

import { readDeviceSample } from '../../modules/rafeeq-measure';
import i18n from '../i18n';
import { notify } from '../store/dialogStore';
import { useMeasureStore, type StoredMeasureSession } from '../store/measureStore';
import { MEASURE_INTERVAL_SEC, MEASURE_SESSION_MINUTES, type MeasureSessionId } from './session';

/** A session ends at its declared length; the summary reports the wall span. */
export function measureDeadlineMs(active: Pick<StoredMeasureSession, 'id' | 'startedAt'>): number {
  return active.startedAt + MEASURE_SESSION_MINUTES[active.id] * 60_000;
}

export type ReconcileVerdict = 'finished' | 'ticked' | 'none';

/**
 * One reconciliation pass at `now`: a session past its declared deadline is
 * finished at that deadline (never at a later wall time — the protocol
 * defines the session as its declared length), otherwise one sample is taken
 * when the cadence is due. Safe to call from anywhere, any number of times.
 */
export function reconcileMeasure(now: number): ReconcileVerdict {
  const { active, finish, tick } = useMeasureStore.getState();
  if (!active) return 'none';
  const deadline = measureDeadlineMs(active);
  if (now >= deadline) {
    if (finish(deadline)) {
      notify(
        i18n.t('measure.title'),
        i18n.t('measure.autoFinished', { name: sessionLabel(active.id), minutes: MEASURE_SESSION_MINUTES[active.id] }),
        i18n.t('common.ok'),
      );
      return 'finished';
    }
    return 'none';
  }
  const lastRowMs = active.rows[active.rows.length - 1]?.tMs;
  if (lastRowMs === undefined || now - lastRowMs >= MEASURE_INTERVAL_SEC * 1000) {
    tick(readDeviceSample());
    return 'ticked';
  }
  return 'none';
}

function sessionLabel(id: MeasureSessionId): string {
  switch (id) {
    case 's1_idle':
      return i18n.t('measure.s1Idle');
    case 's2_chat':
      return i18n.t('measure.s2Chat');
    case 's3_agent':
      return i18n.t('measure.s3Agent');
    case 's4_voice':
      return i18n.t('measure.s4Voice');
    case 's5_briefing':
      return i18n.t('measure.s5Briefing');
  }
}

let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

function startLoop(): void {
  if (intervalId !== null) return;
  intervalId = setInterval(() => reconcileMeasure(Date.now()), MEASURE_INTERVAL_SEC * 1000);
}

function stopLoop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Wires the lab driver to the app: reconciles any rehydrated session once,
 * then keeps the cadence alive for as long as a session runs, and reconciles
 * on every foreground return (after a process kill or a screen-off stretch).
 * Idempotent — the app layout calls it once at startup.
 */
export function startMeasureController(): void {
  if (started) return;
  started = true;
  reconcileMeasure(Date.now());
  AppState.addEventListener('change', (status) => {
    if (status === 'active') reconcileMeasure(Date.now());
  });
  useMeasureStore.subscribe((state, prev) => {
    if (state.active && !prev.active) startLoop();
    if (!state.active && prev.active) stopLoop();
  });
  if (useMeasureStore.getState().active) startLoop();
}
