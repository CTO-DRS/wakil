// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Pure argument normalizers for the Phase-2 phone tools.
 *
 * Small models cannot count characters or emit perfect timestamps, and Saudi
 * Arabic answers often carry Arabic-Indic digits, so every argument passes
 * through a pure normalizer here before it reaches a native call. All
 * functions are total: they return a value or a stable error code — never an
 * exception — so the agent loop can relay the reason to the user in Arabic.
 */

/** Cap shared by every free-text argument (matches planner.TITLE_MAX style). */
export const ARG_TEXT_MAX = 300;

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic-Indic (٠١٢…) and Extended Arabic-Indic (۰۱۲…) digits to ASCII. */
export function toAsciiDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const a = ARABIC_INDIC.indexOf(ch);
    const b = EXTENDED_ARABIC_INDIC.indexOf(ch);
    out += a >= 0 ? String(a) : b >= 0 ? String(b) : ch;
  }
  return out;
}

/** Strips quote/backslash/control characters the grammar forbids anywhere. */
export function sanitizeGrammarText(text: string): string {
  return text
    .replace(/["\\\x00-\x1F]/g, '')
    .trim()
    .slice(0, ARG_TEXT_MAX);
}

export type PhoneNormalize =
  | { ok: true; phone: string }
  | { ok: false; error: string };

/**
 * Normalizes a phone number: Arabic-Indic digits to ASCII, spaces, dashes,
 * dots, parentheses and zero-width characters removed; keeps a leading +.
 */
export function normalizePhone(raw: unknown): PhoneNormalize {
  if (typeof raw !== 'string' || raw.trim().length === 0) return { ok: false, error: 'PHONE_EMPTY' };
  let text = toAsciiDigits(raw).trim();
  text = text.replace(/[\u200B-\u200F\u2060\uFEFF\s().\-–—]/g, '');
  if (text.startsWith('00')) text = `+${text.slice(2)}`;
  if (!/^\+?[0-9]{3,20}$/.test(text)) return { ok: false, error: 'PHONE_INVALID' };
  return { ok: true, phone: text };
}

export type ClockTime = { hour: number; minute: number };

export type ClockParse = { ok: true; time: ClockTime } | { ok: false; error: string };

/**
 * Parses a wall-clock time from a string or pair of integers: `3:30`,
 * `03:30`, `٣:٣٠٠`-style digits, or `3.30`. Rejects out-of-range hours and
 * minutes so the native alarm call never gets 25 o'clock.
 */
export function parseClockTime(rawHour: unknown, rawMinute: unknown): ClockParse {
  const hour = typeof rawHour === 'number' && Number.isFinite(rawHour) ? Math.trunc(rawHour) : null;
  const minute = typeof rawMinute === 'number' && Number.isFinite(rawMinute) ? Math.trunc(rawMinute) : null;
  if (hour === null || minute === null) return { ok: false, error: 'ALARM_TIME_INVALID' };
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { ok: false, error: 'ALARM_TIME_INVALID' };
  return { ok: true, time: { hour, minute } };
}

const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export type WhenParse = { ok: true; when: Date; hasTime: boolean } | { ok: false; error: string };

/**
 * Parses a local ISO timestamp (`2026-11-08T09:30`, seconds optional, a
 * space instead of `T` accepted, date-only allowed) into a Date. No
 * timezone suffix is accepted — the agent reasons in device-local time.
 */
export function parseWhenIso(raw: unknown): WhenParse {
  if (typeof raw !== 'string') return { ok: false, error: 'WHEN_INVALID' };
  const text = toAsciiDigits(raw.trim()).replace(/\s+/, ' ');
  const match = ISO_PATTERN.exec(text);
  if (!match) return { ok: false, error: 'WHEN_INVALID' };
  const [, y, mo, d, hh, mi, ss] = match;
  const month = Number(mo);
  const day = Number(d);
  const hour = hh !== undefined ? Number(hh) : 0;
  const minute = mi !== undefined ? Number(mi) : 0;
  const second = ss !== undefined ? Number(ss) : 0;
  // JS Date silently rolls impossible months/days over — reject them instead.
  if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, error: 'WHEN_INVALID' };
  if (hour > 23 || minute > 59 || second > 59) return { ok: false, error: 'WHEN_INVALID' };
  const when = new Date(Number(y), month - 1, day, hour, minute, second);
  if (
    Number.isNaN(when.getTime()) ||
    when.getFullYear() !== Number(y) ||
    when.getMonth() !== month - 1 ||
    when.getDate() !== day
  ) {
    return { ok: false, error: 'WHEN_INVALID' };
  }
  return { ok: true, when, hasTime: hh !== undefined };
}

/** Validates/clamps a plain integer argument with bounds and a fallback. */
export function clampIntArg(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Resolves `when_iso` xor `in_minutes` (exactly one) into a future Date.
 * A past timestamp is rejected with WHEN_PAST; both/neither with WHEN_BOTH /
 * WHEN_MISSING so the observation tells the model what to fix.
 */
export function resolveReminderWhen(
  args: { when_iso?: unknown; in_minutes?: unknown },
  now: Date,
  maxMinutes = 30 * 24 * 60,
): WhenParse {
  const hasIso = args.when_iso !== undefined && args.when_iso !== null && args.when_iso !== '';
  const minutes = typeof args.in_minutes === 'number' && Number.isFinite(args.in_minutes) ? Math.trunc(args.in_minutes) : null;
  const hasMinutes = minutes !== null && minutes !== undefined;
  if (hasIso && hasMinutes) return { ok: false, error: 'WHEN_BOTH' };
  if (!hasIso && !hasMinutes) return { ok: false, error: 'WHEN_MISSING' };
  if (hasIso) {
    const parsed = parseWhenIso(args.when_iso);
    if (!parsed.ok) return parsed;
    if (parsed.when.getTime() < now.getTime() - 60_000) return { ok: false, error: 'WHEN_PAST' };
    return parsed;
  }
  const clamped = Math.min(Math.max(minutes as number, 1), maxMinutes);
  return { ok: true, when: new Date(now.getTime() + clamped * 60_000), hasTime: true };
}

export type WhenSecondsParse = { ok: true; seconds: number } | { ok: false; error: string };

/** Timer length in seconds, clamped to the 5 s – 24 h range the clock app accepts. */
export function parseTimerSeconds(value: unknown): WhenSecondsParse {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : NaN;
  if (Number.isNaN(n) || n < 5 || n > 86_400) return { ok: false, error: 'TIMER_LENGTH_INVALID' };
  return { ok: true, seconds: n };
}
