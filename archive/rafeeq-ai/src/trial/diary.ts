// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The 10-user × 1-week trial's daily diary and the SUS questionnaire as pure
 * logic (docs/phase5-user-trial.md). The diary stores counters only — never
 * content — and every metric the trial yields (completion rate, the
 * user-experienced misfire rate, confirmation-card coverage, the
 * time-on-task trend, SUS) computes from those counters alone, so the trial
 * inherits the app's own privacy rule: nothing here can leak a message.
 */

export interface DiaryEntry {
  /** Local calendar day, YYYY-MM-DD — the diary's primary key. */
  dateKey: string;
  tasksTried: number;
  completed: number;
  rephrased: number;
  wrongAction: number;
  cardsAllShown: boolean;
  minutes: number;
  voiceTasks: number;
  felt: string;
}

export const DIARY_LIMITS = {
  tasksMax: 50,
  minutesMax: 600,
  feltMax: 24,
} as const;

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Local calendar day key (YYYY-MM-DD) — the diary never uses UTC days. */
export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Coerces a raw diary row into shape: every counter clamps into its
 * declared range (a small slip in the form never corrupts the week), the
 * outcome counters cap at the day's task count, and the one-word feeling is
 * trimmed and capped — counters only, never content beyond one word.
 */
export function normalizeDiaryEntry(input: Partial<DiaryEntry> & { dateKey: string }): DiaryEntry {
  const tasksTried = clampInt(input.tasksTried, 0, DIARY_LIMITS.tasksMax);
  const felt = typeof input.felt === 'string' ? input.felt.trim().slice(0, DIARY_LIMITS.feltMax) : '';
  return {
    dateKey: input.dateKey,
    tasksTried,
    completed: clampInt(input.completed, 0, tasksTried),
    rephrased: clampInt(input.rephrased, 0, tasksTried),
    wrongAction: clampInt(input.wrongAction, 0, tasksTried),
    cardsAllShown: input.cardsAllShown === true,
    minutes: clampInt(input.minutes, 0, DIARY_LIMITS.minutesMax),
    voiceTasks: clampInt(input.voiceTasks, 0, tasksTried),
    felt,
  };
}

/** The SUS answer sheet: ten statements, each 1–5 (docs/phase5-user-trial.md). */
export const SUS_STATEMENTS = 10;

/**
 * Standard SUS scoring: odd statements are positive (score − 1), even
 * statements negative (5 − score); the sum × 2.5 lands on 0–100. Returns
 * null unless exactly ten in-range answers are present — an unfinished
 * questionnaire is unscored, never a fake zero.
 */
export function susScore(answers: unknown): number | null {
  if (!Array.isArray(answers) || answers.length !== SUS_STATEMENTS) return null;
  let sum = 0;
  for (let i = 0; i < SUS_STATEMENTS; i++) {
    const a = answers[i];
    if (typeof a !== 'number' || !Number.isInteger(a) || a < 1 || a > 5) return null;
    sum += i % 2 === 0 ? a - 1 : 5 - a;
  }
  return sum * 2.5;
}

export interface WeekSummary {
  days: number;
  tasksTried: number;
  completed: number;
  completionRate: number | null;
  misfireRate: number | null;
  cardCoverageRate: number | null;
  minutesTotal: number;
  avgMinutesPerTask: number | null;
  firstDayMinPerTask: number | null;
  lastDayMinPerTask: number | null;
}

function minPerTask(e: DiaryEntry): number | null {
  return e.tasksTried > 0 ? Math.round((e.minutes / e.tasksTried) * 10) / 10 : null;
}

/** Aggregates the week's diary rows into the metrics the trial reports. */
export function weekSummary(entries: DiaryEntry[]): WeekSummary {
  const sorted = [...entries].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const tasksTried = sorted.reduce((n, e) => n + e.tasksTried, 0);
  const completed = sorted.reduce((n, e) => n + e.completed, 0);
  const wrong = sorted.reduce((n, e) => n + e.wrongAction, 0);
  const minutesTotal = sorted.reduce((n, e) => n + e.minutes, 0);
  const cardsDays = sorted.filter((e) => e.cardsAllShown).length;
  const rate = (n: number, d: number): number | null =>
    d > 0 ? Math.round((n / d) * 100) / 100 : null;
  return {
    days: sorted.length,
    tasksTried,
    completed,
    completionRate: rate(completed, tasksTried),
    misfireRate: rate(wrong, tasksTried),
    cardCoverageRate: rate(cardsDays, sorted.length),
    minutesTotal,
    avgMinutesPerTask: rate(minutesTotal, tasksTried) === null ? null : Math.round((minutesTotal / tasksTried) * 10) / 10,
    firstDayMinPerTask: sorted.length > 0 ? minPerTask(sorted[0]) : null,
    lastDayMinPerTask: sorted.length > 0 ? minPerTask(sorted[sorted.length - 1]) : null,
  };
}

/** Renders the week's diary + SUS as the counters-only CSV the researcher pastes. */
export function buildTrialCsv(entries: DiaryEntry[], sus: number | null): string {
  const lines: string[] = [
    'date_key,tasks_tried,completed,rephrased,wrong_action,cards_all_shown,minutes,voice_tasks,felt',
  ];
  for (const e of [...entries].sort((a, b) => a.dateKey.localeCompare(b.dateKey))) {
    lines.push(
      [
        e.dateKey,
        e.tasksTried,
        e.completed,
        e.rephrased,
        e.wrongAction,
        e.cardsAllShown ? '1' : '0',
        e.minutes,
        e.voiceTasks,
        csvCell(e.felt),
      ].join(','),
    );
  }
  lines.push(`sus_score,${sus ?? ''}`);
  return lines.join('\n');
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
