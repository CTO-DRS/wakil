// Copyright (c) 2026 DRS AI. All rights reserved.
import { MEASURE_ROWS_CAP } from '../src/measure/session';
import { sessionSummary, useMeasureStore } from '../src/store/measureStore';

const T0 = 1_700_000_000_000;

function goodSample(dtSec: number) {
  return {
    tMs: T0 + dtSec * 1000,
    batteryPct: 80,
    tempC: 36.5,
    powerMw: -4200,
    pssKb: 1_800_000,
    charging: false,
    thermal: 'none',
    deviceModel: 'Infinix GT 30',
  };
}

function reset() {
  useMeasureStore.getState().clearAll();
  useMeasureStore.setState({ active: null });
}

describe('measure store', () => {
  beforeEach(reset);

  it('runs one session at a time', () => {
    expect(useMeasureStore.getState().begin('s4_voice', T0)).toBe(true);
    expect(useMeasureStore.getState().begin('s1_idle', T0)).toBe(false);
    expect(useMeasureStore.getState().active?.id).toBe('s4_voice');
  });

  it('files normalized rows into the active session', () => {
    useMeasureStore.getState().begin('s2_chat', T0);
    expect(useMeasureStore.getState().tick(goodSample(0))?.tMs).toBe(T0);
    expect(useMeasureStore.getState().tick({ junk: true })).toBeNull();
    expect(useMeasureStore.getState().active?.rows.length).toBe(1);
  });

  it('drops rows when nothing is running', () => {
    expect(useMeasureStore.getState().tick(goodSample(0))).toBeNull();
  });

  it('caps rows per session so a long run cannot grow without bound', () => {
    useMeasureStore.getState().begin('s1_idle', T0);
    for (let i = 0; i < MEASURE_ROWS_CAP + 20; i++) {
      useMeasureStore.getState().tick(goodSample(i));
    }
    expect(useMeasureStore.getState().active?.rows.length).toBe(MEASURE_ROWS_CAP);
  });

  it('finish files the session and frees the slot', () => {
    useMeasureStore.getState().begin('s4_voice', T0);
    useMeasureStore.getState().tick(goodSample(0));
    useMeasureStore.getState().tick(goodSample(1800));
    expect(useMeasureStore.getState().finish(T0 + 1_900_000)).toBe(true);
    const state = useMeasureStore.getState();
    expect(state.active).toBeNull();
    const stored = state.sessions.s4_voice;
    expect(stored?.endedAt).toBe(T0 + 1_900_000);
    expect(stored?.rows.length).toBe(2);
  });

  it('sessionSummary computes from the stored rows and the wall span', () => {
    useMeasureStore.getState().begin('s4_voice', T0);
    expect(sessionSummary('s4_voice', useMeasureStore.getState().sessions)).toBeNull();
    useMeasureStore.getState().tick(goodSample(0));
    useMeasureStore.getState().tick(goodSample(60));
    useMeasureStore.getState().finish(T0 + 70_000);
    const summary = sessionSummary('s4_voice', useMeasureStore.getState().sessions);
    expect(summary).not.toBeNull();
    expect(summary!.samples).toBe(2);
    expect(summary!.durationSec).toBe(70); // wall clock, not the 60 s row span
    expect(summary!.coveragePct).toBe(86); // 60/70 disclosed, not hidden
    expect(summary!.gates.batteryOk).toBeNull(); // a 1-minute run is too short to judge a 30-min gate
  });

  it('a session killed after one row still reports its real wall length', () => {
    useMeasureStore.getState().begin('s5_briefing', T0);
    useMeasureStore.getState().tick(goodSample(0));
    useMeasureStore.getState().finish(T0 + 1_800_000);
    const summary = sessionSummary('s5_briefing', useMeasureStore.getState().sessions);
    expect(summary!.durationSec).toBe(1800); // never 0:00 again
    expect(summary!.coveragePct).toBe(0);
  });

  it('clear removes exactly the requested session', () => {
    useMeasureStore.getState().begin('s4_voice', T0);
    useMeasureStore.getState().finish(T0 + 1000);
    useMeasureStore.getState().begin('s1_idle', T0);
    useMeasureStore.getState().finish(T0 + 1000);
    useMeasureStore.getState().clear('s1_idle');
    const s = useMeasureStore.getState().sessions;
    expect(s.s1_idle).toBeNull();
    expect(s.s4_voice).not.toBeNull();
  });
});
