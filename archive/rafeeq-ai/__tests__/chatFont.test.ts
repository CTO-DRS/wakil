// Copyright (c) 2026 DRS AI. All rights reserved.
import { useSettingsStore } from '../src/store/settingsStore';
import {
  CHAT_FONT_SCALES,
  DEFAULT_CHAT_FONT_SCALE,
  normalizeChatFontScale,
  scaledTextStyle,
} from '../src/utils/chatFont';

describe('normalizeChatFontScale', () => {
  it('accepts exactly the published steps', () => {
    expect(CHAT_FONT_SCALES).toEqual([0.9, 1, 1.15, 1.3]);
    for (const step of CHAT_FONT_SCALES) {
      expect(normalizeChatFontScale(step)).toBe(step);
    }
  });

  it('falls back to the default for anything else', () => {
    expect(DEFAULT_CHAT_FONT_SCALE).toBe(1);
    expect(normalizeChatFontScale(0.95)).toBe(1);
    expect(normalizeChatFontScale(2)).toBe(1);
    expect(normalizeChatFontScale('big')).toBe(1);
    expect(normalizeChatFontScale(undefined)).toBe(1);
  });
});

describe('scaledTextStyle', () => {
  const body = { fontSize: 16, lineHeight: 26 };

  it('is the identity at the default scale', () => {
    expect(scaledTextStyle(body, 1)).toEqual({ fontSize: 16, lineHeight: 26 });
  });

  it('moves fontSize and lineHeight together', () => {
    expect(scaledTextStyle(body, 0.9)).toEqual({ fontSize: 14.4, lineHeight: 23.4 });
    expect(scaledTextStyle(body, 1.15)).toEqual({ fontSize: 18.4, lineHeight: 29.9 });
    expect(scaledTextStyle(body, 1.3)).toEqual({ fontSize: 20.8, lineHeight: 33.8 });
  });

  it('falls back to the body ratio when lineHeight is missing', () => {
    expect(scaledTextStyle({ fontSize: 16 }, 1)).toEqual({ fontSize: 16, lineHeight: 26 });
    expect(scaledTextStyle({ fontSize: 10 }, 2)).toEqual({ fontSize: 20, lineHeight: 32.5 });
  });
});

describe('settingsStore integration', () => {
  it('persists a valid step and clamps invalid ones', () => {
    const { setChatFontScale, chatFontScale } = useSettingsStore.getState();
    expect(chatFontScale).toBe(1); // default
    setChatFontScale(1.3);
    expect(useSettingsStore.getState().chatFontScale).toBe(1.3);
    setChatFontScale(99);
    expect(useSettingsStore.getState().chatFontScale).toBe(1);
    setChatFontScale(0.9);
    expect(useSettingsStore.getState().chatFontScale).toBe(0.9);
  });
});
