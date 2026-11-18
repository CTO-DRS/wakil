// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  clampIntArg,
  normalizePhone,
  parseClockTime,
  parseTimerSeconds,
  parseWhenIso,
  resolveReminderWhen,
  sanitizeGrammarText,
  toAsciiDigits,
} from '../src/agent/tools/normalize';

describe('toAsciiDigits', () => {
  it.each([
    { name: 'Arabic-Indic digits convert', input: '٠٥٠١٢٣٤٥٦٧', expected: '0501234567' },
    { name: 'Extended Arabic-Indic digits convert', input: '۰۱۲۳', expected: '0123' },
    { name: 'ASCII digits pass through', input: '0501', expected: '0501' },
    { name: 'Arabic letters pass through', input: 'الرياض', expected: 'الرياض' },
  ])('$name', ({ input, expected }) => {
    expect(toAsciiDigits(input)).toBe(expected);
  });
});

describe('sanitizeGrammarText', () => {
  it.each([
    { name: 'plain Arabic survives', input: 'أتصل على أبوي', expected: 'أتصل على أبوي' },
    { name: 'double quotes are stripped', input: 'موعد "مهم"', expected: 'موعد مهم' },
    { name: 'backslashes are stripped', input: 'مسار\\خاطئ', expected: 'مسارخاطئ' },
    { name: 'control characters are stripped', input: 'سطر\u0000تاني\u001F', expected: 'سطرتاني' },
    { name: 'newlines are stripped', input: 'سطر\nتاني', expected: 'سطرتاني' },
  ])('$name', ({ input, expected }) => {
    expect(sanitizeGrammarText(input)).toBe(expected);
  });

  it('caps the length to the argument maximum', () => {
    expect(sanitizeGrammarText('x'.repeat(1000))).toHaveLength(300);
  });
});

describe('normalizePhone', () => {
  it.each([
    { name: 'a Saudi mobile passes', raw: '0501234567', ok: true, phone: '0501234567' },
    { name: 'an international + form passes', raw: '+966501234567', ok: true, phone: '+966501234567' },
    { name: 'a 00 international form converts to +', raw: '00966501234567', ok: true, phone: '+966501234567' },
    { name: 'Arabic-Indic digits convert', raw: '٠٥٠١٢٣٤٥٦٧', ok: true, phone: '0501234567' },
    { name: 'spaces and dashes are stripped', raw: '050 123-4567', ok: true, phone: '0501234567' },
    { name: 'parentheses and dots are stripped', raw: '(050).123.4567', ok: true, phone: '0501234567' },
    { name: 'empty fails', raw: '   ', ok: false, phone: '' },
    { name: 'letters fail', raw: '0501abcdef', ok: false, phone: '' },
    { name: 'too short fails', raw: '12', ok: false, phone: '' },
    { name: 'non-string fails', raw: 42, ok: false, phone: '' },
  ])('$name', ({ raw, ok, phone }) => {
    const result = normalizePhone(raw);
    expect(result.ok).toBe(ok);
    if (result.ok) expect(result.phone).toBe(phone);
  });
});

describe('parseClockTime', () => {
  it.each([
    { name: 'a plain morning time passes', hour: 3, minute: 30, ok: true },
    { name: 'midnight passes', hour: 0, minute: 0, ok: true },
    { name: '23:59 passes', hour: 23, minute: 59, ok: true },
    { name: 'hour 24 fails', hour: 24, minute: 0, ok: false },
    { name: 'minute 60 fails', hour: 12, minute: 60, ok: false },
    { name: 'negative hour fails', hour: -1, minute: 30, ok: false },
    { name: 'a string hour fails', hour: '3', minute: 30, ok: false },
  ])('$name', ({ hour, minute, ok }) => {
    expect(parseClockTime(hour, minute).ok).toBe(ok);
  });
});

describe('parseWhenIso', () => {
  it.each([
    { name: 'date + hour + minute parses', raw: '2026-11-09T08:30', ok: true, iso: '2026-11-09T08:30:00' },
    { name: 'seconds parse too', raw: '2026-11-09T08:30:15', ok: true, iso: '2026-11-09T08:30:15' },
    { name: 'a space separator is accepted', raw: '2026-11-09 08:30', ok: true, iso: '2026-11-09T08:30:00' },
    { name: 'date-only parses to midnight', raw: '2026-11-09', ok: true, iso: '2026-11-09T00:00:00' },
    { name: 'Arabic-Indic digits convert', raw: '٢٠٢٦-١١-٠٩T08:30', ok: true, iso: '2026-11-09T08:30:00' },
    { name: 'a timezone suffix is rejected', raw: '2026-11-09T08:30Z', ok: false, iso: '' },
    { name: 'garbage is rejected', raw: 'بعد العصر', ok: false, iso: '' },
    { name: 'an impossible month is rejected', raw: '2026-13-40T08:30', ok: false, iso: '' },
    { name: 'minute 61 is rejected', raw: '2026-11-09T08:61', ok: false, iso: '' },
    { name: 'a non-string is rejected', raw: 12345, ok: false, iso: '' },
  ])('$name', ({ raw, ok, iso }) => {
    const result = parseWhenIso(raw);
    expect(result.ok).toBe(ok);
    if (result.ok) {
      expect(result.when.getFullYear()).toBe(Number(iso.slice(0, 4)));
      expect(result.when.getMonth()).toBe(Number(iso.slice(5, 7)) - 1);
      expect(result.when.getDate()).toBe(Number(iso.slice(8, 10)));
      expect(result.when.getHours()).toBe(Number(iso.slice(11, 13)));
      expect(result.when.getMinutes()).toBe(Number(iso.slice(14, 16)));
    }
  });
});

describe('resolveReminderWhen', () => {
  const now = new Date(2026, 10, 8, 12, 0, 0); // 2026-11-08 12:00 local

  it('accepts a future ISO time', () => {
    const result = resolveReminderWhen({ when_iso: '2026-11-08T18:30' }, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.when.getHours()).toBe(18);
  });

  it('accepts minutes from now and clamps to the 30-day budget', () => {
    const soon = resolveReminderWhen({ in_minutes: 90 }, now);
    expect(soon.ok).toBe(true);
    if (soon.ok) expect(soon.when.getTime() - now.getTime()).toBe(90 * 60_000);

    const clamped = resolveReminderWhen({ in_minutes: 100_000 }, now);
    if (clamped.ok) expect(clamped.when.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60_000);
  });

  it('rejects a past ISO time', () => {
    expect(resolveReminderWhen({ when_iso: '2026-11-01T09:00' }, now)).toMatchObject({ ok: false, error: 'WHEN_PAST' });
  });

  it('rejects both forms and neither form', () => {
    expect(resolveReminderWhen({ when_iso: '2026-11-09T09:00', in_minutes: 30 }, now)).toMatchObject({ ok: false, error: 'WHEN_BOTH' });
    expect(resolveReminderWhen({}, now)).toMatchObject({ ok: false, error: 'WHEN_MISSING' });
  });

  it('rejects garbage ISO with WHEN_INVALID', () => {
    expect(resolveReminderWhen({ when_iso: 'بعد العصر' }, now)).toMatchObject({ ok: false, error: 'WHEN_INVALID' });
  });
});

describe('clampIntArg and parseTimerSeconds', () => {
  it('clamps integers into range with a fallback for junk', () => {
    expect(clampIntArg(300, 1, 255, 128)).toBe(255);
    expect(clampIntArg(0, 1, 255, 128)).toBe(1);
    expect(clampIntArg('high', 1, 255, 128)).toBe(128);
    expect(clampIntArg(undefined, 1, 60, 7)).toBe(7);
  });

  it('bounds timer length to 5 s – 24 h', () => {
    expect(parseTimerSeconds(90)).toMatchObject({ ok: true, seconds: 90 });
    expect(parseTimerSeconds(2).ok).toBe(false);
    expect(parseTimerSeconds(100_000).ok).toBe(false);
    expect(parseTimerSeconds('سريع').ok).toBe(false);
  });
});
