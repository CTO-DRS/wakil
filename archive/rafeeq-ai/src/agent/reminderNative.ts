// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Notifications from 'expo-notifications';

/**
 * The real platform behind the agent's one-shot reminders: expo-notifications
 * DATE triggers with the agent's own Arabic title/body. Kept apart from the
 * pure rules so importing them never pulls native code into the tests.
 */

import type { AgentReminderIO } from './reminders';

export const nativeAgentReminderIO: AgentReminderIO = {
  requestPermissions: async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return Boolean(requested.granted);
  },
  scheduleOneshot: async (when, title, body) => {
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
      },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id),
};
