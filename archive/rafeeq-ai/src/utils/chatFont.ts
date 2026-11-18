// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Chat font accessibility: four discrete steps keep the settings Segmented
 * control honest and the persisted value verifiable. The scale multiplies the
 * base message typography (fontSize and lineHeight move together).
 */
export const CHAT_FONT_SCALES = [0.9, 1, 1.15, 1.3] as const;

export type ChatFontScale = (typeof CHAT_FONT_SCALES)[number];

export const DEFAULT_CHAT_FONT_SCALE: ChatFontScale = 1;

/** Accepts only the published steps; anything else falls back to the default. */
export function normalizeChatFontScale(value: unknown): ChatFontScale {
  return (CHAT_FONT_SCALES as readonly number[]).includes(value as number)
    ? (value as ChatFontScale)
    : DEFAULT_CHAT_FONT_SCALE;
}

/** Base message typography the scale starts from (matches type.body in the theme). */
export const BASE_CHAT_FONT = 16;

/**
 * Scales one typography step for the message text. fontSize and its lineHeight
 * move together; missing values fall back to the app body ratio (16/26).
 */
export function scaledTextStyle(
  style: { fontSize?: number; lineHeight?: number },
  scale: number,
): { fontSize: number; lineHeight: number } {
  const size = style.fontSize ?? BASE_CHAT_FONT;
  const baseLine = style.lineHeight ?? (size * 26) / 16;
  return {
    fontSize: Math.round(size * scale * 100) / 100,
    lineHeight: Math.round(baseLine * scale * 100) / 100,
  };
}
