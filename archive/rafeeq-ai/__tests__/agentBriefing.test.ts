// Copyright (c) 2026 DRS AI. All rights reserved.
import { briefingForSpeech, composeBriefing, sameLocalDay, type BriefingInput } from '../src/agent/briefing';

/** 2026-11-08, 07:10 local — a Sunday morning fixture. */
const NOW = new Date(2026, 10, 8, 7, 10, 0, 0);
const NOW_MS = NOW.getTime();
const H = 3_600_000;

function baseInput(overrides: Partial<BriefingInput> = {}): BriefingInput {
  return {
    now: NOW,
    locale: 'ar',
    events: [],
    reminders: [],
    prayers: [
      { key: 'dhuhr', when: new Date(NOW_MS + 5 * H) },
      { key: 'asr', when: new Date(NOW_MS + 8.5 * H) },
      { key: 'fajr', when: new Date(NOW_MS + 24 * H - 1.7 * H) }, // tomorrow's fajr
    ],
    todos: [],
    ...overrides,
  };
}

describe('composeBriefing', () => {
  it('always carries the prayer section, in localized order, with a tomorrow label', () => {
    const briefing = composeBriefing(baseInput());
    const prayers = briefing.sections.find((s) => s.id === 'prayers')!;
    expect(prayers.lines).toHaveLength(3);
    expect(prayers.lines[0]).toContain('الظهر');
    expect(prayers.lines[2]).toContain('غدًا الفجر');
    expect(briefing.hasContent).toBe(false);
    expect(briefing.text).toContain('يوم هادئ');
  });

  it('sorts events by time and renders clock + title', () => {
    const briefing = composeBriefing(baseInput({
      events: [
        { title: 'اجتماع الفريق', startMs: NOW_MS + 2 * H, endMs: NOW_MS + 3 * H },
        { title: 'مكالمة صباحية', startMs: NOW_MS + 0.5 * H, endMs: null },
      ],
    }));
    const events = briefing.sections.find((s) => s.id === 'events')!;
    expect(events.lines).toHaveLength(2);
    expect(events.lines[0]).toContain('مكالمة صباحية');
    expect(events.lines[1]).toContain('اجتماع الفريق');
    expect(events.lines[0]).toMatch(/07:40/);
    expect(briefing.hasContent).toBe(true);
  });

  it('drops events that are not today', () => {
    const briefing = composeBriefing(baseInput({
      events: [{ title: 'أمس', startMs: NOW_MS - 24 * H, endMs: null }],
    }));
    expect(briefing.sections.find((s) => s.id === 'events')).toBeUndefined();
  });

  it('flags overdue reminders and renders upcoming ones with their clock', () => {
    const briefing = composeBriefing(baseInput({
      reminders: [
        { title: 'اتصل على أبوي', whenMs: NOW_MS - 0.5 * H },
        { title: 'خذ الدواء', whenMs: NOW_MS + 2 * H },
      ],
    }));
    const reminders = briefing.sections.find((s) => s.id === 'reminders')!;
    expect(reminders.lines[0]).toContain('متأخر');
    expect(reminders.lines[1]).toContain('09:10');
  });

  it('orders tasks: overdue, due today, undated — capped at five', () => {
    const todos = [
      { title: 'بلا موعد', done: false, dueMs: null },
      { title: 'اليوم', done: false, dueMs: NOW_MS + 3 * H },
      { title: 'متأخرة', done: false, dueMs: NOW_MS - H },
      { title: 'مكتملة', done: true, dueMs: NOW_MS - H },
      { title: 'متأخرة ٢', done: false, dueMs: NOW_MS - 2 * H },
      { title: 'مهمة الغد', done: false, dueMs: NOW_MS + 26 * H },
      { title: '١', done: false, dueMs: null },
      { title: '٢', done: false, dueMs: null },
      { title: '٣', done: false, dueMs: null },
    ];
    const briefing = composeBriefing(baseInput({ todos }));
    const lines = briefing.sections.find((s) => s.id === 'todos')!.lines;
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('متأخرة ٢');
    expect(lines[1]).toContain('متأخرة');
    expect(lines[1]).not.toContain('متأخرة ٢');
    expect(lines[2]).toContain('اليوم');
    expect(lines.join('\n')).not.toContain('مكتملة');
    expect(lines.join('\n')).not.toContain('مهمة الغد');
  });

  it('renders the English variant with tomorrow labels and overdue flags', () => {
    const briefing = composeBriefing(baseInput({
      locale: 'en',
      todos: [{ title: 'Call the bank', done: false, dueMs: NOW_MS - H }],
      reminders: [{ title: 'Pick up the papers', whenMs: NOW_MS - 0.5 * H }],
    }));
    expect(briefing.text).toContain('Here is your day:');
    expect(briefing.text).toContain('Prayer times:');
    expect(briefing.text).toContain('tomorrow Fajr');
    expect(briefing.text).toContain('overdue');
    expect(briefing.text).toContain('tomorrow ');
  });

  it('is deterministic: same inputs, same text', () => {
    const input = baseInput({
      events: [{ title: 'اجتماع', startMs: NOW_MS + 2 * H, endMs: null }],
      todos: [{ title: 'مهمة', done: false, dueMs: null }],
    });
    expect(composeBriefing(input).text).toBe(composeBriefing({ ...input }).text);
  });

  it('treats sameLocalDay across the local-midnight boundary correctly', () => {
    const lateNight = new Date(2026, 10, 8, 23, 59);
    expect(sameLocalDay(lateNight, NOW)).toBe(true);
    expect(sameLocalDay(new Date(2026, 10, 9, 0, 1), NOW)).toBe(false);
  });
});

describe('briefingForSpeech', () => {
  it('speaks a quiet day in one honest sentence', () => {
    expect(briefingForSpeech(composeBriefing(baseInput()), 'ar')).toContain('يوم هادئ');
  });

  it('joins sections into natural sentences for TTS', () => {
    const briefing = composeBriefing(baseInput({
      events: [{ title: 'اجتماع الفريق', startMs: NOW_MS + 2 * H, endMs: null }],
      todos: [{ title: 'تجهيز التقرير', done: false, dueMs: NOW_MS - H }],
    }));
    const spoken = briefingForSpeech(briefing, 'ar');
    expect(spoken).toContain('ملخص يومك:');
    expect(spoken).toContain('الأحداث:');
    expect(spoken).toContain('المهام:');
    expect(spoken).toContain('تجهيز التقرير');
  });
});
