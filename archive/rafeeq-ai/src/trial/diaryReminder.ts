// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The trial diary's nightly nudge: one repeating DAILY notification,
 * reconciled with the store exactly like the briefing and backup reminders
 * (cancel old → schedule new). The content is short, static text that points
 * at the diary — the counters are filled in the app, on the device, and
 * never anywhere else.
 */

import * as Notifications from 'expo-notifications';

import i18n from '../i18n';
import { syncDailyReminder, type ReminderIO, type ReminderSyncResult } from '../utils/reminderSchedule';

export type { ReminderIO, ReminderSyncResult };

/** The real platform side for the diary notification. */
export const nativeDiaryReminderIO: ReminderIO = {
  requestPermissions: async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return Boolean(requested.granted);
  },
  checkPermissions: async () => {
    const current = await Notifications.getPermissionsAsync();
    return Boolean(current.granted);
  },
  scheduleDaily: async (hour, minute) => {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('trial.notifTitle'),
        body: i18n.t('trial.notifBody'),
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};

/** Reconciles the scheduled diary notification with the store's switch. */
export function syncDiaryReminder(
  enabled: boolean,
  timeKey: string,
  scheduledId: string | null,
  io: ReminderIO = nativeDiaryReminderIO,
): Promise<ReminderSyncResult> {
  return syncDailyReminder(enabled, timeKey, scheduledId, io);
}
