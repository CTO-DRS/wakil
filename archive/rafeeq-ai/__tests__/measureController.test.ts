// Copyright (c) 2026 DRS AI. All rights reserved.
import { initI18n } from '../src/i18n';
import { MEASURE_SESSION_MINUTES } from '../src/measure/session';
import {
  measureDeadlineMs,
  reconcileMeasure,
  type ReconcileVerdict,
} from '../src/measure/controller';
import { sessionSummary, useMeasureStore } from '../src/store/measureStore';

const T0 = 1_700_000_000_000;

// The probe stub stamps every sample with the reconcile moment under test.
let mockProbeNow = T0;

jest.mock('../modules/rafeeq-measure', () => ({
  readDeviceSample: () => ({
    tMs: mockProbeNow,
    batteryPct: 80,
    tempC: 36.0,
    powerMw: -4200,
    pssKb: 1_800_000,
    charging: false,
    thermal: 'none',
    deviceModel: 'Infinix GT 30',
  }),
  hasNativeMeasure: () => true,
}));

function reset() {
  useMeasureStore.getState().clearAll();
  useMeasureStore.setState({ active: null });
}

describe('measure controller', () => {
  beforeAll(() => {
    initI18n('en');
  });
  beforeEach(reset);

  it('every session ends at its declared 30-minute deadline', () => {
    for (const id of Object.keys(MEASURE_SESSION_MINUTES) as (keyof typeof MEASURE_SESSION_MINUTES)[]) {
      expect(measureDeadlineMs({ id, startedAt: T0 })).toBe(T0 + MEASURE_SESSION_MINUTES[id] * 60_000);
    }
  });

  it('does nothing when no session runs', () => {
    expect(reconcileMeasure(T0 + 60_000)).toBe<ReconcileVerdict>('none');
    expect(useMeasureStore.getState().active).toBeNull();
  });

  it('samples the due tick while a session runs in its window', () => {
    useMeasureStore.getState().begin('s4_voice', T0);
    mockProbeNow = T0 + 1_000;
    expect(reconcileMeasure(T0 + 1_000)).toBe<ReconcileVerdict>('ticked');
    expect(useMeasureStore.getState().active?.rows.length).toBe(1);
    // cadence not due yet: nothing appended
    mockProbeNow = T0 + 2_000;
    expect(reconcileMeasure(T0 + 2_000)).toBe<ReconcileVerdict>('none');
    expect(useMeasureStore.getState().active?.rows.length).toBe(1);
    // 30 s after the last row: due again
    mockProbeNow = T0 + 31_000;
    expect(reconcileMeasure(T0 + 31_000)).toBe<ReconcileVerdict>('ticked');
    expect(useMeasureStore.getState().active?.rows.length).toBe(2);
  });

  it('auto-finishes a past-deadline session at the deadline itself', () => {
    useMeasureStore.getState().begin('s5_briefing', T0);
    mockProbeNow = T0;
    useMeasureStore.getState().tick({ tMs: T0, batteryPct: 94, tempC: 33, powerMw: null, pssKb: 340_992, charging: false, thermal: 'none', deviceModel: 'Infinix GT 30' });
    // the app slept through the screen-off stretch and returns 2 hours late
    mockProbeNow = T0 + 7_200_000;
    expect(reconcileMeasure(T0 + 7_200_000)).toBe<ReconcileVerdict>('finished');
    const state = useMeasureStore.getState();
    expect(state.active).toBeNull();
    const stored = state.sessions.s5_briefing;
    expect(stored?.endedAt).toBe(T0 + 1_800_000); // the deadline, never a later wall time
    const summary = sessionSummary('s5_briefing', state.sessions);
    expect(summary?.durationSec).toBe(1800);
    expect(summary?.coveragePct).toBe(0);
  });

  it('leaves an in-window session running for the next reconcile', () => {
    useMeasureStore.getState().begin('s1_idle', T0);
    mockProbeNow = T0;
    useMeasureStore.getState().tick({ tMs: T0, batteryPct: 90, tempC: 35, powerMw: null, pssKb: 300_000, charging: false, thermal: 'none', deviceModel: null });
    mockProbeNow = T0 + 61_000;
    expect(reconcileMeasure(T0 + 61_000)).toBe<ReconcileVerdict>('ticked');
    expect(useMeasureStore.getState().active?.id).toBe('s1_idle');
    expect(useMeasureStore.getState().active?.rows.length).toBe(2);
  });
});
