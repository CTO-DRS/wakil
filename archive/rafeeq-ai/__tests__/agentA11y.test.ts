// Copyright (c) 2026 DRS AI. All rights reserved.
import { describeConfirmationA11y, describeStepA11y } from '../src/components/agent/a11y';
import ar from '../src/i18n/ar';
import en from '../src/i18n/en';

/** A translator over a real bundle: a missing key throws, so the test
 *  enforces ar/en parity for every string the agent UI can speak. */
function makeTranslator(bundle: Record<string, unknown>) {
  return (key: string, values?: Record<string, unknown>): string => {
    const resolved = key.split('.').reduce<unknown>((node, part) => {
      if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
      return undefined;
    }, bundle);
    if (typeof resolved !== 'string') throw new Error(`MISSING_KEY: ${key}`);
    return resolved.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? `«${name}»`));
  };
}

const tAr = makeTranslator(ar as unknown as Record<string, unknown>);
const tEn = makeTranslator(en as unknown as Record<string, unknown>);

describe('the confirmation wording a screen reader speaks', () => {
  it.each([
    ['alarms.set', { hour: 4, minute: 50 }, '4:50'],
    ['timers.set', { seconds: 600 }, '600'],
    ['reminders.create', { title: 'أتصل على أبوي', in_minutes: 30 }, 'أتصل على أبوي'],
    ['reminders.cancel', { id: 'r_123' }, 'r_123'],
    ['calendar.create', { title: 'موعد الطبيب', start_iso: '2026-11-11T16:00' }, '2026-11-11T16:00'],
    ['calendar.move', { event_id: 12, new_start_iso: '2026-11-11T17:00' }, '12'],
    ['contacts.call', { phone: '0500000000', name: 'أبوي' }, '0500000000'],
    ['contacts.call', { phone: '0500000000' }, '0500000000'],
    ['messages.sms_draft', { body: 'وصلت البيت' }, 'وصلت البيت'],
    ['messages.whatsapp_draft', { text: 'وصلك الطلب؟', phone: '966501234567' }, '966501234567'],
    ['device.torch', { enabled: true }, 'يشغّل'],
    ['device.dnd', { enabled: false }, 'يطفئ'],
    ['device.brightness', { value: 50 }, '50'],
    ['notes.create', { title: 'فاتورة النت' }, 'فاتورة النت'],
    ['todos.add', { title: 'تمارين الصبح' }, 'تمارين الصبح'],
    ['todos.complete', { id: 't_12' }, 't_12'],
    ['memory.save', { text: 'يحب القهوة بدون سكر' }, 'يحب القهوة بدون سكر'],
    ['memory.forget', { query: 'm_12' }, 'm_12'],
    ['prayer.reminders_set', {}, 'موقعك الحالي'],
    ['prayer.reminders_set', { city: 'riyadh' }, 'riyadh'],
  ])('renders %s with its arguments as words (ar)', (tool, args, needle) => {
    const spoken = describeConfirmationA11y(tool, args, tAr);
    expect(spoken).toContain(needle);
    expect(spoken).toContain('ينتظر موافقتك');
    expect(spoken).not.toContain('{');
  });

  it('renders the same sentences in English', () => {
    const spoken = describeConfirmationA11y('alarms.set', { hour: 5, minute: 30 }, tEn);
    expect(spoken).toContain('Sets an alarm at 5:30');
    expect(spoken).toContain('waits for your approval');
    const draft = describeConfirmationA11y('messages.whatsapp_draft', { text: 'Hello!' }, tEn);
    expect(draft).toContain('no specific number');
  });

  it('falls back to a generic sentence for an unknown tool', () => {
    const spoken = describeConfirmationA11y('hacky.root', {}, tAr);
    expect(spoken).toContain('hacky.root');
    expect(spoken).toContain('ينتظر موافقتك');
  });

  it('truncates long message previews to one readable line', () => {
    const long = 'كلمة '.repeat(60);
    const spoken = describeConfirmationA11y('messages.sms_draft', { body: long }, tAr);
    expect(spoken.length).toBeLessThan(140);
    expect(spoken).toContain('…');
  });
});

describe('the spoken plan step', () => {
  it('composes number, title, risk, status and inclusion', () => {
    const spoken = describeStepA11y(2, 'سجّل مذكرة', 'confirming', true, false, tAr);
    expect(spoken).toBe('2. سجّل مذكرة. يغيّر بيانات — بموافقتك. بانتظار موافقتك. مستبعدة من الخطة');
  });

  it('speaks read-only steps as read-only', () => {
    const spoken = describeStepA11y(1, 'الوقت الحين', 'done', false, true, tEn);
    expect(spoken).toBe('1. الوقت الحين. read-only. Done. included in the plan');
  });

  it('covers every step status key in both languages', () => {
    for (const status of ['pending', 'confirming', 'running', 'done', 'failed', 'skipped']) {
      expect(() => describeStepA11y(1, 'س', status, false, true, tAr)).not.toThrow();
      expect(() => describeStepA11y(1, 's', status, true, false, tEn)).not.toThrow();
    }
  });
});
