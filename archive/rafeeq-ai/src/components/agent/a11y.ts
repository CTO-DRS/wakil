// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Screen-reader wordings for the agent UI. Pure functions only — no React,
 * no store — so the exact strings a TalkBack user hears are table-driven and
 * unit-tested. The confirmation card reads a sentence a human can act on
 * ("يضبط منبهًا على الساعة 4:50") instead of raw JSON.
 */

export type A11yTranslator = (key: string, values?: Record<string, unknown>) => string;

const truncate = (text: string, max = 40): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const fmtTime = (args: Record<string, unknown>): string => {
  const hour = Number(args.hour ?? 0);
  const minute = Number(args.minute ?? 0);
  return `${hour}:${String(minute).padStart(2, '0')}`;
};

/** Renders the tool's arguments as spoken words, per tool. */
const CONFIRM_ARGS: Record<string, (args: Record<string, unknown>, t: A11yTranslator) => Record<string, unknown>> = {
  'alarms.set': (args, t) => ({ time: fmtTime(args), label: args.label ? truncate(String(args.label)) : t('agent.a11yNoLabel') }),
  'timers.set': (args) => ({ seconds: Number(args.seconds ?? 0), label: args.label ? truncate(String(args.label)) : '—' }),
  'reminders.create': (args, t) => ({
    title: truncate(String(args.title ?? '')),
    when: args.when_iso ? String(args.when_iso) : args.in_minutes !== undefined ? t('agent.a11yInMinutes', { n: Number(args.in_minutes) }) : t('agent.a11yNoLabel'),
  }),
  'reminders.cancel': (args) => ({ id: String(args.id ?? '') }),
  'reminders.list': () => ({}),
  'calendar.create': (args) => ({ title: truncate(String(args.title ?? '')), start: String(args.start_iso ?? '') }),
  'calendar.move': (args) => ({ event_id: String(args.event_id ?? ''), when: String(args.new_start_iso ?? '') }),
  'contacts.call': (args) => ({ name: args.name ? truncate(String(args.name)) : '—', phone: String(args.phone ?? '') }),
  'messages.sms_draft': (args, t) => ({
    phone: args.phone ? String(args.phone) : t('agent.a11yNoRecipient'),
    preview: truncate(String(args.body ?? '')),
  }),
  'messages.whatsapp_draft': (args, t) => ({
    phone: args.phone ? String(args.phone) : t('agent.a11yNoRecipient'),
    preview: truncate(String(args.text ?? '')),
  }),
  'device.torch': (args, t) => ({ state: args.enabled ? t('agent.a11yOn') : t('agent.a11yOff') }),
  'device.dnd': (args, t) => ({ state: args.enabled ? t('agent.a11yOn') : t('agent.a11yOff') }),
  'device.brightness': (args) => ({ value: Number(args.value ?? 0) }),
  'device.wifi_panel': () => ({}),
  'notes.create': (args) => ({ title: truncate(String(args.title ?? '')) }),
  'todos.add': (args) => ({ title: truncate(String(args.title ?? '')) }),
  'todos.complete': (args) => ({ id: String(args.id ?? '') }),
  'memory.save': (args) => ({ text: truncate(String(args.text ?? '')) }),
  'memory.forget': (args) => ({ query: truncate(String(args.query ?? '')) }),
  'prayer.reminders_set': (args, t) => ({ city: args.city ? String(args.city) : t('agent.a11yByLocation') }),
};

/**
 * The spoken confirmation: a per-tool sentence with the arguments rendered as
 * words ("يضبط منبهًا على الساعة 4:50"), closed by the risk line. Falls back
 * to a generic tool-name sentence for any unlisted tool.
 */
export function describeConfirmationA11y(tool: string, args: Record<string, unknown>, t: A11yTranslator): string {
  const known = CONFIRM_ARGS[tool] !== undefined;
  const params = (CONFIRM_ARGS[tool] ?? (() => ({})))(args, t);
  const sentence = known
    ? t(`agent.confirmTool_${tool.replace('.', '_')}`, params)
    : t('agent.confirmToolGeneric', { tool });
  return `${sentence} ${t('agent.a11yConfirmTail')}`;
}

/**
 * The spoken plan step: number, title, risk, live status, and whether it is
 * kept in the editable plan.
 */
export function describeStepA11y(
  index: number,
  title: string,
  status: string,
  mutating: boolean,
  included: boolean,
  t: A11yTranslator,
): string {
  const parts = [
    `${index}. ${title}`,
    mutating ? t('agent.mutating') : t('agent.readOnly'),
    t(`agent.step_${status}`),
    included ? t('agent.a11yIncluded') : t('agent.a11yExcluded'),
  ];
  return parts.join('. ');
}
