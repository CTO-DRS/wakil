// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ReminderIO } from '../src/utils/reminderSchedule';
import {
  BACKUP_MONTH_MS,
  BACKUP_REMINDER_COOLDOWN_MS,
  BACKUP_REMINDER_DELAY_MS,
  backupReminderPlan,
  syncBackupReminder,
} from '../src/utils/backupSchedule';

const DAY = 24 * 60 * 60 * 1000;

describe('backupReminderPlan', () => {
  it.each([
    {
      name: 'never exported: quiet until the first export starts the clock',
      lastBackupAt: null as number | null,
      remindedAt: null as number | null,
      due: false,
      remind: false,
      daysSince: null as number | null,
    },
    {
      name: 'twenty-nine days: still fresh',
      lastBackupAt: 0,
      remindedAt: null,
      due: false,
      remind: false,
      daysSince: 29,
    },
    {
      name: 'a full month: due, and the nudge fires',
      lastBackupAt: 0,
      remindedAt: null,
      due: true,
      remind: true,
      daysSince: 30,
    },
  ])('$name', ({ lastBackupAt, remindedAt, due, remind, daysSince }) => {
    const now = lastBackupAt === null ? 1000 : (lastBackupAt as number) + (due ? BACKUP_MONTH_MS : BACKUP_MONTH_MS - DAY);
    const plan = backupReminderPlan({ now, lastBackupAt, remindedAt });
    expect(plan.due).toBe(due);
    expect(plan.remind).toBe(remind);
    expect(plan.daysSince).toBe(daysSince);
  });

  it('counts the whole days since the export', () => {
    const now = 40 * DAY + 3600_000;
    expect(backupReminderPlan({ now, lastBackupAt: 0, remindedAt: null }).daysSince).toBe(40);
    expect(backupReminderPlan({ now, lastBackupAt: now, remindedAt: null }).daysSince).toBe(0);
  });

  it('a fresh export today is not due', () => {
    const plan = backupReminderPlan({ now: 1000, lastBackupAt: 0, remindedAt: null });
    expect(plan.due).toBe(false);
    expect(plan.daysSince).toBe(0);
  });

  it.each([
    { name: 'within the cooldown week the nudge waits', remindedAtOffset: 3 * DAY, remind: false },
    { name: 'past the cooldown week the nudge fires again', remindedAtOffset: BACKUP_REMINDER_COOLDOWN_MS, remind: true },
    { name: 'a broken reminded stamp counts as never reminded', remindedAtOffset: Number.NaN, remind: true },
  ])('$name', ({ remindedAtOffset, remind }) => {
    const now = BACKUP_MONTH_MS + DAY;
    const plan = backupReminderPlan({ now, lastBackupAt: 0, remindedAt: Number.isNaN(remindedAtOffset) ? NaN : now - remindedAtOffset });
    expect(plan.due).toBe(true);
    expect(plan.remind).toBe(remind);
  });
});

describe('syncBackupReminder', () => {
  const dueInput = { now: BACKUP_MONTH_MS, lastBackupAt: 0, remindedAt: null };

  const fakeIo = (opts: { granted?: boolean; id?: string; fail?: boolean } = {}) => {
    const calls: { when?: Date }[] = [];
    const io: ReminderIO = {
      checkPermissions: async () => opts.granted ?? true,
      scheduleOneshot: async (when) => {
        calls.push({ when });
        if (opts.fail) throw new Error('boom');
        return opts.id ?? 'notif-1';
      },
      cancel: async () => {},
    };
    return { io, calls };
  };

  it('schedules one one-shot an hour out when due and enabled', async () => {
    const { io, calls } = fakeIo({ id: 'weekly-nudge' });
    const { id, plan } = await syncBackupReminder(true, dueInput, io);
    expect(id).toBe('weekly-nudge');
    expect(plan.remind).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].when?.getTime()).toBe(dueInput.now + BACKUP_REMINDER_DELAY_MS);
  });

  it.each([
    // The id is null on every skip; the plan keeps reporting the rule it read.
    { name: 'the master switch is off', enabled: false, input: dueInput, io: {}, remind: true },
    { name: 'the plan says wait (cooldown)', enabled: true, input: { now: BACKUP_MONTH_MS, lastBackupAt: 0, remindedAt: BACKUP_MONTH_MS - DAY }, io: {}, remind: false },
    { name: 'nothing is due yet', enabled: true, input: { now: DAY, lastBackupAt: 0, remindedAt: null }, io: {}, remind: false },
    { name: 'the device never exported a full backup', enabled: true, input: { now: BACKUP_MONTH_MS, lastBackupAt: null, remindedAt: null }, io: {}, remind: false },
    { name: 'permission was denied without prompting', enabled: true, input: dueInput, io: { granted: false }, remind: true },
  ])('$name → nothing scheduled', async ({ enabled, input, io, remind }) => {
    const { id, plan } = await syncBackupReminder(enabled, input, fakeIo(io).io);
    expect(id).toBeNull();
    expect(plan.remind).toBe(remind);
  });

  it('a denied permission check keeps the plan but schedules nothing', async () => {
    const { io, calls } = fakeIo({ granted: false });
    const { id, plan } = await syncBackupReminder(true, dueInput, io);
    expect(plan.remind).toBe(true);
    expect(id).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('a scheduler failure reads as nothing scheduled', async () => {
    const { io, calls } = fakeIo({ fail: true });
    const { id } = await syncBackupReminder(true, dueInput, io);
    expect(id).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('an empty IO leaves the flow harmless', async () => {
    const { id, plan } = await syncBackupReminder(true, dueInput, {});
    expect(id).toBeNull();
    expect(plan.remind).toBe(true);
  });
});
