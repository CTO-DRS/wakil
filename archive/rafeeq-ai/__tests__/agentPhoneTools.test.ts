// Copyright (c) 2026 DRS AI. All rights reserved.
import { buildSingleToolCallGrammar } from '../src/agent/grammar';
import type { RafeeqToolsApi, NativeCalendarEvent } from '../src/agent/tools/native';
import { resetRafeeqNative, setRafeeqNative } from '../src/agent/tools/native';
import { PHONE_TOOL_NAMES, PHONE_TOOL_RISKS, registerPhoneTools } from '../src/agent/tools/phone';
import { ToolRegistry } from '../src/agent/registry';
import { requiresConfirmation } from '../src/agent/confirmation';
import type { ToolContext } from '../src/agent/types';

const ctxAr: ToolContext = {
  locale: 'ar',
  now: () => new Date(2026, 10, 8, 12, 0, 0),
  model: null,
};

const ctxEn: ToolContext = { ...ctxAr, locale: 'en' };

/** A scripted native module that records every call it receives. */
function makeFakeNative(overrides: Partial<RafeeqToolsApi> = {}): RafeeqToolsApi & { calls: string[] } {
  const calls: string[] = [];
  const events: NativeCalendarEvent[] = [
    { id: 42, title: 'اجتماع الفريق', startMs: new Date(2026, 10, 9, 10, 0).getTime(), endMs: new Date(2026, 10, 9, 11, 0).getTime(), allDay: false, location: 'الرياض' },
  ];
  return {
    calls,
    permissionsStatus: async () => ({ ok: true, contacts: true, callPhone: true, calendarRead: true, calendarWrite: true, dndPolicy: true, writeSettings: true }),
    contactsSearch: async (query, limit) => {
      calls.push(`contactsSearch:${query}:${limit}`);
      return { ok: true, contacts: [{ name: 'أبو فهد', phone: '0501234567' }] };
    },
    callNumber: async (phone) => {
      calls.push(`call:${phone}`);
      return { ok: true, mode: 'dial' };
    },
    draftSms: async (phone, body) => {
      calls.push(`sms:${phone}:${body}`);
      return { ok: true };
    },
    draftWhatsApp: async (text, phone) => {
      calls.push(`wa:${phone}:${text}`);
      return { ok: true };
    },
    setAlarmClock: async (hour, minute, label) => {
      calls.push(`alarm:${hour}:${minute}:${label ?? ''}`);
      return { ok: true };
    },
    setDeviceTimer: async (seconds, label) => {
      calls.push(`timer:${seconds}:${label ?? ''}`);
      return { ok: true };
    },
    calendarCreate: async (title, startMs) => {
      calls.push(`calCreate:${title}:${startMs}`);
      return { ok: true, eventId: 99 };
    },
    calendarListUpcoming: async (days, max) => {
      calls.push(`calList:${days}:${max}`);
      return { ok: true, events };
    },
    calendarMove: async (eventId, startMs) => {
      calls.push(`calMove:${eventId}:${startMs}`);
      return { ok: true };
    },
    torchSet: async (enabled) => {
      calls.push(`torch:${enabled}`);
      return { ok: true };
    },
    dndSet: async (enabled) => {
      calls.push(`dnd:${enabled}`);
      return { ok: true };
    },
    brightnessSet: async (value) => {
      calls.push(`brightness:${value}`);
      return { ok: true };
    },
    openWifiPanel: async () => {
      calls.push('wifiPanel');
      return { ok: true };
    },
    openPermissionSettings: async (target) => {
      calls.push(`permSettings:${target}`);
      return { ok: true };
    },
    ...overrides,
  } as RafeeqToolsApi & { calls: string[] };
}

afterEach(() => {
  setRafeeqNative(undefined);
  resetRafeeqNative();
});

describe('registry shape and risk table', () => {
  it('registers exactly the thirteen phone tools', () => {
    const registry = registerPhoneTools(new ToolRegistry());
    expect(registry.list().map((t) => t.name).sort()).toEqual([...PHONE_TOOL_NAMES].sort());
  });

  it('keeps the documented risk table in sync with the mutating flags', () => {
    const registry = registerPhoneTools(new ToolRegistry());
    for (const tool of registry.list()) {
      const expected = PHONE_TOOL_RISKS[tool.name as keyof typeof PHONE_TOOL_RISKS];
      expect(tool.name).toBeTruthy();
      expect(requiresConfirmation(tool)).toBe(expected === 'mutating');
    }
    expect(Object.keys(PHONE_TOOL_RISKS)).toHaveLength(13);
  });

  it('builds a grammar for every phone tool schema', () => {
    const registry = registerPhoneTools(new ToolRegistry());
    for (const tool of registry.list()) {
      const grammar = buildSingleToolCallGrammar(tool);
      expect(grammar).toContain('root ::= ');
    }
  });

  it('every description is bilingual and non-empty', () => {
    const registry = registerPhoneTools(new ToolRegistry());
    for (const tool of registry.list()) {
      expect(tool.descriptionAr.length).toBeGreaterThan(5);
      expect(tool.descriptionEn.length).toBeGreaterThan(5);
    }
  });
});

describe('contacts tools', () => {
  it('contacts.search lists matches with numbers', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('contacts.search')!;
    const result = await tool.run({ query: 'فهد', limit: 3 }, ctxAr);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('1. أبو فهد — 0501234567');
    expect(fake.calls[0]).toBe('contactsSearch:فهد:3');
  });

  it('contacts.search reports an empty result honestly', async () => {
    const fake = makeFakeNative({ contactsSearch: async () => ({ ok: true, contacts: [] }) });
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('contacts.search')!;
    const result = await tool.run({ query: 'غيور' }, ctxAr);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('لا توجد جهة');
  });

  it('contacts.search maps the permission denial to an Arabic instruction', async () => {
    const fake = makeFakeNative({ contactsSearch: async () => ({ ok: false, code: 'PERMISSION_CONTACTS' }) });
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('contacts.search')!;
    const result = await tool.run({ query: 'فهد' }, ctxAr);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('جهات الاتصال');
    const en = await tool.run({ query: 'f' }, ctxEn);
    expect(en.error).toContain('Contacts permission');
  });

  it('contacts.call normalizes Arabic-Indic digits before dialing', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('contacts.call')!;
    const result = await tool.run({ phone: '٠٥٠١٢٣٤٥٦٧', name: 'أبو فهد' }, ctxAr);
    expect(result.ok).toBe(true);
    expect(fake.calls[0]).toBe('call:0501234567');
    expect(result.data).toContain('لوحة الاتصال');
  });

  it('contacts.call rejects an invalid number without calling', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('contacts.call')!;
    const result = await tool.run({ phone: 'اتصل' }, ctxAr);
    expect(result.ok).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it('every phone tool reports unavailability honestly when the native module is missing', async () => {
    const registry = registerPhoneTools(new ToolRegistry(), { native: () => null });
    for (const tool of registry.list()) {
      const result = await tool.run({}, ctxAr);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('أندرويد');
    }
  });
});

describe('message drafts', () => {
  it('messages.sms_draft strips forbidden characters from the body', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('messages.sms_draft')!;
    const result = await tool.run({ body: 'موعد "مهم"\nغدًا', phone: '0501234567' }, ctxAr);
    expect(result.ok).toBe(true);
    expect(fake.calls[0]).toBe('sms:0501234567:موعد مهمغدًا');
    expect(result.data).toContain('إرسال');
  });

  it('messages.whatsapp_draft reports a missing WhatsApp install', async () => {
    const fake = makeFakeNative({ draftWhatsApp: async () => ({ ok: false, code: 'WHATSAPP_MISSING' }) });
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('messages.whatsapp_draft')!;
    const result = await tool.run({ text: 'السلام عليكم' }, ctxAr);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('واتساب غير مثبّت');
  });
});

describe('alarms and timers', () => {
  it('alarms.set passes a valid time and label through', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('alarms.set')!;
    const result = await tool.run({ hour: 3, minute: 30, label: 'صلاة الفجر' }, ctxAr);
    expect(result.ok).toBe(true);
    expect(fake.calls[0]).toBe('alarm:3:30:صلاة الفجر');
    expect(result.data).toContain('03:30');
  });

  it('alarms.set rejects an impossible time in both languages', async () => {
    const fake = makeFakeNative();
    const registry = registerPhoneTools(new ToolRegistry(), { native: () => fake });
    const ar = await registry.get('alarms.set')!.run({ hour: 25, minute: 0 }, ctxAr);
    expect(ar.error).toContain('الساعة');
    const en = await registry.get('alarms.set')!.run({ hour: 25, minute: 0 }, ctxEn);
    expect(en.error).toContain('hour 0–23');
    expect(fake.calls).toHaveLength(0);
  });

  it('timers.set converts the seconds into a readable observation', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('timers.set')!;
    const result = await tool.run({ seconds: 120 }, ctxAr);
    expect(result.ok).toBe(true);
    expect(fake.calls[0]).toBe('timer:120:');
    expect(result.data).toContain('دقيقة');
  });
});

describe('calendar tools', () => {
  it('calendar.events renders ids and human dates for the next call', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('calendar.events')!;
    const result = await tool.run({ days_ahead: 3, max: 5 }, ctxAr);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('[event_id: 42]');
    expect(result.data).toContain('اجتماع الفريق');
    expect(fake.calls[0]).toBe('calList:3:5');
  });

  it('calendar.create parses the ISO start and forwards the milliseconds', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('calendar.create')!;
    const result = await tool.run({ title: 'درس', start_iso: '2026-11-09T08:30' }, ctxAr);
    expect(result.ok).toBe(true);
    expect(fake.calls[0]).toBe(`calCreate:درس:${new Date(2026, 10, 9, 8, 30).getTime()}`);
    expect(result.data).toContain('درس');
  });

  it('calendar.create rejects an end before the start', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('calendar.create')!;
    const result = await tool.run({ title: 'درس', start_iso: '2026-11-09T08:30', end_iso: '2026-11-09T07:00' }, ctxAr);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('النهاية');
    expect(fake.calls).toHaveLength(0);
  });

  it('calendar.move requires an event id taken from calendar.events', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('calendar.move')!;
    const bad = await tool.run({ event_id: -1, new_start_iso: '2026-11-10T16:00' }, ctxAr);
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('event_id');
    const good = await tool.run({ event_id: 42, new_start_iso: '2026-11-10T16:00' }, ctxAr);
    expect(good.ok).toBe(true);
    expect(fake.calls[0]).toBe(`calMove:42:${new Date(2026, 10, 10, 16, 0).getTime()}`);
  });
});

describe('device shortcuts', () => {
  it('device.torch reports both directions in the user language', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('device.torch')!;
    const on = await tool.run({ enabled: true }, ctxAr);
    expect(on.data).toContain('شعلت المصباح');
    const off = await tool.run({ enabled: false }, ctxEn);
    expect(off.data).toContain('off');
  });

  it('device.dnd opens the policy settings and explains what the user must grant', async () => {
    const fake = makeFakeNative({
      dndSet: async () => ({ ok: false, code: 'NEED_POLICY_ACCESS' }),
    });
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('device.dnd')!;
    const result = await tool.run({ enabled: true }, ctxAr);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('عدم الإزعاج');
    expect(fake.calls).toContain('permSettings:dnd');
  });

  it('device.brightness clamps the value and maps the special-permission denial', async () => {
    const fake = makeFakeNative({ brightnessSet: async () => ({ ok: false, code: 'NEED_WRITE_SETTINGS' }) });
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('device.brightness')!;
    const denied = await tool.run({ value: 300 }, ctxAr);
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('إعدادات النظام');
    expect(fake.calls).toContain('permSettings:write_settings');

    const happy = makeFakeNative();
    const good = registerPhoneTools(new ToolRegistry(), { native: () => happy }).get('device.brightness')!;
    const result = await good.run({ value: 20 }, ctxAr);
    expect(result.ok).toBe(true);
    expect(happy.calls[0]).toBe('brightness:20');
  });

  it('device.wifi_panel opens the connectivity panel', async () => {
    const fake = makeFakeNative();
    const tool = registerPhoneTools(new ToolRegistry(), { native: () => fake }).get('device.wifi_panel')!;
    const result = await tool.run({}, ctxAr);
    expect(result.ok).toBe(true);
    expect(fake.calls[0]).toBe('wifiPanel');
  });
});
