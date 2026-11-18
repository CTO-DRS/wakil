// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * The Rafeeq mascot, drawn on the raster canvas: the same robot glyph the
 * share cards carry. Extracted from the retired game score card so the
 * usage-stats card keeps the identical face.
 */

import { fillCircle, fillRoundedRect, fillRect, type Canvas, type RGB } from './canvas';

// Brand raster palette (the face of the stats card and the mascot agree).
const VIOLET: RGB = [124, 58, 237];
const CYAN: RGB = [34, 211, 238];
const NAVY: RGB = [23, 18, 59];

export function drawMascot(canvas: Canvas, cx: number, top: number): void {
  const headW = 170;
  const headH = 140;
  const headX = cx - headW / 2;
  const headY = top + 30;
  // Antenna light + stem.
  fillRect(canvas, cx - 6, top + 12, 12, 20, VIOLET);
  fillCircle(canvas, cx, top + 10, 9, CYAN);
  // Head + side ears.
  fillRoundedRect(canvas, headX, headY, headW, headH, 40, VIOLET);
  fillCircle(canvas, headX + 2, headY + headH / 2, 13, CYAN);
  fillCircle(canvas, headX + headW - 3, headY + headH / 2, 13, CYAN);
  // Face plate.
  fillRoundedRect(canvas, cx - 65, headY + 26, 130, 94, 28, NAVY);
  // Eyes and mouth.
  fillRoundedRect(canvas, cx - 45, headY + 48, 22, 32, 10, CYAN);
  fillRoundedRect(canvas, cx + 23, headY + 48, 22, 32, 10, CYAN);
  fillRoundedRect(canvas, cx - 30, headY + 96, 60, 9, 4, CYAN);
}

/** A crackling flame for the streak card: layered warm circles and a bright core. */
