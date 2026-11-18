// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * Tiny pure raster canvas for the score card: an RGBA byte buffer with rect,
 * circle, rounded-rect and vertical-gradient fills plus bitmap-font text. No
 * React, no native code — every operation is deterministic and testable.
 */

export type RGB = readonly [number, number, number];

export type Canvas = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
};

export function createCanvas(width: number, height: number): Canvas {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function pixelIndex(canvas: Canvas, x: number, y: number): number {
  return (y * canvas.width + x) * 4;
}

/** Opaque pixel write; coordinates outside the canvas are ignored. */
export function setPixel(canvas: Canvas, x: number, y: number, color: RGB, alpha = 1): void {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  if (alpha >= 1) {
    const i = pixelIndex(canvas, x, y);
    canvas.data[i] = color[0];
    canvas.data[i + 1] = color[1];
    canvas.data[i + 2] = color[2];
    canvas.data[i + 3] = 255;
    return;
  }
  const i = pixelIndex(canvas, x, y);
  const a = canvas.data[i + 3] / 255;
  const out = alpha + a * (1 - alpha);
  canvas.data[i] = Math.round((color[0] * alpha + canvas.data[i] * a * (1 - alpha)) / out);
  canvas.data[i + 1] = Math.round((color[1] * alpha + canvas.data[i + 1] * a * (1 - alpha)) / out);
  canvas.data[i + 2] = Math.round((color[2] * alpha + canvas.data[i + 2] * a * (1 - alpha)) / out);
  canvas.data[i + 3] = Math.round(out * 255);
}

export function fillRect(canvas: Canvas, x: number, y: number, w: number, h: number, color: RGB, alpha = 1): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) setPixel(canvas, x + dx, y + dy, color, alpha);
  }
}

export function fillCircle(canvas: Canvas, cx: number, cy: number, r: number, color: RGB, alpha = 1): void {
  if (r <= 0) return;
  const r2 = (r - 0.25) * (r - 0.25);
  for (let dy = Math.floor(cy - r); dy <= Math.ceil(cy + r); dy++) {
    for (let dx = Math.floor(cx - r); dx <= Math.ceil(cx + r); dx++) {
      const ddx = dx - cx;
      const ddy = dy - cy;
      if (ddx * ddx + ddy * ddy <= r2) setPixel(canvas, dx, dy, color, alpha);
    }
  }
}

/** Filled rounded rectangle (radius clamped to half the smaller side). */
export function fillRoundedRect(canvas: Canvas, x: number, y: number, w: number, h: number, radius: number, color: RGB, alpha = 1): void {
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(w, h) / 2)));
  fillRect(canvas, x, y + r, w, h - 2 * r, color, alpha);
  fillRect(canvas, x + r, y, w - 2 * r, r, color, alpha);
  fillRect(canvas, x + r, y + h - r, w - 2 * r, r, color, alpha);
  fillCircle(canvas, x + r, y + r, r, color, alpha);
  fillCircle(canvas, x + w - r - 1, y + r, r, color, alpha);
  fillCircle(canvas, x + r, y + h - r - 1, r, color, alpha);
  fillCircle(canvas, x + w - r - 1, y + h - r - 1, r, color, alpha);
}

/** Vertical linear gradient between two colors (each row lerped once). */
export function verticalGradient(canvas: Canvas, from: RGB, to: RGB): void {
  const last = canvas.height - 1;
  for (let y = 0; y < canvas.height; y++) {
    const k = last === 0 ? 0 : y / last;
    const color: RGB = [
      Math.round(from[0] + (to[0] - from[0]) * k),
      Math.round(from[1] + (to[1] - from[1]) * k),
      Math.round(from[2] + (to[2] - from[2]) * k),
    ];
    for (let x = 0; x < canvas.width; x++) setPixel(canvas, x, y, color);
  }
}

/** Reads one pixel as RGB (transparent reads as black). */
export function getPixel(canvas: Canvas, x: number, y: number): RGB {
  const i = pixelIndex(canvas, x, y);
  return [canvas.data[i], canvas.data[i + 1], canvas.data[i + 2]];
}
