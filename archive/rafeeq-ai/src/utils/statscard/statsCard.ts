// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * The shareable usage-stats card, drawn with the same tiny raster, the same
 * 720×960 bones and the same language-neutral rule as the score card: the
 * Rafeeq bot up top, three big number columns (runs / tokens / models), the
 * activity bar chart for the chosen span, and the brand footer. Model names
 * stay off the raster — the share sheet carries the words.
 */

import { createCanvas, fillRoundedRect, fillRect, verticalGradient, type Canvas, type RGB } from './canvas';
import { drawMascot } from './mascot';
import { drawText, drawTextCentered, textWidth } from './font';
import { encodePng } from './png';

export type StatsCardBucket = { readonly runs: number };

export type StatsCardSummary = {
  /** Engine runs that finished in the window. */
  readonly runs: number;
  /** Tokens generated in the window (null-token runs skipped). */
  readonly tokens: number;
  /** Distinct models that ran at least once. */
  readonly models: number;
  /** One bucket per day of the window, oldest first — the chart's bars. */
  readonly buckets: readonly StatsCardBucket[];
  /** Chart span in days (7 or 30). */
  readonly span: number;
  /** Export time (ms epoch) printed on the footer. */
  readonly at: number;
};

export const STATS_CARD_WIDTH = 720;
export const STATS_CARD_HEIGHT = 960;

const BG_TOP: RGB = [20, 18, 43];
const BG_BOTTOM: RGB = [42, 26, 94];
const VIOLET_LIGHT: RGB = [139, 92, 246];
const CYAN: RGB = [34, 211, 238];
const WHITE: RGB = [244, 243, 255];

/** Largest integer scale whose digit run still fits `maxWidth`. */
function fitScale(text: string, maxWidth: number, cap: number): number {
  for (let scale = cap; scale > 1; scale--) {
    if (textWidth(text, scale) <= maxWidth) return scale;
  }
  return 1;
}

/** Dots-and-digits local date, the score card's footer format. */
function dateText(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** Draws the full stats card and returns its raster. */
export function drawStatsCard(summary: StatsCardSummary): Canvas {
  const canvas = createCanvas(STATS_CARD_WIDTH, STATS_CARD_HEIGHT);
  verticalGradient(canvas, BG_TOP, BG_BOTTOM);
  fillCircleSoft(canvas, STATS_CARD_WIDTH / 2, 170, 190, VIOLET_LIGHT);
  fillCircleSoft(canvas, STATS_CARD_WIDTH / 2, 640, 170, CYAN);

  drawMascot(canvas, STATS_CARD_WIDTH / 2, 64);

  // Three big number columns: runs, tokens, models.
  const columns: { label: string; value: string }[] = [
    { label: 'RUNS', value: String(Math.max(0, Math.round(summary.runs))) },
    { label: 'TOKENS', value: String(Math.max(0, Math.round(summary.tokens))) },
    { label: 'MODELS', value: String(Math.max(0, Math.round(summary.models))) },
  ];
  const columnWidth = 200;
  columns.forEach((column, i) => {
    const cx = 160 + i * columnWidth;
    const scale = fitScale(column.value, columnWidth - 24, 9);
    drawTextCentered(canvas, column.value, cx, 320, scale, WHITE);
    drawTextCentered(canvas, column.label, cx, 320 + 9 * scale + 22, 3, CYAN);
  });

  // Chart panel: one bar per day, the peak lit violet like the dashboard.
  const panelX = 60;
  const panelY = 470;
  const panelW = STATS_CARD_WIDTH - panelX * 2;
  const panelH = 330;
  fillRoundedRect(canvas, panelX, panelY, panelW, panelH, 26, WHITE, 0.08);

  const innerX = panelX + 30;
  const innerW = panelW - 60;
  const baseY = panelY + panelH - 70;
  const chartH = 200;
  const buckets = summary.buckets;
  const max = buckets.reduce((m, b) => Math.max(m, b.runs), 0);
  if (buckets.length > 0) {
    const slot = innerW / buckets.length;
    const barW = Math.max(3, Math.round(slot) - (buckets.length > 10 ? 2 : 10));
    buckets.forEach((bucket, i) => {
      const ratio = max === 0 ? 0 : bucket.runs / max;
      const height = bucket.runs === 0 ? 3 : Math.max(6, Math.round(ratio * (chartH - 6)));
      const x = Math.round(innerX + i * slot + (slot - barW) / 2);
      fillRect(canvas, x, baseY - height, barW, height, bucket.runs === max && max > 0 ? VIOLET_LIGHT : CYAN);
    });
  }

  // Edge dates under the chart, oldest left, newest right.
  const firstDay = new Date(summary.at);
  firstDay.setDate(firstDay.getDate() - (summary.span - 1));
  drawText(canvas, dateText(firstDay.getTime()), innerX, panelY + panelH - 48, 2, WHITE);
  const endText = dateText(summary.at);
  drawText(canvas, endText, innerX + innerW - textWidth(endText, 2), panelY + panelH - 48, 2, WHITE);
  drawTextCentered(canvas, String(summary.span), STATS_CARD_WIDTH / 2, panelY + panelH - 46, 3, CYAN);

  drawTextCentered(canvas, 'RAFEEQ AI', STATS_CARD_WIDTH / 2, 862, 4, WHITE);
  drawTextCentered(canvas, dateText(summary.at), STATS_CARD_WIDTH / 2, 906, 3, CYAN);
  return canvas;
}

/** Soft glow behind a focal point (the score card's halo, inlined). */
function fillCircleSoft(canvas: Canvas, cx: number, cy: number, r: number, color: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const i = ((cy + dy) * canvas.width + (cx + dx)) * 4;
        if (i >= 0 && i < canvas.data.length) {
          canvas.data[i] = Math.round(canvas.data[i] * 0.88 + color[0] * 0.12);
          canvas.data[i + 1] = Math.round(canvas.data[i + 1] * 0.88 + color[1] * 0.12);
          canvas.data[i + 2] = Math.round(canvas.data[i + 2] * 0.88 + color[2] * 0.12);
          canvas.data[i + 3] = 255;
        }
      }
    }
  }
}

/** Renders and encodes the stats card as PNG bytes. */
export function encodeStatsCardPng(summary: StatsCardSummary): Uint8Array {
  const canvas = drawStatsCard(summary);
  return encodePng(canvas.width, canvas.height, canvas.data);
}

/** Human-friendly file name, e.g. rafeeq-stats-20260107-0930.png. */
export function statsCardFileName(exportedAt: number): string {
  const d = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rafeeq-stats-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
}
