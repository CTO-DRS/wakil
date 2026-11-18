// Copyright (c) 2026 DRS AI. All rights reserved.
import { DIARY_LIMITS, SUS_STATEMENTS, buildTrialCsv, dateKeyOf, normalizeDiaryEntry, susScore, weekSummary } from '../src/trial/diary';
import { useTrialStore } from '../src/store/trialStore';

describe('dateKeyOf', () => {
  it('formats the local calendar day, never UTC', () => {
    expect(dateKeyOf(new Date(2026, 10, 9))).toBe('2026-11-09');
    expect(dateKeyOf(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('normalizeDiaryEntry', () => {
  it('clamps counters into their declared ranges', () => {
    const e = normalizeDiaryEntry({ dateKey: '2026-11-09', tasksTried: 99, minutes: 9999, completed: 3, rephrased: -2, wrongAction: 7, voiceTasks: 4, cardsAllShown: true, felt: '  سريع  ' });
    expect(e.tasksTried).toBe(DIARY_LIMITS.tasksMax);
    expect(e.minutes).toBe(DIARY_LIMITS.minutesMax);
    expect(e.completed).toBe(3);
    expect(e.rephrased).toBe(0);
    expect(e.wrongAction).toBe(7);
    expect(e.felt).toBe('سريع');
  });

  it('caps outcome counters at the day’s task count', () => {
    const e = normalizeDiaryEntry({ dateKey: '2026-11-09', tasksTried: 2, completed: 5, rephrased: 9, wrongAction: 3, voiceTasks: 8, cardsAllShown: false, felt: '' });
    expect(e.completed).toBe(2);
    expect(e.rephrased).toBe(2);
    expect(e.wrongAction).toBe(2);
    expect(e.voiceTasks).toBe(2);
    expect(e.cardsAllShown).toBe(false);
  });

  it('caps the one-word feeling field', () => {
    const e = normalizeDiaryEntry({ dateKey: '2026-11-09', tasksTried: 1, felt: 'x'.repeat(100) });
    expect(e.felt.length).toBe(DIARY_LIMITS.feltMax);
  });
});

describe('susScore', () => {
  it('scores the canonical SUS vectors', () => {
    // Odd statements (1,3,5,…) top, even statements (2,4,6,…) bottom → 100.
    const perfect = [5, 1, 5, 1, 5, 1, 5, 1, 5, 1];
    expect(susScore(perfect)).toBe(100);
    // All-neutral threes land at exactly 50 (standard SUS property).
    expect(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
    // All-fives also lands at 50 (the known SUS quirk).
    expect(susScore([5, 5, 5, 5, 5, 5, 5, 5, 5, 5])).toBe(50);
    // A realistic mixed answer.
    expect(susScore([4, 1, 4, 1, 4, 1, 4, 1, 4, 1])).toBe(87.5);
  });

  it('refuses to score an unfinished or out-of-range questionnaire', () => {
    expect(susScore(null)).toBeNull();
    expect(susScore([1, 2, 3])).toBeNull();
    expect(susScore([1, 2, 3, 4, 5, 1, 2, 3, 4])).toBeNull();
    expect(susScore([1, 2, 3, 4, 5, 1, 2, 3, 4, 6])).toBeNull();
    expect(susScore([1, 2, 3, 4, 5, 1, 2, 3, 4, null])).toBeNull();
    expect(susScore(Array(SUS_STATEMENTS).fill(2.5))).toBeNull();
  });
});

describe('weekSummary', () => {
  const entries = [
    normalizeDiaryEntry({ dateKey: '2026-11-03', tasksTried: 3, completed: 2, rephrased: 1, wrongAction: 1, cardsAllShown: false, minutes: 9, voiceTasks: 1, felt: 'بطيء' }),
    normalizeDiaryEntry({ dateKey: '2026-11-02', tasksTried: 4, completed: 3, rephrased: 1, wrongAction: 0, cardsAllShown: true, minutes: 6, voiceTasks: 2, felt: 'سريع' }),
  ];

  it('aggregates the trial metrics from counters only', () => {
    const w = weekSummary(entries);
    expect(w.days).toBe(2);
    expect(w.tasksTried).toBe(7);
    expect(w.completed).toBe(5);
    expect(w.completionRate).toBe(0.71);
    expect(w.misfireRate).toBe(0.14);
    expect(w.cardCoverageRate).toBe(0.5);
    expect(w.minutesTotal).toBe(15);
    expect(w.avgMinutesPerTask).toBe(2.1);
  });

  it('sorts by date for the time-on-task trend (first → last day)', () => {
    const w = weekSummary(entries);
    expect(w.firstDayMinPerTask).toBe(1.5); // 6 min / 4 tasks
    expect(w.lastDayMinPerTask).toBe(3); // 9 min / 3 tasks
  });

  it('keeps rates null instead of zero when nothing was tried', () => {
    const w = weekSummary([normalizeDiaryEntry({ dateKey: '2026-11-02', tasksTried: 0, completed: 0, rephrased: 0, wrongAction: 0, cardsAllShown: true, minutes: 0, voiceTasks: 0, felt: '' })]);
    expect(w.completionRate).toBeNull();
    expect(w.misfireRate).toBeNull();
    expect(w.avgMinutesPerTask).toBeNull();
    expect(w.cardCoverageRate).toBe(1);
  });
});

describe('buildTrialCsv', () => {
  it('renders the counters-only CSV the researcher pastes', () => {
    const entries = [
      normalizeDiaryEntry({ dateKey: '2026-11-02', tasksTried: 4, completed: 3, rephrased: 1, wrongAction: 0, cardsAllShown: true, minutes: 6, voiceTasks: 2, felt: 'سريع' }),
      normalizeDiaryEntry({ dateKey: '2026-11-03', tasksTried: 3, completed: 2, rephrased: 1, wrongAction: 1, cardsAllShown: false, minutes: 9, voiceTasks: 1, felt: 'بطيء' }),
    ];
    const csv = buildTrialCsv(entries, 87.5);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date_key,tasks_tried,completed,rephrased,wrong_action,cards_all_shown,minutes,voice_tasks,felt');
    expect(lines[1]).toBe('2026-11-02,4,3,1,0,1,6,2,سريع');
    expect(lines[2]).toBe('2026-11-03,3,2,1,1,0,9,1,بطيء');
    expect(lines[3]).toBe('sus_score,87.5');
  });

  it('leaves the sus cell empty when unscored, never a fake zero', () => {
    const csv = buildTrialCsv([], null);
    expect(csv.split('\n')).toEqual(['date_key,tasks_tried,completed,rephrased,wrong_action,cards_all_shown,minutes,voice_tasks,felt', 'sus_score,']);
  });

  it('quotes feelings that carry a comma', () => {
    const csv = buildTrialCsv([normalizeDiaryEntry({ dateKey: '2026-11-02', tasksTried: 1, felt: 'سريع, جميل' })], null);
    expect(csv.split('\n')[1].endsWith(',"سريع, جميل"')).toBe(true);
  });
});

describe('trial store', () => {
  beforeEach(() => {
    useTrialStore.getState().clearWeek();
    useTrialStore.setState({ scheduledId: null, reminderEnabled: false });
  });

  it('saves and deletes one entry per local day', () => {
    const e = normalizeDiaryEntry({ dateKey: '2026-11-09', tasksTried: 4, completed: 3, rephrased: 1, wrongAction: 0, cardsAllShown: true, minutes: 6, voiceTasks: 2, felt: '' });
    useTrialStore.getState().saveEntry(e);
    expect(useTrialStore.getState().entries['2026-11-09']).toEqual(e);
    useTrialStore.getState().deleteEntry('2026-11-09');
    expect(useTrialStore.getState().entries['2026-11-09']).toBeUndefined();
  });

  it('bounds SUS answers and ignores out-of-range statement indexes', () => {
    useTrialStore.getState().setSusAnswer(0, 9);
    useTrialStore.getState().setSusAnswer(1, 0);
    useTrialStore.getState().setSusAnswer(10, 3);
    const sus = useTrialStore.getState().sus;
    expect(sus.length).toBe(SUS_STATEMENTS);
    expect(sus[0]).toBe(5);
    expect(sus[1]).toBe(1);
    expect(sus[9]).toBeNull();
  });

  it('clearWeek resets entries and SUS but keeps the reminder switch', () => {
    useTrialStore.getState().saveEntry(normalizeDiaryEntry({ dateKey: '2026-11-09', tasksTried: 1, completed: 1, rephrased: 0, wrongAction: 0, cardsAllShown: true, minutes: 1, voiceTasks: 0, felt: '' }));
    useTrialStore.getState().setSusAnswer(0, 4);
    useTrialStore.setState({ reminderEnabled: true, scheduledId: 'notif-1' });
    useTrialStore.getState().clearWeek();
    const s = useTrialStore.getState();
    expect(Object.keys(s.entries).length).toBe(0);
    expect(s.sus.every((a) => a === null)).toBe(true);
    expect(s.reminderEnabled).toBe(true);
    expect(s.scheduledId).toBe('notif-1');
  });
});
