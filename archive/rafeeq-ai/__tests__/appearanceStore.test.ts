// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Pure-decision tests for the appearance store: hex validation, the override
 * mapping (secondary→accent, card→surface…), the theme resolver behind the
 * one useAppTheme hook, and persisted-state re-validation.
 */
import {
  APPEARANCE_IDS,
  CUSTOM_COLOR_SLOTS,
  EMPTY_CUSTOM_COLORS,
  applyCustomColors,
  hasCustomColors,
  isHexColor,
  normalizeAppearanceId,
  normalizeCustomColors,
  normalizeHexColor,
  resolveAppearancePalette,
  useAppearanceStore,
} from '../src/store/appearanceStore';
import { DEFAULT_THEME_ID, THEMES, darkPalette, lightPalette } from '../src/theme/themes';

describe('hex colors', () => {
  it.each([
    ['#7C3AED', '#7C3AED'],
    ['#7c3aed', '#7C3AED'],
    ['#f60', '#FF6600'],
    [' #f60 ', '#FF6600'],
  ])('normalizeHexColor(%s) → %s', (input, expected) => {
    expect(normalizeHexColor(input)).toBe(expected);
  });

  it.each(['#GGGGGG', '7C3AED', '#12345', '#1234567', '', null, 42, 'red'])('rejects %p', (input) => {
    expect(isHexColor(input)).toBe(false);
    expect(normalizeHexColor(input)).toBeNull();
  });
});

describe('custom color overrides', () => {
  it('leaves the theme palette untouched when everything is null', () => {
    expect(applyCustomColors(darkPalette, { ...EMPTY_CUSTOM_COLORS })).toEqual(darkPalette);
  });

  it('maps each slot to its palette role', () => {
    const out = applyCustomColors(darkPalette, {
      primary: '#112233',
      secondary: '#445566',
      background: '#010203',
      card: 'rgba(9,9,9,0.5)',
    });
    expect(out.primary).toBe('#112233');
    expect(out.shadow).toBe('#112233'); // the glow follows the primary slot
    expect(out.accent).toBe('#445566');
    expect(out.background).toBe('#010203');
    expect(out.surface).toBe('rgba(9,9,9,0.5)');
    // untouched roles keep the theme's own values
    expect(out.text).toBe(darkPalette.text);
    expect(out.danger).toBe(darkPalette.danger);
  });

  it('standalone slots do not disturb each other', () => {
    const out = applyCustomColors(darkPalette, { ...EMPTY_CUSTOM_COLORS, primary: '#ABCDEF' });
    expect(out.primary).toBe('#ABCDEF');
    expect(out.accent).toBe(darkPalette.accent);
    expect(out.background).toBe(darkPalette.background);
  });

  it('hasCustomColors drives the reset affordance', () => {
    expect(hasCustomColors({ ...EMPTY_CUSTOM_COLORS })).toBe(false);
    expect(hasCustomColors({ ...EMPTY_CUSTOM_COLORS, card: '#FFFFFF' })).toBe(true);
  });
});

describe('appearance resolution (the useAppTheme core)', () => {
  it('resolves fixed themes as-is plus overrides', () => {
    const { palette, dark } = resolveAppearancePalette('light', true, { ...EMPTY_CUSTOM_COLORS });
    expect(dark).toBe(false);
    expect(palette.background).toBe(lightPalette.background);
  });

  it('system mode follows the OS and keeps the dark flag honest', () => {
    const lightSys = resolveAppearancePalette('system', false, { ...EMPTY_CUSTOM_COLORS });
    const darkSys = resolveAppearancePalette('system', true, { ...EMPTY_CUSTOM_COLORS });
    expect(lightSys.palette.background).toBe(lightPalette.background);
    expect(darkSys.palette.background).toBe(darkPalette.background);
    expect(darkSys.dark).toBe(true);
  });

  it('overrides land on top of system resolution too', () => {
    const out = resolveAppearancePalette('system', true, { ...EMPTY_CUSTOM_COLORS, primary: '#ABC123' });
    expect(out.palette.primary).toBe('#ABC123');
  });
});

describe('persisted-state re-validation', () => {
  it('unknown ids fall back to the default theme', () => {
    expect(normalizeAppearanceId('cyberpunk')).toBe('cyberpunk');
    expect(normalizeAppearanceId('hacker-rainbow')).toBe(DEFAULT_THEME_ID);
    expect(normalizeAppearanceId(null)).toBe(DEFAULT_THEME_ID);
  });

  it('all eight themes plus system are selectable', () => {
    expect(APPEARANCE_IDS).toHaveLength(THEMES.length + 1);
    expect(APPEARANCE_IDS).toContain('system');
  });

  it('broken custom-color blocks degrade slot-by-slot to null', () => {
    expect(normalizeCustomColors({ primary: '#FF0000', secondary: 'nope', background: 7, card: '#F60' })).toEqual({
      primary: '#FF0000',
      secondary: null,
      background: null,
      card: '#FF6600',
    });
    expect(normalizeCustomColors(null)).toEqual({ ...EMPTY_CUSTOM_COLORS });
    expect(normalizeCustomColors('junk')).toEqual({ ...EMPTY_CUSTOM_COLORS });
  });
});

describe('the store itself', () => {
  beforeEach(() => {
    useAppearanceStore.setState({
      themeId: DEFAULT_THEME_ID,
      custom: { ...EMPTY_CUSTOM_COLORS },
      iconId: 'default',
    });
  });

  it('setTheme validates before writing', () => {
    useAppearanceStore.getState().setTheme('neon');
    expect(useAppearanceStore.getState().themeId).toBe('neon');
    useAppearanceStore.getState().setTheme('nonsense' as never);
    expect(useAppearanceStore.getState().themeId).toBe(DEFAULT_THEME_ID);
  });

  it('setCustomColor normalizes and clears slot-by-slot', () => {
    useAppearanceStore.getState().setCustomColor('primary', '#a1b2c3');
    expect(useAppearanceStore.getState().custom.primary).toBe('#A1B2C3');
    useAppearanceStore.getState().setCustomColor('secondary', 'zzz');
    expect(useAppearanceStore.getState().custom.secondary).toBeNull();
    useAppearanceStore.getState().resetCustomColors();
    expect(useAppearanceStore.getState().custom).toEqual({ ...EMPTY_CUSTOM_COLORS });
  });

  it('every slot key is covered by the constant list', () => {
    expect(CUSTOM_COLOR_SLOTS).toEqual(['primary', 'secondary', 'background', 'card']);
  });
});
