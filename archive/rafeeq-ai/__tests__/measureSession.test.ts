// Copyright (c) 2026 DRS AI. All rights reserved.
import type { MeasureSample } from '../modules/rafeeq-measure';
import {
  GATE_MIN_DURATION_SEC,
  MEASURE_END_READING_SLACK_SEC,
  MEASURE_GATES,
  buildMeasureCsv,
  computeSessionSummary,
  normalizeSample,
} from '../src/measure/session';

const T0 = 1_700_000_000_000;

function sample(over: Partial<MeasureSample> & { dtSec?: number }): MeasureSample {
  const { dtSec = 0, ...rest } = over;
  return {
    tMs: T0 + dtSec * 1000,
    batteryPct: 80,
    tempC: 36.0,
    powerMw: -4200,
    pssKb: 1_800_000,
    charging: false,
    thermal: 'none',
    deviceModel: 'Infinix GT 30',
    ...rest,
  };
}

describe('normalizeSample', () => {
  it('passes a good sample through', () => {
    const s = sample({});
    expect(normalizeSample(s)).toEqual(s);
  });

  it('rejects rows without a usable timestamp', () => {
    expect(normalizeSample(null)).toBeNull();
    expect(normalizeSample('x')).toBeNull();
    expect(normalizeSample({ batteryPct: 50 })).toBeNull();
    expect(normalizeSample({ tMs: 'yesterday' })).toBeNull();
  });

  it('degrades impossible readings to null instead of poisoning the tables', () => {
    const out = normalizeSample({ ...sample({}), batteryPct: 150, tempC: 90, pssKb: -5, charging: 1, thermal: '', deviceModel: '' });
    expect(out).not.toBeNull();
    expect(out!.batteryPct).toBeNull();
    expect(out!.tempC).toBeNull();
    expect(out!.pssKb).toBeNull();
    expect(out!.charging).toBe(false);
    expect(out!.thermal).toBeNull();
    expect(out!.deviceModel).toBeNull();
  });

  it('keeps a finite power reading even when negative (discharging)', () => {
    const out = normalizeSample(sample({}));
    expect(out!.powerMw).toBe(-4200);
  });
});

describe('computeSessionSummary + gates', () => {
  it('declares exactly the protocol gates (docs/phase5-device-measurements.md)', () => {
    expect(MEASURE_GATES.s1_idle.maxBatteryDrainPct).toBe(2);
    expect(MEASURE_GATES.s4_voice.maxBatteryDrainPct).toBe(8);
    expect(MEASURE_GATES.s2_chat.maxBatteryDrainPct).toBeNull();
    expect(MEASURE_GATES.s3_agent.maxBatteryDrainPct).toBeNull();
    expect(MEASURE_GATES.s5_briefing.maxBatteryDrainPct).toBeNull();
    for (const g of Object.values(MEASURE_GATES)) {
      expect(g.maxTempC).toBe(40);
      expect(g.maxPssKb).toBe(3_072_000);
    }
  });

  it('scores a full S4 session that passes every gate', () => {
    const rows = [sample({}), sample({ dtSec: 1800, batteryPct: 75, tempC: 39.7, pssKb: 2_621_440 })];
    const s = computeSessionSummary('s4_voice', rows, { startedAt: T0, endedAt: T0 + 1_800_000 });
    expect(s.durationSec).toBe(1800);
    expect(s.coveragePct).toBe(100);
    expect(s.samples).toBe(2);
    expect(s.gates.batteryDrainPct).toBe(5);
    expect(s.gates.batteryOk).toBe(true);
    expect(s.gates.tempOk).toBe(true);
    expect(s.gates.pssOk).toBe(true);
    expect(s.gates.unplugOk).toBe(true);
    expect(s.maxTempC).toBe(39.7);
    expect(s.peakPssKb).toBe(2_621_440);
    expect(s.worstThermal).toBe('none');
  });

  it('fails the S1 idle battery gate on a real drain', () => {
    const rows = [sample({ batteryPct: 90 }), sample({ dtSec: 1800, batteryPct: 87 })];
    const s = computeSessionSummary('s1_idle', rows, { startedAt: T0, endedAt: T0 + 1_800_000 });
    expect(s.gates.batteryDrainPct).toBe(3);
    expect(s.gates.batteryOk).toBe(false);
  });

  it('withholds the battery verdict on a too-short session instead of guessing', () => {
    const rows = [sample({}), sample({ dtSec: 600, batteryPct: 75 })];
    const s = computeSessionSummary('s4_voice', rows, { startedAt: T0, endedAt: T0 + 600_000 });
    expect(s.durationSec).toBeLessThan(GATE_MIN_DURATION_SEC);
    expect(s.gates.batteryOk).toBeNull();
    expect(s.gates.tempOk).toBe(true);
  });

  it('reports no battery verdict when the protocol declares none for the session', () => {
    const rows = [sample({}), sample({ dtSec: 1800, batteryPct: 10 })];
    const s = computeSessionSummary('s2_chat', rows, { startedAt: T0, endedAt: T0 + 1_800_000 });
    expect(s.gates.batteryOk).toBeNull();
    expect(s.gates.batteryDrainPct).toBe(70);
  });

  it('reports the honest wall duration with a lone row instead of a fake 0:00', () => {
    // The reported failure: begin + one immediate tick, then the app slept
    // through the screen-off stretch — the session still ran its 30 minutes.
    const rows = [sample({})];
    const s = computeSessionSummary('s5_briefing', rows, { startedAt: T0, endedAt: T0 + 1_800_000 });
    expect(s.durationSec).toBe(1800);
    expect(s.coveragePct).toBe(0);
    expect(s.samples).toBe(1);
    // a lone reading is never scored as «0 % drain, pass»
    expect(s.gates.batteryOk).toBeNull();
  });

  it('judges the battery gate only when a real reading reaches the session end', () => {
    const stale = [sample({ batteryPct: 90 }), sample({ dtSec: 120, batteryPct: 88 })];
    const far = computeSessionSummary('s1_idle', stale, { startedAt: T0, endedAt: T0 + 1_800_000 });
    expect(far.durationSec).toBe(1800);
    expect(far.gates.batteryOk).toBeNull(); // last reading is 28 min before the end
    const fresh = [...stale, sample({ dtSec: 1_790, batteryPct: 88 })];
    const near = computeSessionSummary('s1_idle', fresh, { startedAt: T0, endedAt: T0 + 1_800_000 });
    expect(near.gates.batteryOk).toBe(true); // drain 2 % over 30 min with a real end reading — judged for real
    expect(MEASURE_END_READING_SLACK_SEC).toBe(300);
  });

  it('fails the unplug gate when a charging row sneaks in', () => {
    const rows = [sample({}), sample({ dtSec: 60, charging: true })];
    const s = computeSessionSummary('s4_voice', rows);
    expect(s.chargingObserved).toBe(true);
    expect(s.gates.unplugOk).toBe(false);
  });

  it('tracks the worst thermal status, not the last', () => {
    const rows = [sample({ thermal: 'light' }), sample({ dtSec: 30, thermal: 'severe' }), sample({ dtSec: 60, thermal: 'light' })];
    expect(computeSessionSummary('s2_chat', rows).worstThermal).toBe('severe');
  });

  it('handles missing sensor surfaces (all null) without inventing numbers', () => {
    const rows = [sample({ batteryPct: null, tempC: null, pssKb: null, thermal: null }), sample({ dtSec: 1800, batteryPct: null, tempC: null, pssKb: null, thermal: null })];
    const s = computeSessionSummary('s4_voice', rows);
    expect(s.gates.batteryDrainPct).toBeNull();
    expect(s.gates.batteryOk).toBeNull();
    expect(s.gates.tempOk).toBeNull();
    expect(s.gates.pssOk).toBeNull();
    expect(s.gates.unplugOk).toBe(true);
  });
});

describe('buildMeasureCsv', () => {
  it('renders the docs-table shape', () => {
    const rows = [sample({}), sample({ dtSec: 1800, batteryPct: 75 })];
    const csv = buildMeasureCsv('s4_voice', rows, 'Infinix GT 30', { startedAt: T0, endedAt: T0 + 1_800_000 });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('session,s4_voice');
    expect(lines[1]).toBe('device,Infinix GT 30');
    expect(lines[2]).toBe(`wall_start,${T0}`);
    expect(lines[3]).toBe(`wall_end,${T0 + 1_800_000}`);
    expect(lines[4]).toBe('elapsed_s,battery_pct,temp_c,power_mw,pss_kb,charging,thermal');
    expect(lines[5]).toBe(`0,80,36,-4200,1800000,0,none`);
    expect(lines[6]).toBe(`1800,75,36,-4200,1800000,0,none`);
  });

  it('quotes device names that carry a comma', () => {
    const csv = buildMeasureCsv('s1_idle', [sample({})], 'Samsung Galaxy, S24');
    expect(csv.split('\n')[1]).toBe('device,"Samsung Galaxy, S24"');
  });

  it('returns an empty CSV for an empty session', () => {
    expect(buildMeasureCsv('s1_idle', [], null)).toBe('');
  });
});
