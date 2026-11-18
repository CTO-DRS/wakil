// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The morning briefing's daily notification: one repeating DAILY trigger at
 * the configured wall-clock time, reconciled with the settings exactly like
 * the games and backup reminders (cancel old → schedule new). The pure sync
 * rules ride `syncDailyReminder` from the game module's reminder file (they
 * are schedule-shaped, not game-shaped); the notification *content* here is
 * the briefing's own — short, static text that invites the user in, where the
 * live briefing is composed from today's real data and can be read aloud.
 */

import * as Notifications from 'expo-notifications';

import i18n from '../i18n';
import { syncDailyReminder, type ReminderIO, type ReminderSyncResult } from '../utils/reminderSchedule';

export type { ReminderIO, ReminderSyncResult };

/** The real platform side for the briefing notification. */
export const nativeBriefingReminderIO: ReminderIO = {
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
        title: i18n.t('agent.briefingNotifTitle'),
        body: i18n.t('agent.briefingNotifBody'),
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

/**
 * Reconciles the scheduled briefing notification with the settings: disabled
 * cancels the old one and schedules nothing; enabled cancels first so a time
 * change never duplicates. Pure enough to test — the IO rides in.
 */
export function syncBriefingReminder(
  enabled: boolean,
  timeKey: string,
  scheduledId: string | null,
  io: ReminderIO = nativeBriefingReminderIO,
): Promise<ReminderSyncResult> {
  return syncDailyReminder(enabled, timeKey, scheduledId, io);
}
