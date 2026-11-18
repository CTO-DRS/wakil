// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The eight built-in appearance themes. Every theme fills the same `Palette`
 * contract the whole app already reads (background, glass surfaces, text, the
 * primary/accent pair, semantic colors, aurora blobs), so switching a theme
 * restyles every screen at once with zero per-screen work.
 *
 * Design rules shared by all eight: text meets its background at readable
 * contrast, glass surfaces stay translucent over the aurora, the primary
 * color drives interactive chrome (buttons, active tabs, links) and the
 * accent marks secondary highlights. Radii, type and motion live in
 * `src/theme/index.ts` and are theme-independent on purpose.
 */

export type Palette = {
  background: string;
  /** Translucent glass fill for cards. */
  surface: string;
  /** Denser glass for floating chrome (tab bar, composer, sheets). */
  surfaceStrong: string;
  surfaceAlt: string;
  /** Hairline border on glass. */
  border: string;
  /** Top-edge sheen on glass. */
  highlight: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  accent: string;
  danger: string;
  success: string;
  warning: string;
  userBubbleText: string;
  assistantBubble: string;
  input: string;
  overlay: string;
  /** Colors of the three aurora blobs with their shared alpha. */
  aurora: readonly [string, string, string];
  auroraOpacity: number;
  shadow: string;
};

export type ThemeId =
  | 'dark'
  | 'light'
  | 'premiumDark'
  | 'glass'
  | 'glassmorphism'
  | 'cyberpunk'
  | 'neon'
  | 'minimal';

export type ThemeDef = {
  id: ThemeId;
  /** English label (the theme picker shows the active language's name). */
  name: string;
  /** Arabic label. */
  nameAr: string;
  /** True when the theme is dark — drives StatusBar and the splash. */
  dark: boolean;
  palette: Palette;
};

/** Deep-space violet → blue, the Rafeeq 2036 original. */
export const darkPalette: Palette = {
  background: '#05060A',
  surface: 'rgba(255,255,255,0.055)',
  surfaceStrong: 'rgba(16,18,30,0.86)',
  surfaceAlt: 'rgba(255,255,255,0.09)',
  border: 'rgba(255,255,255,0.10)',
  highlight: 'rgba(255,255,255,0.16)',
  text: '#F4F3FF',
  textMuted: '#A4A7C2',
  textFaint: '#6D7090',
  primary: '#8B5CF6',
  primaryText: '#FFFFFF',
  accent: '#22D3EE',
  danger: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  userBubbleText: '#FFFFFF',
  assistantBubble: 'transparent',
  input: 'rgba(255,255,255,0.05)',
  overlay: 'rgba(2,3,8,0.6)',
  aurora: ['#7C3AED', '#2563EB', '#22D3EE'],
  auroraOpacity: 0.55,
  shadow: '#7C3AED',
};

/** Pearl/frosted version of the same design language. */
export const lightPalette: Palette = {
  background: '#F3F2F9',
  surface: 'rgba(255,255,255,0.62)',
  surfaceStrong: 'rgba(255,255,255,0.9)',
  surfaceAlt: 'rgba(124,58,237,0.07)',
  border: 'rgba(30,24,80,0.09)',
  highlight: 'rgba(255,255,255,0.95)',
  text: '#14122B',
  textMuted: '#5F5D78',
  textFaint: '#8E8CA6',
  primary: '#7C3AED',
  primaryText: '#FFFFFF',
  accent: '#0891B2',
  danger: '#DC2626',
  success: '#059669',
  warning: '#B45309',
  userBubbleText: '#FFFFFF',
  assistantBubble: 'transparent',
  input: 'rgba(255,255,255,0.7)',
  overlay: 'rgba(20,18,43,0.35)',
  aurora: ['#C4B5FD', '#93C5FD', '#A5F3FC'],
  auroraOpacity: 0.7,
  shadow: '#7C3AED',
};

/** Obsidian charcoal with champagne-gold chrome — quiet luxury. */
export const premiumDarkPalette: Palette = {
  background: '#0C0C0E',
  surface: 'rgba(255,255,255,0.06)',
  surfaceStrong: 'rgba(24,24,28,0.92)',
  surfaceAlt: 'rgba(255,255,255,0.10)',
  border: 'rgba(212,175,55,0.16)',
  highlight: 'rgba(212,175,55,0.22)',
  text: '#F5F2E9',
  textMuted: '#B8B2A4',
  textFaint: '#7E7A70',
  primary: '#D4AF37',
  primaryText: '#1A1508',
  accent: '#E8C766',
  danger: '#E4626F',
  success: '#5FBF8A',
  warning: '#D9A441',
  userBubbleText: '#14110A',
  assistantBubble: 'transparent',
  input: 'rgba(255,255,255,0.06)',
  overlay: 'rgba(5,5,6,0.66)',
  aurora: ['#B8860B', '#8B6914', '#D4AF37'],
  auroraOpacity: 0.34,
  shadow: '#D4AF37',
};

/** Deep navy glass with an ice-cyan edge — the "future cockpit" look. */
export const glassPalette: Palette = {
  background: '#0A1220',
  surface: 'rgba(148,180,255,0.10)',
  surfaceStrong: 'rgba(12,22,40,0.78)',
  surfaceAlt: 'rgba(148,180,255,0.16)',
  border: 'rgba(148,180,255,0.22)',
  highlight: 'rgba(190,215,255,0.34)',
  text: '#EAF2FF',
  textMuted: '#9DB2D6',
  textFaint: '#64789C',
  primary: '#5EEAD4',
  primaryText: '#04211B',
  accent: '#93C5FD',
  danger: '#FB7185',
  success: '#4ADE80',
  warning: '#FACC15',
  userBubbleText: '#04211B',
  assistantBubble: 'transparent',
  input: 'rgba(148,180,255,0.10)',
  overlay: 'rgba(3,8,18,0.62)',
  aurora: ['#0EA5E9', '#6366F1', '#2DD4BF'],
  auroraOpacity: 0.5,
  shadow: '#0EA5E9',
};

/** Bright frosted glass — the light counterpart of the glass theme. */
export const glassmorphismPalette: Palette = {
  background: '#EAF1FA',
  surface: 'rgba(255,255,255,0.55)',
  surfaceStrong: 'rgba(255,255,255,0.85)',
  surfaceAlt: 'rgba(125,155,235,0.10)',
  border: 'rgba(70,100,170,0.14)',
  highlight: 'rgba(255,255,255,0.98)',
  text: '#0F2036',
  textMuted: '#4E6485',
  textFaint: '#8095B3',
  primary: '#3B82F6',
  primaryText: '#FFFFFF',
  accent: '#14B8A6',
  danger: '#E11D48',
  success: '#16A34A',
  warning: '#CA8A04',
  userBubbleText: '#FFFFFF',
  assistantBubble: 'transparent',
  input: 'rgba(255,255,255,0.66)',
  overlay: 'rgba(15,32,54,0.38)',
  aurora: ['#BFDBFE', '#A7F3D0', '#C4B5FD'],
  auroraOpacity: 0.8,
  shadow: '#3B82F6',
};

/** Night city neon: hot magenta + amber on carbon black. */
export const cyberpunkPalette: Palette = {
  background: '#0B0812',
  surface: 'rgba(255,255,255,0.055)',
  surfaceStrong: 'rgba(24,16,38,0.9)',
  surfaceAlt: 'rgba(255,45,140,0.10)',
  border: 'rgba(255,45,140,0.20)',
  highlight: 'rgba(255,110,199,0.28)',
  text: '#FFE9F4',
  textMuted: '#C79BC0',
  textFaint: '#87618C',
  primary: '#FF2D8C',
  primaryText: '#FFFFFF',
  accent: '#FFD166',
  danger: '#FF4E6A',
  success: '#3FF08C',
  warning: '#FFB347',
  userBubbleText: '#1A0511',
  assistantBubble: 'transparent',
  input: 'rgba(255,45,140,0.08)',
  overlay: 'rgba(6,3,12,0.66)',
  aurora: ['#FF2D8C', '#7C3AED', '#FFD166'],
  auroraOpacity: 0.5,
  shadow: '#FF2D8C',
};

/** Electric lime + cyan on graphite — high-energy night mode. */
export const neonPalette: Palette = {
  background: '#070B08',
  surface: 'rgba(255,255,255,0.05)',
  surfaceStrong: 'rgba(14,26,18,0.9)',
  surfaceAlt: 'rgba(74,255,159,0.09)',
  border: 'rgba(74,255,159,0.20)',
  highlight: 'rgba(74,255,159,0.26)',
  text: '#E9FFF1',
  textMuted: '#9BC8AE',
  textFaint: '#5F8A73',
  primary: '#4AFF9F',
  primaryText: '#04170C',
  accent: '#38E5FF',
  danger: '#FF5E5E',
  success: '#4AFF9F',
  warning: '#FFE14D',
  userBubbleText: '#04170C',
  assistantBubble: 'transparent',
  input: 'rgba(74,255,159,0.08)',
  overlay: 'rgba(2,6,3,0.64)',
  aurora: ['#22C55E', '#06B6D4', '#4AFF9F'],
  auroraOpacity: 0.44,
  shadow: '#22C55E',
};

/** Pure neutrals, one restrained indigo accent — maximum readability. */
export const minimalPalette: Palette = {
  background: '#101113',
  surface: 'rgba(255,255,255,0.05)',
  surfaceStrong: 'rgba(28,30,34,0.94)',
  surfaceAlt: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.09)',
  highlight: 'rgba(255,255,255,0.13)',
  text: '#F2F2F2',
  textMuted: '#A6A8AD',
  textFaint: '#6E7076',
  primary: '#6366F1',
  primaryText: '#FFFFFF',
  accent: '#94A3B8',
  danger: '#EF5350',
  success: '#66BB6A',
  warning: '#FFB74D',
  userBubbleText: '#FFFFFF',
  assistantBubble: 'transparent',
  input: 'rgba(255,255,255,0.05)',
  overlay: 'rgba(6,7,8,0.6)',
  aurora: ['#27272A', '#1E1B4B', '#312E81'],
  auroraOpacity: 0.4,
  shadow: '#312E81',
};

/** Registry order = picker order. Dark/Light keep their historic palettes. */
export const THEMES: readonly ThemeDef[] = [
  { id: 'dark', name: 'Dark', nameAr: 'داكن', dark: true, palette: darkPalette },
  { id: 'light', name: 'Light', nameAr: 'فاتح', dark: false, palette: lightPalette },
  { id: 'premiumDark', name: 'Premium Dark', nameAr: 'داكن فاخر', dark: true, palette: premiumDarkPalette },
  { id: 'glass', name: 'Futuristic Glass', nameAr: 'زجاج مستقبلي', dark: true, palette: glassPalette },
  { id: 'glassmorphism', name: 'Glassmorphism', nameAr: 'زجاجية', dark: false, palette: glassmorphismPalette },
  { id: 'cyberpunk', name: 'Cyberpunk', nameAr: 'سايبربنك', dark: true, palette: cyberpunkPalette },
  { id: 'neon', name: 'Neon', nameAr: 'نيون', dark: true, palette: neonPalette },
  { id: 'minimal', name: 'Minimal', nameAr: 'بسيط', dark: true, palette: minimalPalette },
];

const THEME_BY_ID = new Map<string, ThemeDef>(THEMES.map((t) => [t.id, t]));

/** The theme a stored id resolves to; unknown ids fall back to the classic dark. */
export function themeById(id: string | null | undefined): ThemeDef {
  return (id && THEME_BY_ID.get(id)) || THEMES[0]!;
}

export const DEFAULT_THEME_ID: ThemeId = 'dark';
