// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * The theme entry point. Radii, type, motion and spacing are theme-independent
 * tokens; the *colors* come from `themes.ts` (eight built-in looks) dressed
 * with the user's custom overrides from the appearance store. Every screen
 * reads colors, type, radii and motion from here, so switching a theme — or a
 * single custom color — restyles the whole app at once.
 */
import { Platform, useColorScheme, type TextStyle } from 'react-native';

import { useAppearanceStore, resolveAppearancePalette } from '../store/appearanceStore';
import type { Palette } from './themes';

export {
  THEMES,
  themeById,
  DEFAULT_THEME_ID,
  darkPalette,
  lightPalette,
  premiumDarkPalette,
  glassPalette,
  glassmorphismPalette,
  cyberpunkPalette,
  neonPalette,
  minimalPalette,
} from './themes';
export type { Palette, ThemeDef, ThemeId } from './themes';

export const BRAND = {
  from: '#7C3AED',
  to: '#2563EB',
  cyan: '#22D3EE',
  gradient: ['#7C3AED', '#2563EB'] as const,
  /** Three-stop gradient used for glows and the mascot. */
  glow: ['#8B5CF6', '#3B82F6', '#22D3EE'] as const,
};

/** True when `mode` says the device's own scheme should decide. */
export function followsSystem(mode: string | null | undefined): boolean {
  return mode === 'system';
}

/**
 * The one theme hook: every screen calls this, so a theme switch (or a
 * custom-color change) repaints the entire app without any per-screen work.
 */
export function useAppTheme(): { dark: boolean; colors: Palette } {
  const themeId = useAppearanceStore((s) => s.themeId);
  const custom = useAppearanceStore((s) => s.custom);
  const system = useColorScheme();
  const { palette, dark } = resolveAppearancePalette(themeId, system === 'dark', custom);
  return { dark, colors: palette };
}

export const radius = { sm: 10, md: 16, lg: 24, xl: 28, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * IBM Plex Sans Arabic is embedded by the expo-font config plugin. On Android it is one XML
 * font family (weights 400–700 selected by fontWeight); on iOS the family name is the font's own.
 */
export const FONT_FAMILY = Platform.select({
  android: 'IBMPlexSansArabic',
  ios: 'IBM Plex Sans Arabic',
  default: undefined,
});

const face = (size: number, lineHeight: number, weight: TextStyle['fontWeight']): TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: size,
  lineHeight,
  fontWeight: weight,
});

/** Type scale. Line heights are generous because Arabic script needs the vertical room. */
export const type = {
  display: face(32, 44, '700'),
  title: face(24, 34, '700'),
  headline: face(18, 27, '600'),
  body: face(16, 26, '400'),
  bodyStrong: face(16, 26, '600'),
  callout: face(14, 21, '400'),
  label: face(14, 20, '600'),
  caption: face(12, 17, '500'),
  micro: face(11, 15, '600'),
} as const;

/** Motion tokens. */
export const motion = {
  pressScale: 0.97,
  spring: { damping: 18, stiffness: 260, mass: 0.9 },
  softSpring: { damping: 14, stiffness: 140 },
  fast: 160,
  base: 260,
  slow: 520,
};

/** Height of the floating tab bar body (insets and margin come on top). */
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_MARGIN = 12;
