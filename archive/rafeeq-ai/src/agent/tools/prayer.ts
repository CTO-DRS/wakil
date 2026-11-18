// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Prayer tools: offline times for the user's city and optional reminders for
 * the next prayers. The calculation is pure (prayer.ts); the location chain
 * is device GPS (expo-location, non-prompting) → saved city → Riyadh, and
 * the reminder scheduling rides the injectable AgentReminderIO.
 */

import { ToolRegistry } from '../registry';
import type { ToolDefinition, ToolResult } from '../types';
import {
  DEFAULT_CITY,
  PRAYER_NAMES_AR,
  PRAYER_NAMES_EN,
  computePrayerTimes,
  formatPrayerClock,
  resolveCity,
  upcomingPrayerTimes,
  type CityCoords,
  type PrayerKey,
} from '../prayer';
import {
  scheduleReminderBatch,
  useRemindersStore,
  type AgentReminderIO,
} from '../reminders';
import { clampIntArg } from './normalize';

export interface PrayerToolDeps {
  /** Resolves the device coordinates (tests inject fakes); null when unavailable. */
  getLocation?: () => Promise<{ lat: number; lng: number } | null>;
  /** The reminder platform (tests inject fakes); defaults to expo-notifications. */
  reminderIO?: AgentReminderIO;
  now?: () => Date;
}

const CITY_NAMES_AR: Record<string, string> = {
  riyadh: 'الرياض',
  jeddah: 'جدة',
  makkah: 'مكة المكرمة',
  madinah: 'المدينة المنورة',
  dammam: 'الدمام',
  khobar: 'الخبر',
  taif: 'الطائف',
  abha: 'أبها',
  buraidah: 'بريدة',
  tabuk: 'تبوك',
  hail: 'حائل',
  jubail: 'الجبيل',
};

const cityName = (key: string, locale: 'ar' | 'en'): string =>
  locale === 'ar' ? (CITY_NAMES_AR[key] ?? key) : key;

const prayerNames = (key: PrayerKey, locale: 'ar' | 'en'): string =>
  locale === 'ar' ? PRAYER_NAMES_AR[key] : PRAYER_NAMES_EN[key];

/**
 * Resolves the coordinates for a run: GPS fix (if the app already holds the
 * permission) → the tool's city argument → the saved default → Riyadh.
 */
async function resolveCoords(args: Record<string, unknown>, deps: PrayerToolDeps, locale: 'ar' | 'en'): Promise<{ coords: CityCoords; cityKey: string; source: string } | ToolResult> {
  let cityKey: string;
  let coords: CityCoords;
  let source: string;
  const named = resolveCity(args.city);
  if (named) {
    cityKey = named.key;
    coords = named.coords;
    source = locale === 'ar' ? named.key : named.key;
  } else {
    cityKey = DEFAULT_CITY;
    coords = { lat: 24.7136, lng: 46.6753, tz: 3 };
    source = DEFAULT_CITY;
  }
  if (deps.getLocation) {
    try {
      const fix = await Promise.race([
        deps.getLocation(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);
      if (fix) {
        return { coords: { lat: fix.lat, lng: fix.lng, tz: coords.tz }, cityKey, source: locale === 'ar' ? 'موقعك الحالي' : 'your location' };
      }
    } catch {
      // Fall through to the city chain.
    }
  }
  return { coords, cityKey, source };
}

function renderPrayerTimes(times: Record<PrayerKey, Date>, tz: number, locale: 'ar' | 'en'): string {
  const order: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  return order
    .map((key) => `${prayerNames(key, locale)}: ${formatPrayerClock(times[key], tz)}`)
    .join('، ');
}

const prayerTimes = (deps: PrayerToolDeps): ToolDefinition => ({
  name: 'prayer.times',
  descriptionAr: 'يحسب مواقيت صلاة اليوم أو الغد بدون إنترنت (حسب موقعك أو مدينة محددة).',
  descriptionEn: 'Computes today or tomorrow prayer times fully offline (by location or a named Saudi city).',
  category: 'time',
  mutating: false,
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'Saudi city name like riyadh or جدة (optional; default Riyadh)' },
      day_offset: { type: 'integer', description: '0 = today, 1 = tomorrow (default 0)' },
    },
    required: [],
  },
  async run(args, ctx): Promise<ToolResult> {
    const now = (deps.now ?? (() => new Date()))();
    const resolved = await resolveCoords(args, deps, ctx.locale);
    if ('ok' in resolved && resolved.ok === false) return resolved as ToolResult;
    const { coords, cityKey, source } = resolved as { coords: CityCoords; cityKey: string; source: string };
    const offset = clampIntArg(args.day_offset, 0, 7, 0);
    const date = new Date(now.getTime() + offset * 86_400_000);
    const times = computePrayerTimes(date, coords, 'umm_al_qura');
    const shownSource = source === 'your location' || source === 'موقعك الحالي'
      ? (ctx.locale === 'ar' ? 'موقعك الحالي' : 'your location')
      : cityName(cityKey, ctx.locale);
    const data = ctx.locale === 'ar'
      ? `مواقيت ${shownSource} (${offset === 0 ? 'اليوم' : `بعد ${offset} يوم`}) — ${renderPrayerTimes(times as Record<PrayerKey, Date>, coords.tz, 'ar')}، طريقة أم القرى.`
      : `${shownSource} times (${offset === 0 ? 'today' : `in ${offset} day(s)`}) — ${renderPrayerTimes(times as Record<PrayerKey, Date>, coords.tz, 'en')} (Umm al-Qura).`;
    return { ok: true, data };
  },
});

const prayerRemindersSet = (deps: PrayerToolDeps): ToolDefinition => ({
  name: 'prayer.reminders_set',
  descriptionAr: 'يسجّل تنبيهات محلية للمواقيت القادمة (بعد موافقتك)؛ يلغي تنبيهات المواقيت السابقة أولًا.',
  descriptionEn: 'Schedules local notifications for the next prayers (after your approval); replaces the previous prayer reminders.',
  category: 'time',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'Saudi city name like riyadh or جدة (optional; default Riyadh)' },
      count: { type: 'integer', description: 'How many next prayers, 1-5 (default 5)' },
    },
    required: [],
  },
  async run(args, ctx): Promise<ToolResult> {
    const now = (deps.now ?? (() => new Date()))();
    const resolved = await resolveCoords(args, deps, ctx.locale);
    if ('ok' in resolved && resolved.ok === false) return resolved as ToolResult;
    const { coords, cityKey } = resolved as { coords: CityCoords; cityKey: string; source: string };
    const count = clampIntArg(args.count, 1, 5, 5);
    const upcoming = upcomingPrayerTimes(now, coords, 'umm_al_qura', count);
    if (upcoming.length === 0) {
      return { ok: false, error: ctx.locale === 'ar' ? 'لم أستطع حساب المواقيت القادمة.' : 'Could not compute upcoming prayers.' };
    }
    const io = deps.reminderIO;
    if (!io) {
      return { ok: false, error: ctx.locale === 'ar' ? 'منصة التنبيهات غير متاحة في هذه النسخة.' : 'The notification platform is unavailable in this build.' };
    }
    // Replace the previous prayer reminders so they never stack.
    const store = useRemindersStore.getState();
    const existing = store.getReminders().filter((r) => r.tag === 'prayer');
    for (const record of existing) {
      try { await io.cancel(record.id); } catch { /* a stale id is not a failure */ }
      store.removeReminder(record.id);
    }
    const cityAr = cityName(cityKey, 'ar');
    const entries = upcoming.map(({ key, when }, i) => ({
      id: `pr_${now.getTime().toString(36)}_${i}`,
      title: ctx.locale === 'ar' ? `حان وقت صلاة ${PRAYER_NAMES_AR[key]}` : `Time for ${PRAYER_NAMES_EN[key]}`,
      body: ctx.locale === 'ar' ? `وفق مواقيت ${cityAr}` : `According to ${cityName(cityKey, 'en')} times`,
      when,
      tag: 'prayer' as const,
    }));
    const scheduled = await scheduleReminderBatch(entries, io);
    if (!scheduled.ok) {
      return { ok: false, error: ctx.locale === 'ar' ? 'لم تُسمح التنبيهات — فعّل إشعارات رفيق من الإعدادات.' : 'Notifications were not allowed — enable Rafeeq notifications in settings.' };
    }
    for (let i = 0; i < entries.length; i++) {
      if (scheduled.ids[i]) {
        useRemindersStore.getState().addReminder({
          id: scheduled.ids[i],
          title: entries[i].title,
          body: entries[i].body,
          whenMs: entries[i].when.getTime(),
          tag: 'prayer',
        });
      }
    }
    const list = upcoming
      .map(({ key, when }) => `${prayerNames(key, ctx.locale)} ${formatPrayerClock(when, coords.tz)}`)
      .join(ctx.locale === 'ar' ? '، ' : ', ');
    return {
      ok: true,
      data: ctx.locale === 'ar' ? `سجّلت ${scheduled.ids.length} تنبيهًا: ${list}.` : `Scheduled ${scheduled.ids.length} prayer reminders: ${list}.`,
    };
  },
});

/** Registers the prayer tool family on a registry. */
export function registerPrayerTools(registry: ToolRegistry, deps: PrayerToolDeps = {}): ToolRegistry {
  registry.register(prayerTimes(deps));
  registry.register(prayerRemindersSet(deps));
  return registry;
}
