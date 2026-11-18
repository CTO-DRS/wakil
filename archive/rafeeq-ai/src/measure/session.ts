// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The Phase-5 measurement protocol as pure, testable TypeScript — the five
 * sessions from docs/phase5-device-measurements.md, the pre-declared
 * acceptance gates, and the CSV renderer the lab screen exports. The native
 * side contributes one thing only: a single `readNow()` sample. Sampling
 * cadence, summaries and gate decisions live here so the whole protocol can
 * be exercised in jest without a device, and the docs' rule holds: no number
 * here is invented — every gate is the one the protocol pre-declared.
 */

import type { MeasureSample } from '../../modules/rafeeq-measure';

/** The five protocol sessions (docs/phase5-device-measurements.md). */
export type MeasureSessionId = 's1_idle' | 's2_chat' | 's3_agent' | 's4_voice' | 's5_briefing';

export const MEASURE_SESSION_IDS: readonly MeasureSessionId[] = [
  's1_idle',
  's2_chat',
  's3_agent',
  's4_voice',
  's5_briefing',
];

/** Planned length of each session, minutes — drives the lab screen's hints. */
export const MEASURE_SESSION_MINUTES: Record<MeasureSessionId, number> = {
  s1_idle: 30,
  s2_chat: 30,
  s3_agent: 30,
  s4_voice: 30,
  s5_briefing: 30,
};

/**
 * The pre-declared acceptance gates — the docs' numbers and nothing else.
 * `maxBatteryDrainPct: null` means the protocol declares no battery gate for
 * that session (S1 declares < 2 %, S4 declares ≤ 8 %); the heat and RAM gates
 * apply to every session, and every session must run unplugged in airplane
 * mode.
 */
export interface MeasureGates {
  maxBatteryDrainPct: number | null;
  maxTempC: number;
  maxPssKb: number;
}

export const MEASURE_GATES: Record<MeasureSessionId, MeasureGates> = {
  s1_idle: { maxBatteryDrainPct: 2, maxTempC: 40, maxPssKb: 3_072_000 },
  s2_chat: { maxBatteryDrainPct: null, maxTempC: 40, maxPssKb: 3_072_000 },
  s3_agent: { maxBatteryDrainPct: null, maxTempC: 40, maxPssKb: 3_072_000 },
  s4_voice: { maxBatteryDrainPct: 8, maxTempC: 40, maxPssKb: 3_072_000 },
  s5_briefing: { maxBatteryDrainPct: null, maxTempC: 40, maxPssKb: 3_072_000 },
};

/** Gates evaluate only on sessions that ran at least this long (25 min slack). */
export const GATE_MIN_DURATION_SEC = 25 * 60;

/**
 * The battery gate needs a real end-of-session reading: the last battery row
 * must land this close to the session's wall end, so a session whose app died
 * at minute 2 is never judged from a stale pair of readings.
 */
export const MEASURE_END_READING_SLACK_SEC = 5 * 60;

/** The wall-clock span a stored session covers (the honest duration source). */
export interface MeasureWallSpan {
  startedAt: number;
  endedAt: number | null;
}

/** Sampling cadence used by the lab screen (matches the adb sampler's 30 s). */
export const MEASURE_INTERVAL_SEC = 30;

/** Rows kept per session (30 s × 60 min + slack) — the store caps here. */
export const MEASURE_ROWS_CAP = 130;

/** Coerces one raw native sample into shape; null when it carries no timestamp. */
export function normalizeSample(raw: unknown): MeasureSample | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const tMs = typeof r.tMs === 'number' && Number.isFinite(r.tMs) && r.tMs > 0 ? Math.round(r.tMs) : null;
  if (tMs === null) return null;
  const bounded = (v: unknown, lo: number, hi: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  return {
    tMs,
    batteryPct: bounded(r.batteryPct, 0, 100),
    tempC: bounded(r.tempC, -20, 80),
    powerMw: typeof r.powerMw === 'number' && Number.isFinite(r.powerMw) ? r.powerMw : null,
    pssKb: bounded(r.pssKb, 0, 16 * 1024 * 1024),
    charging: r.charging === true,
    thermal: typeof r.thermal === 'string' && r.thermal.length > 0 ? r.thermal : null,
    deviceModel: typeof r.deviceModel === 'string' && r.deviceModel.length > 0 ? r.deviceModel : null,
  };
}

export interface GateResult {
  /** Net battery drop across the session (start − end), rounded to 0.1. */
  batteryDrainPct: number | null;
  /** null = no battery gate declared for this session, or the session ran too short to judge. */
  batteryOk: boolean | null;
  tempOk: boolean | null;
  pssOk: boolean | null;
  /** The protocol demands unplugged sampling; any charging row fails the gate. */
  unplugOk: boolean;
}

export interface MeasureSessionSummary {
  id: MeasureSessionId;
  samples: number;
  durationSec: number;
  /** Row span ÷ wall duration, % — how much of the session the rows actually cover. */
  coveragePct: number | null;
  batteryStartPct: number | null;
  batteryEndPct: number | null;
  maxTempC: number | null;
  peakPssKb: number | null;
  worstThermal: string | null;
  chargingObserved: boolean;
  gates: GateResult;
}

const THERMAL_SEVERITY: Record<string, number> = {
  none: 0,
  light: 1,
  moderate: 2,
  severe: 3,
  critical: 4,
  emergency: 5,
  shutdown: 6,
};

/**
 * Computes the session summary and its gate decisions from the raw rows.
 * With a wall span (startedAt → endedAt) the duration is the real wall clock —
 * a session whose app slept through the screen-off stretch still reports its
 * true length, with `coveragePct` disclosing how much of it the rows cover.
 * Without a wall span the row span is all that is known.
 */
export function computeSessionSummary(
  id: MeasureSessionId,
  rows: MeasureSample[],
  wall?: MeasureWallSpan,
): MeasureSessionSummary {
  const gates = MEASURE_GATES[id];
  const first = rows[0];
  const last = rows[rows.length - 1];
  const rowSpanSec = first && last ? Math.max(0, Math.round((last.tMs - first.tMs) / 1000)) : 0;
  const wallSpanSec =
    wall && wall.endedAt !== null && wall.endedAt >= wall.startedAt
      ? Math.max(0, Math.round((wall.endedAt - wall.startedAt) / 1000))
      : null;
  const durationSec = wallSpanSec !== null ? wallSpanSec : rowSpanSec;
  const coveragePct =
    durationSec > 0 && first && last ? Math.min(100, Math.round((rowSpanSec / durationSec) * 100)) : null;

  const battery = rows.map((r) => r.batteryPct).filter((v): v is number => v !== null);
  const temps = rows.map((r) => r.tempC).filter((v): v is number => v !== null);
  const pss = rows.map((r) => r.pssKb).filter((v): v is number => v !== null);

  const batteryStartPct = battery.length > 0 ? battery[0] : null;
  const batteryEndPct = battery.length > 0 ? battery[battery.length - 1] : null;
  const batteryDrainPct =
    batteryStartPct !== null && batteryEndPct !== null
      ? Math.max(0, Math.round((batteryStartPct - batteryEndPct) * 10) / 10)
      : null;
  const maxTempC = temps.length > 0 ? Math.max(...temps) : null;
  const peakPssKb = pss.length > 0 ? Math.max(...pss) : null;
  const worstThermal = rows.reduce<string | null>((worst, r) => {
    if (!r.thermal) return worst;
    if (!worst) return r.thermal;
    return (THERMAL_SEVERITY[r.thermal] ?? 0) > (THERMAL_SEVERITY[worst] ?? 0) ? r.thermal : worst;
  }, null);
  const chargingObserved = rows.some((r) => r.charging);

  const longEnough = durationSec >= GATE_MIN_DURATION_SEC;
  // The drain verdict needs two real readings and — when the wall end is
  // known — a reading that actually reaches the end of the session; a lone
  // row (or a stale last reading) is never scored as «0 % drain, pass».
  const lastBatteryRow = [...rows].reverse().find((r) => r.batteryPct !== null);
  const endReadingKnown =
    wallSpanSec !== null && wall?.endedAt != null && lastBatteryRow !== undefined
      ? Math.abs(wall.endedAt - lastBatteryRow.tMs) / 1000 <= MEASURE_END_READING_SLACK_SEC
      : true;
  const batteryOk =
    gates.maxBatteryDrainPct !== null && batteryDrainPct !== null && battery.length >= 2 && endReadingKnown
      ? longEnough
        ? batteryDrainPct <= gates.maxBatteryDrainPct
        : null
      : null;
  const tempOk = maxTempC !== null ? maxTempC <= gates.maxTempC : null;
  const pssOk = peakPssKb !== null ? peakPssKb <= gates.maxPssKb : null;

  return {
    id,
    samples: rows.length,
    durationSec,
    coveragePct,
    batteryStartPct,
    batteryEndPct,
    maxTempC,
    peakPssKb,
    worstThermal,
    chargingObserved,
    gates: { batteryDrainPct, batteryOk, tempOk, pssOk, unplugOk: !chargingObserved },
  };
}

/** Renders a session's rows as the CSV shape the results tables paste from. */
export function buildMeasureCsv(
  id: MeasureSessionId,
  rows: MeasureSample[],
  deviceModel: string | null,
  wall?: MeasureWallSpan,
): string {
  if (rows.length === 0) return '';
  const first = rows[0];
  const lines: string[] = [`session,${id}`];
  if (deviceModel) lines.push(`device,${csvCell(deviceModel)}`);
  if (wall) {
    lines.push(`wall_start,${wall.startedAt}`);
    lines.push(`wall_end,${wall.endedAt ?? ''}`);
  }
  lines.push('elapsed_s,battery_pct,temp_c,power_mw,pss_kb,charging,thermal');
  for (const r of rows) {
    lines.push(
      [
        Math.round((r.tMs - first.tMs) / 1000),
        r.batteryPct ?? '',
        r.tempC ?? '',
        r.powerMw ?? '',
        r.pssKb ?? '',
        r.charging ? '1' : '0',
        r.thermal ?? '',
      ].join(','),
    );
  }
  return lines.join('\n');
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
