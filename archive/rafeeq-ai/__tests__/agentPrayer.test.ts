// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  CITY_ALIASES,
  DEFAULT_CITY,
  ISHA_DELAY_MINUTES,
  SAUDI_CITIES,
  computePrayerTimes,
  formatPrayerClock,
  resolveCity,
  upcomingPrayerTimes,
  type PrayerTimes,
} from '../src/agent/prayer';

/**
 * Reference fixtures: published Umm al-Qura prayer times for Riyadh
 * (timesprayer.com, Riyadh November 2026 table, retrieved 2026-11-08).
 * Different published implementations differ between themselves by a few
 * minutes, so the tolerance is deliberately ±5 minutes; the table below has
 * been cross-checked against al-habib.info and almosaly.com for the same
 * dates and agree within that window.
 */
const RIYADH_FIXTURES: { date: [number, number, number]; times: Record<string, string> }[] = [
  {
    date: [2026, 11, 8],
    times: { fajr: '04:44', sunrise: '06:04', dhuhr: '11:37', asr: '14:46', maghrib: '17:09', isha: '18:39' },
  },
  {
    date: [2026, 11, 1],
    times: { fajr: '04:40', sunrise: '06:00', dhuhr: '11:36', asr: '14:49', maghrib: '17:13', isha: '18:43' },
  },
  {
    date: [2026, 11, 20],
    times: { fajr: '04:51', sunrise: '06:12', dhuhr: '11:38', asr: '14:43', maghrib: '17:05', isha: '18:35' },
  },
];

const TOLERANCE_MINUTES = 5;

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesOfDayRiyadhTz(when: Date, tz: number): number {
  const shifted = new Date(when.getTime() + tz * 3_600_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

const RIYADH = SAUDI_CITIES.riyadh;

describe('computePrayerTimes against published Riyadh tables', () => {
  it.each(RIYADH_FIXTURES.map((f) => [`${f.date.join('-')}`, f]))(
    'matches the published table for %s within ±%d min',
    (_label, fixture) => {
      const date = new Date(fixture.date[0], fixture.date[1] - 1, fixture.date[2]);
      const times = computePrayerTimes(date, RIYADH, 'umm_al_qura');
      for (const [key, expected] of Object.entries(fixture.times)) {
        const actual = minutesOfDayRiyadhTz(times[key as keyof PrayerTimes], RIYADH.tz);
        const want = clockToMinutes(expected);
        const diff = Math.abs(actual - want);
        expect(diff).toBeLessThanOrEqual(TOLERANCE_MINUTES);
      }
    },
  );

  it('follows the Umm al-Qura rule: Isha is Maghrib + 90 minutes exactly', () => {
    const date = new Date(2026, 10, 8);
    const times = computePrayerTimes(date, RIYADH, 'umm_al_qura');
    const maghrib = minutesOfDayRiyadhTz(times.maghrib, RIYADH.tz);
    const isha = minutesOfDayRiyadhTz(times.isha, RIYADH.tz);
    expect(isha - maghrib).toBe(ISHA_DELAY_MINUTES);
  });

  it('keeps the day ordering for every Saudi city across the year', () => {
    for (const [key, coords] of Object.entries(SAUDI_CITIES)) {
      for (const month of [0, 3, 6, 9]) {
        const date = new Date(2026, month, 15);
        const t = computePrayerTimes(date, coords, 'umm_al_qura');
        const minutes = [
          t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha,
        ].map((when) => minutesOfDayRiyadhTz(when, coords.tz));
        for (let i = 1; i < minutes.length; i++) {
          if (minutes[i] < minutes[i - 1]) {
            // A midnight crossing is only legal between sunrise and fajr of the next day — never inside one day.
            throw new Error(`${key} month=${month}: times out of order: ${minutes.join(',')}`);
          }
        }
        expect(key).toBeTruthy();
      }
    }
  });
});

describe('city resolution', () => {
  it('resolves English keys, Saudi Arabic spellings and aliases', () => {
    expect(resolveCity('riyadh')?.key).toBe('riyadh');
    expect(resolveCity('الرياض')?.key).toBe('riyadh');
    expect(resolveCity('مكة')?.key).toBe('makkah');
    expect(resolveCity('Jeddah')?.key).toBe('jeddah');
    expect(resolveCity('الدمام')?.key).toBe('dammam');
  });

  it('returns null for unknown cities and keeps a sane default', () => {
    expect(resolveCity('لندن')).toBeNull();
    expect(resolveCity(undefined)).toBeNull();
    expect(DEFAULT_CITY).toBe('riyadh');
    expect(CITY_ALIASES['الرياض']).toBe('riyadh');
  });
});

describe('formatPrayerClock', () => {
  it('renders the local clock regardless of the machine timezone', () => {
    const date = new Date(2026, 10, 8);
    const t = computePrayerTimes(date, RIYADH, 'umm_al_qura');
    expect(formatPrayerClock(t.dhuhr, RIYADH.tz)).toBe('11:36');
  });
});

describe('upcomingPrayerTimes', () => {
  it('lists the next five worship times in order, skipping sunrise and yesterday', () => {
    // 2026-11-08 at 12:00 Riyadh local = 09:00 UTC.
    const now = new Date(Date.UTC(2026, 10, 8, 9, 0, 0));
    const upcoming = upcomingPrayerTimes(now, RIYADH, 'umm_al_qura', 5);
    expect(upcoming.map((p) => p.key)).toEqual(['asr', 'maghrib', 'isha', 'fajr', 'dhuhr']);
    for (let i = 1; i < upcoming.length; i++) {
      expect(upcoming[i].when.getTime()).toBeGreaterThan(upcoming[i - 1].when.getTime());
    }
    expect(upcoming[0].when.getTime()).toBeGreaterThan(now.getTime());
  });

  it('respects a smaller count', () => {
    const now = new Date(Date.UTC(2026, 10, 8, 9, 0, 0));
    expect(upcomingPrayerTimes(now, RIYADH, 'umm_al_qura', 2)).toHaveLength(2);
  });
});
