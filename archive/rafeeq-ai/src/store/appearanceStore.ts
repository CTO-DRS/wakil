// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The appearance store: the active theme, the user's custom color overrides
 * and the chosen launcher icon. Persisted locally like every other store —
 * and it only stores *ids* and hex colors, never content.
 *
 * The pure decision helpers (hex validation, override application) live here
 * so both the store and the live preview in the Appearance screen read one
 * source of truth, and jest can exercise every branch without React.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';
import { DEFAULT_THEME_ID, THEMES, themeById, type Palette, type ThemeId } from '../theme/themes';

export const APPEARANCE_STORAGE_KEY = 'rafeeq.appearance.v1';

/** The eight built-in themes plus "follow the device". */
export const APPEARANCE_IDS = [...THEMES.map((t) => t.id), 'system'] as const;
export type AppearanceId = ThemeId | 'system';

/** The four overridable color slots (buttons follow the primary slot). */
export const CUSTOM_COLOR_SLOTS = ['primary', 'secondary', 'background', 'card'] as const;
export type CustomColorSlot = (typeof CUSTOM_COLOR_SLOTS)[number];

export type CustomColors = Record<CustomColorSlot, string | null>;

export const EMPTY_CUSTOM_COLORS: CustomColors = {
  primary: null,
  secondary: null,
  background: null,
  card: null,
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** True when the string is a usable 3- or 6-digit hex color. */
export function isHexColor(value: unknown): boolean {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

/** Normalizes accepted hex forms to uppercase `#RRGGBB`; null when unusable. */
export function normalizeHexColor(value: unknown): string | null {
  if (!isHexColor(value)) return null;
  let hex = (value as string).trim().toUpperCase();
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

/**
 * Applies the user's color overrides on top of a theme palette. Every slot
 * stands alone: a missing (or null) override keeps the theme's own value.
 * The mapping is deliberate: "secondary" paints the accent role, "card"
 * paints the glass card surface, and buttons/links read the primary slot,
 * so one control restyles every interactive element consistently.
 */
export function applyCustomColors(palette: Palette, custom: CustomColors): Palette {
  const out: Palette = { ...palette };
  if (custom.primary) {
    out.primary = custom.primary;
    out.shadow = custom.primary;
  }
  if (custom.secondary) out.accent = custom.secondary;
  if (custom.background) out.background = custom.background;
  if (custom.card) out.surface = custom.card;
  return out;
}

/** True when at least one override is set (the "reset" affordance shows only then). */
export function hasCustomColors(custom: CustomColors): boolean {
  return CUSTOM_COLOR_SLOTS.some((slot) => custom[slot] !== null);
}

/**
 * Resolves the active palette: "system" follows the OS dark/light pair,
 * anything else is a fixed theme — then the custom overrides land on top.
 * Pure so the preview pane and the whole app always agree.
 */
export function resolveAppearancePalette(
  id: AppearanceId,
  systemDark: boolean,
  custom: CustomColors,
): { palette: Palette; dark: boolean } {
  if (id === 'system') {
    const base = systemDark ? themeById('dark').palette : themeById('light').palette;
    return { palette: applyCustomColors(base, custom), dark: systemDark };
  }
  const def = themeById(id);
  return { palette: applyCustomColors(def.palette, custom), dark: def.dark };
}

/** Validated id: a known theme, "system", or the default. */
export function normalizeAppearanceId(value: unknown): AppearanceId {
  return typeof value === 'string' && (APPEARANCE_IDS as readonly string[]).includes(value)
    ? (value as AppearanceId)
    : DEFAULT_THEME_ID;
}

/** Validated custom-color block: unknown or broken slots fall back to null. */
export function normalizeCustomColors(value: unknown): CustomColors {
  const out: CustomColors = { ...EMPTY_CUSTOM_COLORS };
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    for (const slot of CUSTOM_COLOR_SLOTS) {
      out[slot] = normalizeHexColor(v[slot]);
    }
  }
  return out;
}

/** Validated icon id; unknown values keep the platform default. */
export function normalizeIconId(value: unknown): string {
  return typeof value === 'string' && value.length > 0 && value.length <= 40 ? value : 'default';
}

interface AppearanceState {
  themeId: AppearanceId;
  custom: CustomColors;
  /** The applied launcher-icon design id ('default' = the classic icon). */
  iconId: string;
  setTheme: (id: AppearanceId) => void;
  setCustomColor: (slot: CustomColorSlot, hex: string | null) => void;
  resetCustomColors: () => void;
  setIconId: (id: string) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      custom: { ...EMPTY_CUSTOM_COLORS },
      iconId: 'default',
      setTheme: (id) => set({ themeId: normalizeAppearanceId(id) }),
      setCustomColor: (slot, hex) =>
        set((s) => ({
          custom: CUSTOM_COLOR_SLOTS.includes(slot)
            ? { ...s.custom, [slot]: hex === null ? null : normalizeHexColor(hex) }
            : s.custom,
        })),
      resetCustomColors: () => set({ custom: { ...EMPTY_CUSTOM_COLORS } }),
      setIconId: (id) => set({ iconId: normalizeIconId(id) }),
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      storage: createJSONStorage(() => kvStorage),
      // Broken or forged persisted values never crash the app: every field
      // re-validates on rehydration.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppearanceState>;
        return {
          ...current,
          themeId: normalizeAppearanceId(p.themeId),
          custom: normalizeCustomColors(p.custom),
          iconId: normalizeIconId(p.iconId),
        };
      },
    },
  ),
);
