// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The launcher-icon registry and the pure half of icon switching.
 *
 * Android applies an alternate launcher icon through *activity aliases*: the
 * prebuild manifest carries one alias per design, all pointing at the same
 * MainActivity, and exactly one is enabled at a time. Switching is therefore
 * an ordered component-state operation — enable the target BEFORE disabling
 * the rest, so there is never a moment with zero enabled aliases (which would
 * remove the app from the launcher). That ordering rule and the alias-name
 * mapping live here, pure and tested; the native module executes the plan.
 *
 * The icons themselves are generated assets (scripts/generate_launcher_icons.py)
 * wired into the manifest by the withLauncherIcons config plugin.
 */

/** Every non-default launcher-icon design id (the classic icon is "default"). */
export const LAUNCHER_ICON_IDS = ['midnight', 'gold', 'glass', 'cyber', 'neon', 'mono', 'sunset'] as const;
export type LauncherIconId = (typeof LAUNCHER_ICON_IDS)[number] | 'default';

/** All selectable ids including the platform default. */
export const LAUNCHER_ICON_ALL_IDS = ['default', ...LAUNCHER_ICON_IDS] as const;

/** The activity-alias class suffix for an icon id ("midnight" → "Icon_midnight"). */
export function launcherAliasClass(iconId: LauncherIconId): string {
  return iconId === 'default' ? 'Icon_Classic' : `Icon_${iconId}`;
}

/** Inverse of launcherAliasClass; null when the class is not one of ours. */
export function iconIdFromAliasClass(cls: string): LauncherIconId | null {
  if (cls === 'Icon_Classic') return 'default';
  if (cls.startsWith('Icon_')) {
    const id = cls.slice('Icon_'.length);
    if ((LAUNCHER_ICON_IDS as readonly string[]).includes(id)) return id as LauncherIconId;
  }
  return null;
}

export type IconSwitchPlan = {
  /** Alias class to ENABLE first. */
  enable: string;
  /** Alias classes to disable afterwards — everything except the target. */
  disable: string[];
};

/**
 * The ordered switch plan. Enabling first is the safety invariant: if the
 * process dies between the two native calls, the launcher still has an icon.
 * Re-selecting the active icon is a no-op (nothing to disable, no churn).
 */
export function planIconSwitch(next: LauncherIconId): IconSwitchPlan {
  const enable = launcherAliasClass(next);
  const disable = LAUNCHER_ICON_ALL_IDS.filter((id) => id !== next).map(launcherAliasClass);
  return { enable, disable };
}

/** The alias classes the manifest is expected to declare, in declaration order. */
export function allAliasClasses(): string[] {
  return LAUNCHER_ICON_ALL_IDS.map(launcherAliasClass);
}

/** True when the id is a selectable design (used by the picker UI). */
export function isLauncherIconId(value: unknown): value is LauncherIconId {
  return typeof value === 'string' && (LAUNCHER_ICON_ALL_IDS as readonly string[]).includes(value);
}
