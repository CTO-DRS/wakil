// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The full registry: Phase-1 tools + phone tools + prayer + todos + reminders
 * + memory + briefing, assembled in one place so the agent store keeps a
 * single `getAgentRegistry()` entry point.
 */

import { ToolRegistry } from '../registry';
import { registerBriefingTool, type BriefingToolDeps } from './briefing';
import { makePhase1Registry, type Phase1ToolDeps } from './phase1';
import { registerMemoryTools, type MemoryToolDeps } from './memory';
import { registerPhoneTools, type PhoneToolDeps } from './phone';
import { registerPrayerTools, type PrayerToolDeps } from './prayer';
import { registerTodoTools, type TodoToolDeps } from './todos';
import { registerReminderTools, type ReminderToolDeps } from './reminders';

export interface AllToolDeps extends Phase1ToolDeps, PhoneToolDeps, PrayerToolDeps, TodoToolDeps, ReminderToolDeps, MemoryToolDeps, BriefingToolDeps {}

export function makeAllTools(deps: AllToolDeps = {}): ToolRegistry {
  const registry = makePhase1Registry(deps);
  registerPhoneTools(registry, deps);
  registerPrayerTools(registry, deps);
  registerTodoTools(registry, deps);
  registerReminderTools(registry, deps);
  registerMemoryTools(registry, deps);
  registerBriefingTool(registry, deps);
  return registry;
}
