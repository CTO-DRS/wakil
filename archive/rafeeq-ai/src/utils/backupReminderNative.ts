// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Notifications from 'expo-notifications';

import i18n from '../i18n';
import type { ReminderIO } from './reminderSchedule';

/**
 * The real backup-reminder platform: expo-notifications one-shots with a
 * non-prompting permission check for the automatic syncs. Kept apart from the
 * pure flow so importing the rules never pulls native code into the tests.
 */
export const nativeBackupReminderIO: Pick<ReminderIO, 'checkPermissions' | 'scheduleOneshot' | 'cancel'> = {
  checkPermissions: async () => {
    const current = await Notifications.getPermissionsAsync();
    return Boolean(current.granted);
  },
  scheduleOneshot: async (when: Date) => {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t('settings.backupReminderTitle'),
        body: i18n.t('settings.backupReminderBody'),
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
      },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};
