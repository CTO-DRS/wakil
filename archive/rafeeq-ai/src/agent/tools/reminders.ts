// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Reminder tools — the agent's flagship capability ("ذكّرني أتصل على أبوي
 * بعد العصر"): one-shot local notifications at an ISO time or in N minutes,
 * listed and cancellable by id. The pure rules live in reminders.ts.
 */

import { ToolRegistry } from '../registry';
import type { ToolDefinition, ToolResult } from '../types';
import {
  scheduleReminderBatch,
  summarizeReminders,
  useRemindersStore,
  normalizeReminderText,
  type AgentReminderIO,
} from '../reminders';
import { resolveReminderWhen, sanitizeGrammarText } from './normalize';

export interface ReminderToolDeps {
  /** The reminder platform (tests inject fakes); defaults to expo-notifications. */
  reminderIO?: AgentReminderIO;
  now?: () => Date;
}

const remindersCreate = (deps: ReminderToolDeps): ToolDefinition => ({
  name: 'reminders.create',
  descriptionAr: 'يسجّل تنبيهًا في وقت محدد (ISO أو بعد دقائق) تظهر رسالته في الإشعارات (بعد موافقتك).',
  descriptionEn: 'Schedules a notification at an ISO time or in N minutes (after approval).',
  category: 'productivity',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'What the notification says' },
      when_iso: { type: 'string', description: 'Local time, e.g. 2026-11-09T18:30' },
      in_minutes: { type: 'integer', description: 'Or minutes from now, 1-43200' },
      body: { type: 'string', description: 'Optional extra line' },
    },
    required: ['title'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const io = deps.reminderIO;
    if (!io) {
      return { ok: false, error: ctx.locale === 'ar' ? 'منصة التنبيهات غير متاحة في هذه النسخة.' : 'The notification platform is unavailable in this build.' };
    }
    const text = normalizeReminderText(args.title, args.body);
    if (!text.ok) return { ok: false, error: ctx.locale === 'ar' ? 'عنوان التنبيه فارغ.' : 'The reminder title is empty.' };
    const now = (deps.now ?? (() => new Date()))();
    const when = resolveReminderWhen({ when_iso: args.when_iso, in_minutes: args.in_minutes }, now);
    if (!when.ok) {
      const ar: Record<string, string> = {
        WHEN_INVALID: 'الصيغة الزمنية غير مفهومة — استخدم مثل 2026-11-09T08:30 أو عدد الدقائق.',
        WHEN_PAST: 'هذا الوقت مضى — اختر وقتًا قادمًا.',
        WHEN_BOTH: 'اختر وقتًا واحدًا فقط: تاريخ ISO أو عدد دقائق.',
        WHEN_MISSING: 'ينقص الوقت: حدد تاريخ ISO أو عدد الدقائق.',
      };
      const en: Record<string, string> = {
        WHEN_INVALID: 'Timestamp not understood — use e.g. 2026-11-09T08:30 or minutes.',
        WHEN_PAST: 'That time already passed — pick a future moment.',
        WHEN_BOTH: 'Choose exactly one time form: ISO timestamp or minutes.',
        WHEN_MISSING: 'Time missing: give an ISO timestamp or minutes.',
      };
      return { ok: false, error: ctx.locale === 'ar' ? (ar[when.error] ?? when.error) : (en[when.error] ?? when.error) };
    }
    const scheduleId = `ur_${now.getTime().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const scheduled = await scheduleReminderBatch(
      [{ id: scheduleId, title: text.title, body: text.body, when: when.when, tag: 'user' }],
      io,
    );
    if (!scheduled.ok) {
      return { ok: false, error: ctx.locale === 'ar' ? 'لم تُسمح التنبيهات — فعّل إشعارات رفيق من الإعدادات.' : 'Notifications were not allowed — enable Rafeeq notifications in settings.' };
    }
    if (scheduled.ids[0]) {
      useRemindersStore.getState().addReminder({
        id: scheduled.ids[0],
        title: text.title,
        body: text.body,
        whenMs: when.when.getTime(),
        tag: 'user',
      });
    }
    const whenShown = when.when.toLocaleString(ctx.locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'full', timeStyle: 'short' });
    return {
      ok: true,
      data: ctx.locale === 'ar' ? `سجّلت التنبيه «${text.title}» — ${whenShown}.` : `Scheduled “${text.title}” — ${whenShown}.`,
    };
  },
});

const remindersList: ToolDefinition = {
  name: 'reminders.list',
  descriptionAr: 'يعرض تنبيهاتك القادمة المسجّلة على الجهاز.',
  descriptionEn: 'Lists your upcoming scheduled reminders on the device.',
  category: 'productivity',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_args, ctx): Promise<ToolResult> {
    const records = useRemindersStore.getState().getReminders();
    return { ok: true, data: summarizeReminders(records, ctx.locale, 10, ctx.now().getTime()) };
  },
};

const remindersCancel = (deps: ReminderToolDeps): ToolDefinition => ({
  name: 'reminders.cancel',
  descriptionAr: 'يلغي تنبيهًا مسجّلًا حسب رقمه من reminders.list (بعد موافقتك).',
  descriptionEn: 'Cancels a scheduled reminder by its id from reminders.list (after your approval).',
  category: 'productivity',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Reminder id from reminders.list' },
    },
    required: ['id'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const io = deps.reminderIO;
    if (!io) {
      return { ok: false, error: ctx.locale === 'ar' ? 'منصة التنبيهات غير متاحة في هذه النسخة.' : 'The notification platform is unavailable in this build.' };
    }
    const id = sanitizeGrammarText(String(args.id ?? ''));
    if (!id) return { ok: false, error: ctx.locale === 'ar' ? 'رقم التنبيه ناقص — اعرض التنبيهات أولًا.' : 'The reminder id is missing — list the reminders first.' };
    const found = useRemindersStore.getState().getReminders().some((r) => r.id === id);
    if (!found) {
      return { ok: false, error: ctx.locale === 'ar' ? `لم أجد تنبيهًا برقم ${id}.` : `No reminder with id ${id}.` };
    }
    try {
      await io.cancel(id);
    } catch {
      // A stale id that no longer exists is not a failure.
    }
    useRemindersStore.getState().removeReminder(id);
    return { ok: true, data: ctx.locale === 'ar' ? `ألغيت التنبيه ${id}.` : `Cancelled reminder ${id}.` };
  },
});

/** Registers the reminder tool family on a registry. */
export function registerReminderTools(registry: ToolRegistry, deps: ReminderToolDeps = {}): ToolRegistry {
  registry.register(remindersCreate(deps));
  registry.register(remindersList);
  registry.register(remindersCancel(deps));
  return registry;
}
