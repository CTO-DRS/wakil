// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * useAgentSuggestions — feeds the proactive chip bar above the composer.
 * Suggestions are computed ON-DEVICE from local stores only (todos, user
 * reminders, prayer times, today's calendar); the location fix is
 * non-prompting and the calendar read never asks for anything. The computation
 * refreshes on a slow timer while the chat screen is open; the settings
 * switch (`agentSuggestions`) is the off switch the competition brief
 * demands — when it is off, this hook returns nothing and never computes.
 */

import { useEffect, useState } from 'react';

import { computeSuggestions, type AgentSuggestion } from '../agent/suggest';
import { DEFAULT_CITY, SAUDI_CITIES, upcomingPrayerTimes } from '../agent/prayer';
import { deviceLocation } from '../agent/locationDevice';
import { useRemindersStore } from '../agent/reminders';
import { useTodosStore } from '../agent/todos';
import { getRafeeqNativeOrOverride } from '../agent/tools/native';

/** How often the local-data scan refreshes while visible. */
const REFRESH_MS = 60_000;

const NONE: AgentSuggestion[] = [];

export function useAgentSuggestions(enabled: boolean): AgentSuggestion[] {
  const [computed, setComputed] = useState<AgentSuggestion[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const compute = async () => {
      const now = new Date();
      const todos = useTodosStore.getState().getTodos();
      const reminders = useRemindersStore.getState().getReminders();
      // Prayer times: a granted-permission GPS fix, else the Riyadh default —
      // the same chain the prayer tools use, never a permission prompt.
      let prayers: { key: string; when: Date }[] | null = null;
      try {
        const fix = await deviceLocation();
        const base = SAUDI_CITIES[DEFAULT_CITY];
        const coords = fix ? { lat: fix.lat, lng: fix.lng, tz: base.tz } : base;
        prayers = upcomingPrayerTimes(now, coords, 'umm_al_qura', 5);
      } catch {
        prayers = null;
      }
      // Today's events: a quiet native read; any failure leaves the section out.
      let events: { title: string; startMs: number }[] = [];
      try {
        const native = getRafeeqNativeOrOverride();
        if (native) {
          const res = await native.calendarListUpcoming(1, 10);
          if (res.ok) events = (res.events ?? []).map((e) => ({ title: e.title, startMs: e.startMs }));
        }
      } catch {
        events = [];
      }
      if (!alive) return;
      setComputed(computeSuggestions({ now, todos, reminders, prayers, events }));
    };
    void compute();
    const timer = setInterval(() => void compute(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled]);

  // The off switch is the return value itself: nothing computed, nothing shown.
  return enabled ? computed : NONE;
}
