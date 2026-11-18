// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Offline prayer times — a pure solar-position implementation of the Umm
 * al-Qura convention (the official Saudi method): Fajr at 18.5°, Isha fixed
 * at Maghrib + 90 minutes, Asr by the Shafi'i shadow factor. Nothing here
 * touches the network: one latitude/longitude pair is all it needs.
 *
 * Accuracy on the Saudi latitudes is within a few minutes of published
 * tables; different published implementations differ between themselves by
 * about the same amount, so tests pin Riyadh fixtures with a ±5 min
 * tolerance (see __tests__/agentPrayer.test.ts and docs/phase2-phone-tools.md).
 */

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface PrayerTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

export type PrayerConvention = 'umm_al_qura' | 'gulf';

const FAJR_ANGLE_UMM_AL_QURA = 18.5;
const FAJR_ANGLE_GULF = 19.5;
/** Depressions angle used by almanacs for sunrise/sunset. */
const SUNRISE_SUNSET_ANGLE = 0.833;
/** Umm al-Qura and Gulf: Isha is Maghrib + 90 minutes, always. */
export const ISHA_DELAY_MINUTES = 90;
/** Saudi cities shadow factor (Shafi'i). */
const ASR_SHADOW_FACTOR = 1;

export interface CityCoords {
  readonly lat: number;
  readonly lng: number;
  /** Fixed hours from UTC (Saudi Arabia is +3, no DST). */
  readonly tz: number;
}

/** The Saudi cities the agent can name, keyed by lowercase ASCII name. */
export const SAUDI_CITIES: Record<string, CityCoords> = {
  riyadh: { lat: 24.7136, lng: 46.6753, tz: 3 },
  jeddah: { lat: 21.4858, lng: 39.1925, tz: 3 },
  makkah: { lat: 21.3891, lng: 39.8579, tz: 3 },
  madinah: { lat: 24.5247, lng: 39.5692, tz: 3 },
  dammam: { lat: 26.4207, lng: 50.0888, tz: 3 },
  khobar: { lat: 26.2794, lng: 50.2083, tz: 3 },
  taif: { lat: 21.2854, lng: 40.4183, tz: 3 },
  abha: { lat: 18.2465, lng: 42.5117, tz: 3 },
  buraidah: { lat: 26.3256, lng: 43.975, tz: 3 },
  tabuk: { lat: 28.3835, lng: 36.5662, tz: 3 },
  hail: { lat: 27.5114, lng: 41.7208, tz: 3 },
  jubail: { lat: 27.0116, lng: 49.6324, tz: 3 },
};

/** Aliases the model or the user may produce (Saudi spellings, Arabic names). */
export const CITY_ALIASES: Record<string, string> = {
  'الرياض': 'riyadh',
  'جدة': 'jeddah',
  'مكة': 'makkah',
  'مكه': 'makkah',
  'المدينة': 'madinah',
  'الدمام': 'dammam',
  'الخبر': 'khobar',
  'الطائف': 'taif',
  'أبها': 'abha',
  'بريدة': 'buraidah',
  'تبوك': 'tabuk',
  'حائل': 'hail',
  'الجبيل': 'jubail',
};

export const DEFAULT_CITY = 'riyadh';

/** Resolves a city name (English, Saudi Arabic spelling or alias) to coords. */
export function resolveCity(raw: unknown): { key: string; coords: CityCoords } | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase();
  if (SAUDI_CITIES[text]) return { key: text, coords: SAUDI_CITIES[text] };
  const alias = CITY_ALIASES[raw.trim()];
  if (alias) return { key: alias, coords: SAUDI_CITIES[alias] };
  return null;
}

const DEG = Math.PI / 180;

function sunDeclinationAndEquation(jd: number): { decl: number; eqt: number } {
  const d = jd - 2451545.0;
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const l = (q + 1.915 * Math.sin(g * DEG) + 0.02 * Math.sin(2 * g * DEG)) % 360;
  const e = 23.439 - 0.00000036 * d;
  const decl = Math.asin(Math.sin(e * DEG) * Math.sin(l * DEG)) / DEG;
  const ra = Math.atan2(Math.cos(e * DEG) * Math.sin(l * DEG), Math.cos(l * DEG)) / DEG / 15;
  // Equation of time in hours, normalized to a sane range.
  let eqt = q / 15 - ra;
  while (eqt > 12) eqt -= 24;
  while (eqt < -12) eqt += 24;
  return { decl, eqt };
}

function julianDay(y: number, m: number, d: number): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

/** Hour angle between the transit and a depression angle, in hours. */
function angleTime(angle: number, lat: number, decl: number): number {
  const cosH =
    (-Math.sin(angle * DEG) - Math.sin(lat * DEG) * Math.sin(decl * DEG)) /
    (Math.cos(lat * DEG) * Math.cos(decl * DEG));
  if (cosH > 1 || cosH < -1) return NaN;
  return Math.acos(cosH) / DEG / 15;
}

/** Asr offset (hours after transit) for a shadow factor. */
function asrTime(shadowFactor: number, lat: number, decl: number): number {
  const angle = -Math.atan(1 / (shadowFactor + Math.tan(Math.abs(lat - decl) * DEG))) / DEG;
  return angleTime(angle, lat, decl);
}

/** Builds a Date for the civil local date plus local minutes since midnight. */
function localDateAt(date: Date, tz: number, minutes: number): Date {
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return new Date(utcMidnight + (minutes - tz * 60) * 60_000);
}

/**
 * Computes the six prayer times for one civil local date at the given
 * coordinates and timezone. Angles follow the chosen convention; all values
 * are Date objects in absolute time.
 */
export function computePrayerTimes(
  date: Date,
  coords: CityCoords,
  convention: PrayerConvention = 'umm_al_qura',
): PrayerTimes {
  const jd = julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate()) - coords.lng / (15 * 24);
  const { decl, eqt } = sunDeclinationAndEquation(jd);
  // Local solar transit in clock hours.
  const transit = 12 + coords.tz - coords.lng / 15 - eqt;
  const transitMinutes = transit * 60;
  const fajrAngle = convention === 'gulf' ? FAJR_ANGLE_GULF : FAJR_ANGLE_UMM_AL_QURA;
  const t = angleTime(SUNRISE_SUNSET_ANGLE, coords.lat, decl);
  const tFajr = angleTime(fajrAngle, coords.lat, decl);
  const tAsr = asrTime(ASR_SHADOW_FACTOR, coords.lat, decl);
  const nan = Number.isNaN(t) || Number.isNaN(tFajr) || Number.isNaN(tAsr);
  const minutesOf = (base: number): number => base;
  return {
    fajr: localDateAt(date, coords.tz, nan ? 0 : minutesOf(transitMinutes - tFajr * 60)),
    sunrise: localDateAt(date, coords.tz, nan ? 0 : minutesOf(transitMinutes - t * 60)),
    dhuhr: localDateAt(date, coords.tz, minutesOf(transitMinutes)),
    asr: localDateAt(date, coords.tz, nan ? 0 : minutesOf(transitMinutes + tAsr * 60)),
    maghrib: localDateAt(date, coords.tz, nan ? 0 : minutesOf(transitMinutes + t * 60)),
    isha: localDateAt(date, coords.tz, nan ? 0 : minutesOf(transitMinutes + t * 60 + ISHA_DELAY_MINUTES)),
  };
}

export const PRAYER_NAMES_AR: Record<PrayerKey, string> = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

export const PRAYER_NAMES_EN: Record<PrayerKey, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

const HHMM_REMINDER_KEYS: readonly PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** Local `HH:MM` rendering of a prayer Date. */
export function formatPrayerClock(when: Date, tz: number): string {
  const shifted = new Date(when.getTime() + tz * 3_600_000);
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * The five worship times (sunrise excluded from reminders), sorted, starting
 * from a given moment: today's remaining prayers first, then tomorrow's.
 */
export function upcomingPrayerTimes(
  now: Date,
  coords: CityCoords,
  convention: PrayerConvention = 'umm_al_qura',
  maxCount = 5,
): { key: PrayerKey; when: Date }[] {
  const out: { key: PrayerKey; when: Date }[] = [];
  for (let dayOffset = 0; dayOffset <= 1 && out.length < maxCount; dayOffset++) {
    const date = new Date(now.getTime() + dayOffset * 86_400_000);
    const times = computePrayerTimes(date, coords, convention);
    for (const key of HHMM_REMINDER_KEYS) {
      if (times[key].getTime() > now.getTime()) out.push({ key, when: times[key] });
      if (out.length >= maxCount) break;
    }
  }
  return out.slice(0, maxCount);
}
