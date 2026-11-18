// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * 5×7 bitmap font for the score card, covering digits, the letters of
 * "RAFEEQ AI", and a few separators. The exported card is deliberately
 * language-neutral: numbers carry the meaning, the share sheet carries the
 * words, so no Arabic shaping is needed inside the raster.
 */

import { fillRect, type Canvas, type RGB } from './canvas';

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

export function hasGlyph(ch: string): boolean {
  return Object.prototype.hasOwnProperty.call(GLYPHS, ch);
}

/** Renders `text` at (x, y) with integer scale; unknown chars render as spaces. */
export function drawText(canvas: Canvas, text: string, x: number, y: number, scale: number, color: RGB): void {
  let cursor = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch] ?? GLYPHS[' '];
    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (glyph[row][col] === '1') fillRect(canvas, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += (GLYPH_W + 1) * scale;
  }
}

/** Pixel width of `text` at the given scale (advance includes the letter gap). */
export function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return text.length * (GLYPH_W + 1) * scale - scale;
}

/** Centered text helper: returns the x offset it drew at. */
export function drawTextCentered(canvas: Canvas, text: string, cx: number, y: number, scale: number, color: RGB): number {
  const x = Math.round(cx - textWidth(text, scale) / 2);
  drawText(canvas, text, x, y, scale, color);
  return x;
}
