// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Phase-2 phone tools: contacts, calls, SMS/WhatsApp drafts, alarms, timers,
 * calendar, and device settings shortcuts — all behind the RafeeqTools
 * native module (Android). Read-only tools run directly; every mutating tool
 * stops at the agent's confirmation card first, and permission problems come
 * back as honest Arabic observations instead of silent failures.
 */

import { ToolRegistry } from '../registry';
import type { ToolDefinition, ToolResult, ToolContext } from '../types';
import { getRafeeqNativeOrOverride, type RafeeqToolsApi } from './native';
import {
  clampIntArg,
  normalizePhone,
  parseClockTime,
  parseTimerSeconds,
  parseWhenIso,
  sanitizeGrammarText,
} from './normalize';

export interface PhoneToolDeps {
  /** Injected native API (tests); defaults to the real module lookup. */
  native?: () => RafeeqToolsApi | null;
}

function unavailable(locale: 'ar' | 'en'): ToolResult {
  return {
    ok: false,
    error: locale === 'ar'
      ? 'أدوات الهاتف متاحة على أندرويد فقط في هذه النسخة.'
      : 'Phone tools are Android-only in this build.',
  };
}

function codeMessage(code: string, locale: 'ar' | 'en'): string {
  const ar: Record<string, string> = {
    PERMISSION_CONTACTS: 'أحتاج إذن «جهات الاتصال» لقراءة الأسماء — امنح الإذن من إعدادات التطبيق ثم أعد الطلب.',
    PERMISSION_CALENDAR: 'أحتاج إذن «التقويم» للقراءة والتعديل — امنح الإذن من إعدادات التطبيق ثم أعد الطلب.',
    NEED_POLICY_ACCESS: 'لتفعيل «عدم الإزعاج» أعطني إذن «عدم التدخل» من إعدادات أندرويد (الوصول الخاص).',
    NEED_WRITE_SETTINGS: 'لتعديل السطوع أعطني إذن «تعديل إعدادات النظام» من شاشة الأذونات الخاصة.',
    WHATSAPP_MISSING: 'واتساب غير مثبّت على هذا الجهاز.',
    NO_SMS_APP: 'لا يوجد تطبيق رسائل على الجهاز.',
    NO_DIALER: 'لا يوجد تطبيق اتصال على الجهاز.',
    NO_CLOCK_APP: 'لم أجد تطبيق الساعة على الجهاز.',
    NO_FLASH: 'هذا الجهاز بلا مصباح.',
    TORCH_BUSY: 'المصباح مشغول الآن بتطبيق آخر.',
    EVENT_NOT_FOUND: 'لم أجد هذا الحدث في التقويم — أعد قراءة الأحداث ثم كرر.',
    NO_CALENDAR: 'لا يوجد تقويم مضاف على الجهاز.',
    ALARM_TIME_INVALID: 'وقت المنبه غير صحيح (الساعة 0–23 والدقيقة 0–59).',
    TIMER_LENGTH_INVALID: 'طول المؤقت غير صحيح (من 5 ثوانٍ إلى 24 ساعة).',
    PHONE_EMPTY: 'رقم الهاتف ناقص.',
    PHONE_INVALID: 'رقم الهاتف غير صحيح.',
    WHEN_INVALID: 'الصيغة الزمنية غير مفهومة — استخدم مثل 2026-11-09T08:30.',
    WHEN_PAST: 'هذا الوقت مضى — اختر وقتًا قادمًا.',
    WHEN_BOTH: 'اختر وقتًا واحدًا فقط: تاريخ ISO أو عدد دقائق.',
    WHEN_MISSING: 'ينقص الوقت: حدد تاريخ ISO أو عدد الدقائق.',
  };
  const en: Record<string, string> = {
    PERMISSION_CONTACTS: 'I need the Contacts permission to read names — grant it in app settings and retry.',
    PERMISSION_CALENDAR: 'I need the Calendar permissions to read and edit events — grant them in app settings and retry.',
    NEED_POLICY_ACCESS: 'To toggle Do Not Disturb I need the notification-policy access from Android special settings.',
    NEED_WRITE_SETTINGS: 'To change brightness I need the “modify system settings” permission.',
    WHATSAPP_MISSING: 'WhatsApp is not installed on this device.',
    NO_SMS_APP: 'No SMS app is installed on this device.',
    NO_DIALER: 'No dialer app is installed on this device.',
    NO_CLOCK_APP: 'I could not find a clock app on this device.',
    NO_FLASH: 'This device has no flash.',
    TORCH_BUSY: 'The torch is currently held by another app.',
    EVENT_NOT_FOUND: 'That event was not found — list the events again and retry.',
    NO_CALENDAR: 'No calendar account exists on this device.',
    ALARM_TIME_INVALID: 'Invalid alarm time (hour 0–23, minute 0–59).',
    TIMER_LENGTH_INVALID: 'Invalid timer length (5 s to 24 h).',
    PHONE_EMPTY: 'The phone number is missing.',
    PHONE_INVALID: 'The phone number is not valid.',
    WHEN_INVALID: 'Timestamp not understood — use e.g. 2026-11-09T08:30.',
    WHEN_PAST: 'That time already passed — pick a future moment.',
    WHEN_BOTH: 'Choose exactly one time form: ISO timestamp or minutes.',
    WHEN_MISSING: 'Time missing: give an ISO timestamp or minutes.',
  };
  return locale === 'ar' ? (ar[code] ?? code) : (en[code] ?? code);
}

/** Wraps a native result; maps failure codes to the localized observation. */
function fromNative(
  result: { ok: boolean; code?: string },
  locale: 'ar' | 'en',
  okData: string,
): ToolResult {
  if (result.ok) return { ok: true, data: okData };
  return { ok: false, error: result.code ? codeMessage(result.code, locale) : locale === 'ar' ? 'فشلت العملية على الجهاز.' : 'The device operation failed.' };
}

function fmtTime(t: { hour: number; minute: number }, locale: 'ar' | 'en'): string {
  const at = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
  return locale === 'ar' ? `الساعة ${at}` : `at ${at}`;
}

function fmtDate(d: Date, locale: 'ar' | 'en'): string {
  return d.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'full', timeStyle: 'short' });
}

const contactsSearch = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'contacts.search',
  descriptionAr: 'يبحث في جهات اتصال الجهاز بالاسم أو جزء من الرقم ويعرض الأرقام.',
  descriptionEn: 'Searches device contacts by name or number fragment and shows the numbers.',
  category: 'communication',
  mutating: false,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Name fragment or number fragment' },
      limit: { type: 'integer', description: 'Max results 1-10 (default 5)' },
    },
    required: ['query'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const query = sanitizeGrammarText(String(args.query ?? ''));
    if (!query) return { ok: false, error: ctx.locale === 'ar' ? 'اكتب اسمًا للبحث.' : 'Provide a name to search.' };
    const limit = clampIntArg(args.limit, 1, 10, 5);
    const res = await native.contactsSearch(query, limit);
    if (!res.ok) return fromNative(res, ctx.locale, '');
    const contacts = res.contacts ?? [];
    if (contacts.length === 0) {
      return { ok: true, data: ctx.locale === 'ar' ? `لا توجد جهة تطابق «${query}».` : `No contact matches “${query}”.` };
    }
    const lines = contacts.map((c, i) => `${i + 1}. ${c.name} — ${c.phone}`);
    return { ok: true, data: lines.join('\n') };
  },
});

const contactsCall = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'contacts.call',
  descriptionAr: 'يتصل برقم هاتف فورًا بعد موافقتك، أو يفتح لوحة الاتصال بالرقم إن نقص الإذن.',
  descriptionEn: 'Dials a number immediately (after approval), or opens the dialer pre-filled without the permission.',
  category: 'communication',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      phone: { type: 'string', description: 'Phone number, digits with optional +' },
      name: { type: 'string', description: 'Optional contact name for the message' },
    },
    required: ['phone'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const phone = normalizePhone(args.phone);
    if (!phone.ok) return { ok: false, error: codeMessage(phone.error, ctx.locale) };
    const res = await native.callNumber(phone.phone);
    const who = sanitizeGrammarText(String(args.name ?? ''));
    const label = who || phone.phone;
    const okData = ctx.locale === 'ar'
      ? (res.mode === 'call' ? `أبدأ الاتصال بـ ${label} الآن.` : `فتحت لوحة الاتصال بـ ${label} — اضغط زر الاتصال لإكمال المكالمة.`)
      : (res.mode === 'call' ? `Calling ${label} now.` : `Opened the dialer with ${label} — press call to complete.`);
    return fromNative(res, ctx.locale, okData);
  },
});

const smsDraft = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'messages.sms_draft',
  descriptionAr: 'يفتح تطبيق الرسائل برسالة جاهزة النص والرقم — أنت من يضغط إرسال.',
  descriptionEn: 'Opens the SMS app with the text and number pre-filled — you press send.',
  category: 'communication',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      body: { type: 'string', description: 'Message text' },
      phone: { type: 'string', description: 'Recipient number (optional)' },
    },
    required: ['body'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const body = sanitizeGrammarText(String(args.body ?? ''));
    if (!body) return { ok: false, error: ctx.locale === 'ar' ? 'نص الرسالة فارغ.' : 'The message text is empty.' };
    let phone: string | null = null;
    if (args.phone !== undefined && args.phone !== null && String(args.phone).trim() !== '') {
      const p = normalizePhone(args.phone);
      if (!p.ok) return { ok: false, error: codeMessage(p.error, ctx.locale) };
      phone = p.phone;
    }
    const res = await native.draftSms(phone, body);
    const okData = ctx.locale === 'ar' ? 'فتحت الرسائل مع النص جاهزًا — راجعه واضغط إرسال.' : 'Opened Messages with the draft ready — review and press send.';
    return fromNative(res, ctx.locale, okData);
  },
});

const whatsappDraft = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'messages.whatsapp_draft',
  descriptionAr: 'يفتح واتساب برسالة جاهزة النص (ورقم اختياري) — أنت من يضغط إرسال.',
  descriptionEn: 'Opens WhatsApp with the message pre-filled (optional recipient) — you press send.',
  category: 'communication',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Message text' },
      phone: { type: 'string', description: 'Recipient number with country code (optional)' },
    },
    required: ['text'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const text = sanitizeGrammarText(String(args.text ?? ''));
    if (!text) return { ok: false, error: ctx.locale === 'ar' ? 'نص الرسالة فارغ.' : 'The message text is empty.' };
    let phone: string | null = null;
    if (args.phone !== undefined && args.phone !== null && String(args.phone).trim() !== '') {
      const p = normalizePhone(args.phone);
      if (!p.ok) return { ok: false, error: codeMessage(p.error, ctx.locale) };
      phone = p.phone;
    }
    const res = await native.draftWhatsApp(text, phone);
    const okData = ctx.locale === 'ar' ? 'فتحت واتساب مع الرسالة جاهزة — راجعها واضغط إرسال.' : 'Opened WhatsApp with the draft ready — review and press send.';
    return fromNative(res, ctx.locale, okData);
  },
});

const alarmsSet = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'alarms.set',
  descriptionAr: 'يثبّت منبهًا في تطبيق الساعة على وقت محدد (بعد موافقتك).',
  descriptionEn: 'Sets an alarm in the clock app at a given time (after your approval).',
  category: 'device',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      hour: { type: 'integer', description: 'Hour 0-23' },
      minute: { type: 'integer', description: 'Minute 0-59' },
      label: { type: 'string', description: 'Optional alarm label' },
    },
    required: ['hour', 'minute'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const t = parseClockTime(args.hour, args.minute);
    if (!t.ok) return { ok: false, error: codeMessage(t.error, ctx.locale) };
    const label = args.label === undefined || args.label === null ? null : sanitizeGrammarText(String(args.label)) || null;
    const res = await native.setAlarmClock(t.time.hour, t.time.minute, label);
    const okData = ctx.locale === 'ar'
      ? `ثبّت المنبه ${fmtTime(t.time, 'ar')}${label ? ` (${label})` : ''} في تطبيق الساعة.`
      : `Set the alarm ${fmtTime(t.time, 'en')}${label ? ` (${label})` : ''} in the clock app.`;
    return fromNative(res, ctx.locale, okData);
  },
});

const timersSet = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'timers.set',
  descriptionAr: 'يشغّل مؤقتًا في تطبيق الساعة لعدد ثوانٍ محدد (بعد موافقتك).',
  descriptionEn: 'Starts a timer in the clock app for a number of seconds (after your approval).',
  category: 'device',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      seconds: { type: 'integer', description: 'Duration in seconds, 5 to 86400' },
      label: { type: 'string', description: 'Optional timer label' },
    },
    required: ['seconds'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const t = parseTimerSeconds(args.seconds);
    if (!t.ok) return { ok: false, error: codeMessage(t.error, ctx.locale) };
    const label = args.label === undefined || args.label === null ? null : sanitizeGrammarText(String(args.label)) || null;
    const res = await native.setDeviceTimer(t.seconds, label);
    const minutes = Math.floor(t.seconds / 60);
    const shown = t.seconds % 60 === 0
      ? ctx.locale === 'ar' ? `${minutes} دقيقة` : `${minutes} min`
      : ctx.locale === 'ar' ? `${t.seconds} ثانية` : `${t.seconds} s`;
    const okData = ctx.locale === 'ar' ? `شغّلت المؤقت ${shown} في تطبيق الساعة.` : `Started a ${shown} timer in the clock app.`;
    return fromNative(res, ctx.locale, okData);
  },
});

const calendarEvents = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'calendar.events',
  descriptionAr: 'يعرض الأحداث القادمة من تقويم الجهاز مع أرقام الأحداث (event_id) وتواريخها.',
  descriptionEn: 'Lists upcoming events from the device calendar with their event_id numbers and dates.',
  category: 'productivity',
  mutating: false,
  parameters: {
    type: 'object',
    properties: {
      days_ahead: { type: 'integer', description: 'Look-ahead days 1-60 (default 7)' },
      max: { type: 'integer', description: 'Max events 1-20 (default 10)' },
    },
    required: [],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const days = clampIntArg(args.days_ahead, 1, 60, 7);
    const max = clampIntArg(args.max, 1, 20, 10);
    const res = await native.calendarListUpcoming(days, max);
    if (!res.ok) return fromNative(res, ctx.locale, '');
    const events = res.events ?? [];
    if (events.length === 0) {
      return { ok: true, data: ctx.locale === 'ar' ? `لا أحداث في الأيام ${days} القادمة.` : `No events in the next ${days} days.` };
    }
    const lines = events.map((e, i) => {
      const when = new Date(e.startMs).toLocaleString(ctx.locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      const place = e.location ? ` — ${e.location}` : '';
      return `${i + 1}. [event_id: ${e.id}] ${e.title} — ${when}${place}`;
    });
    return { ok: true, data: lines.join('\n') };
  },
});

const calendarCreate = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'calendar.create',
  descriptionAr: 'يضيف حدثًا إلى التقويم بعنوان ووقت بداية ISO (بعد موافقتك).',
  descriptionEn: 'Creates a calendar event with a title and ISO start time (after approval).',
  category: 'productivity',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title' },
      start_iso: { type: 'string', description: 'Local start, e.g. 2026-11-09T08:30' },
      end_iso: { type: 'string', description: 'Local end (default start+1h)' },
      all_day: { type: 'boolean', description: 'All-day event (default false)' },
      notes: { type: 'string', description: 'Optional description' },
    },
    required: ['title', 'start_iso'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const title = sanitizeGrammarText(String(args.title ?? ''));
    if (!title) return { ok: false, error: ctx.locale === 'ar' ? 'عنوان الحدث فارغ.' : 'The event title is empty.' };
    const start = parseWhenIso(args.start_iso);
    if (!start.ok) return { ok: false, error: codeMessage(start.error, ctx.locale) };
    let endMs: number | null = null;
    if (args.end_iso !== undefined && args.end_iso !== null && String(args.end_iso).trim() !== '') {
      const end = parseWhenIso(args.end_iso);
      if (!end.ok) return { ok: false, error: codeMessage(end.error, ctx.locale) };
      if (end.when.getTime() <= start.when.getTime()) {
        return { ok: false, error: ctx.locale === 'ar' ? 'وقت النهاية قبل البداية.' : 'The end time is before the start.' };
      }
      endMs = end.when.getTime();
    }
    const allDay = args.all_day === true;
    const notes = args.notes === undefined || args.notes === null ? null : sanitizeGrammarText(String(args.notes)) || null;
    const res = await native.calendarCreate(title, start.when.getTime(), endMs, allDay, notes);
    const okData = ctx.locale === 'ar'
      ? `أضفت «${title}» إلى التقويم${allDay ? ' لليوم كامل' : ` — ${fmtDate(start.when, 'ar')}`}.`
      : `Added “${title}” to the calendar${allDay ? ' (all day)' : ` — ${fmtDate(start.when, 'en')}`}.`;
    return fromNative(res, ctx.locale, okData);
  },
});

const calendarMove = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'calendar.move',
  descriptionAr: 'ينقل حدثًا في التقويم لوقت جديد (بعد موافقتك)؛ خذ event_id من calendar.events أولًا.',
  descriptionEn: 'Moves a calendar event to a new time (after approval); take the event_id from calendar.events first.',
  category: 'productivity',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      event_id: { type: 'integer', description: 'The event id from calendar.events' },
      new_start_iso: { type: 'string', description: 'New local start, e.g. 2026-11-10T16:00' },
      new_end_iso: { type: 'string', description: 'New local end (optional)' },
    },
    required: ['event_id', 'new_start_iso'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const eventId = typeof args.event_id === 'number' && Number.isFinite(args.event_id) ? Math.trunc(args.event_id) : NaN;
    if (Number.isNaN(eventId) || eventId <= 0) {
      return { ok: false, error: ctx.locale === 'ar' ? 'event_id غير صحيح — اقرأ الأحداث أولًا.' : 'Invalid event_id — list the events first.' };
    }
    const start = parseWhenIso(args.new_start_iso);
    if (!start.ok) return { ok: false, error: codeMessage(start.error, ctx.locale) };
    let endMs: number | null = null;
    if (args.new_end_iso !== undefined && args.new_end_iso !== null && String(args.new_end_iso).trim() !== '') {
      const end = parseWhenIso(args.new_end_iso);
      if (!end.ok) return { ok: false, error: codeMessage(end.error, ctx.locale) };
      if (end.when.getTime() <= start.when.getTime()) {
        return { ok: false, error: ctx.locale === 'ar' ? 'وقت النهاية قبل البداية.' : 'The end time is before the start.' };
      }
      endMs = end.when.getTime();
    }
    const res = await native.calendarMove(eventId, start.when.getTime(), endMs);
    const okData = ctx.locale === 'ar'
      ? `نقلت الحدث ${eventId} إلى ${fmtDate(start.when, 'ar')}.`
      : `Moved event ${eventId} to ${fmtDate(start.when, 'en')}.`;
    return fromNative(res, ctx.locale, okData);
  },
});

const torchSet = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'device.torch',
  descriptionAr: 'يشعل أو يطفئ مصباح الجهاز (بعد موافقتك).',
  descriptionEn: 'Turns the device torch on or off (after your approval).',
  category: 'device',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'true = on, false = off' },
    },
    required: ['enabled'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const res = await native.torchSet(args.enabled === true);
    const on = args.enabled === true;
    const okData = ctx.locale === 'ar' ? (on ? 'شعلت المصباح.' : 'أطفأت المصباح.') : (on ? 'Torch on.' : 'Torch off.');
    return fromNative(res, ctx.locale, okData);
  },
});

const dndSet = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'device.dnd',
  descriptionAr: 'يفعّل أو يلغي وضع عدم الإزعاج (بعد موافقتك).',
  descriptionEn: 'Enables or disables Do Not Disturb (after your approval).',
  category: 'device',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'true = DND on, false = off' },
    },
    required: ['enabled'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const res = await native.dndSet(args.enabled === true);
    if (!res.ok && res.code === 'NEED_POLICY_ACCESS') {
      try { await native.openPermissionSettings('dnd'); } catch { /* the message still guides the user */ }
      return { ok: false, error: codeMessage('NEED_POLICY_ACCESS', ctx.locale) };
    }
    const on = args.enabled === true;
    const okData = ctx.locale === 'ar' ? (on ? 'فعّلت وضع عدم الإزعاج.' : 'ألغيت وضع عدم الإزعاج.') : (on ? 'Do Not Disturb is on.' : 'Do Not Disturb is off.');
    return fromNative(res, ctx.locale, okData);
  },
});

const brightnessSet = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'device.brightness',
  descriptionAr: 'يضبط سطوع الشاشة من 1 (خافت) إلى 255 (أقصى) (بعد موافقتك).',
  descriptionEn: 'Sets the screen brightness from 1 (dim) to 255 (max) (after your approval).',
  category: 'device',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      value: { type: 'integer', description: 'Brightness 1-255' },
    },
    required: ['value'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const value = clampIntArg(args.value, 1, 255, 128);
    const res = await native.brightnessSet(value);
    if (!res.ok && res.code === 'NEED_WRITE_SETTINGS') {
      try { await native.openPermissionSettings('write_settings'); } catch { /* the message still guides the user */ }
      return { ok: false, error: codeMessage('NEED_WRITE_SETTINGS', ctx.locale) };
    }
    const okData = ctx.locale === 'ar' ? `ضبطت السطوع إلى ${value}.` : `Set brightness to ${value}.`;
    return fromNative(res, ctx.locale, okData);
  },
});

const wifiPanel = (deps: PhoneToolDeps): ToolDefinition => ({
  name: 'device.wifi_panel',
  descriptionAr: 'يفتح لوحة إعدادات الشبكة ليبدّل الواي فاي أو البيانات بنفسه.',
  descriptionEn: 'Opens the connectivity settings panel so the user toggles Wi-Fi or data themselves.',
  category: 'device',
  mutating: true,
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_args, ctx): Promise<ToolResult> {
    const native = (deps.native ?? getRafeeqNativeOrOverride)();
    if (!native) return unavailable(ctx.locale);
    const res = await native.openWifiPanel();
    const okData = ctx.locale === 'ar' ? 'فتحت لوحة الشبكة — بدّل الواي فاي من هناك.' : 'Opened the connectivity panel — toggle Wi-Fi there.';
    return fromNative(res, ctx.locale, okData);
  },
});

/** Registers the whole Phase-2 phone tool family on a registry. */
export function registerPhoneTools(registry: ToolRegistry, deps: PhoneToolDeps = {}): ToolRegistry {
  registry.register(contactsSearch(deps));
  registry.register(contactsCall(deps));
  registry.register(smsDraft(deps));
  registry.register(whatsappDraft(deps));
  registry.register(alarmsSet(deps));
  registry.register(timersSet(deps));
  registry.register(calendarEvents(deps));
  registry.register(calendarCreate(deps));
  registry.register(calendarMove(deps));
  registry.register(torchSet(deps));
  registry.register(dndSet(deps));
  registry.register(brightnessSet(deps));
  registry.register(wifiPanel(deps));
  return registry;
}

export const PHONE_TOOL_NAMES = [
  'contacts.search', 'contacts.call', 'messages.sms_draft', 'messages.whatsapp_draft',
  'alarms.set', 'timers.set', 'calendar.events', 'calendar.create', 'calendar.move',
  'device.torch', 'device.dnd', 'device.brightness', 'device.wifi_panel',
] as const;

/** Exposed for tests and docs: the stable risk table of every phone tool. */
export const PHONE_TOOL_RISKS: Record<(typeof PHONE_TOOL_NAMES)[number], 'read-only' | 'mutating'> = {
  'contacts.search': 'read-only',
  'contacts.call': 'mutating',
  'messages.sms_draft': 'mutating',
  'messages.whatsapp_draft': 'mutating',
  'alarms.set': 'mutating',
  'timers.set': 'mutating',
  'calendar.events': 'read-only',
  'calendar.create': 'mutating',
  'calendar.move': 'mutating',
  'device.torch': 'mutating',
  'device.dnd': 'mutating',
  'device.brightness': 'mutating',
  'device.wifi_panel': 'mutating',
};

export type { ToolContext };
