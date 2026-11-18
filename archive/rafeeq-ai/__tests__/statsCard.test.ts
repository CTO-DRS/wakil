// Copyright (c) 2026 DRS AI. All rights reserved.
import * as Sharing from 'expo-sharing';

import { createCanvas, getPixel } from '../src/utils/statscard/canvas';
import { drawStatsCard, encodeStatsCardPng, STATS_CARD_HEIGHT, STATS_CARD_WIDTH, statsCardFileName, type StatsCardSummary } from '../src/utils/statscard/statsCard';
import { shareStatsCard } from '../src/utils/statscard/share';

const b = (runs: number) => ({ runs });

const summary: StatsCardSummary = {
  runs: 42,
  tokens: 1234567,
  models: 3,
  buckets: [3, 1, 4, 1, 5, 9, 2].map(b),
  span: 7,
  at: Date.UTC(2026, 0, 7, 9, 30),
};

jest.mock('expo-file-system', () => {
  const instances: { name: string; bytes: Uint8Array | null }[] = [];
  class File {
    name: string;
    bytes: Uint8Array | null = null;
    constructor(_dir: string, name: string) {
      this.name = name;
      instances.push(this);
    }
    get exists() {
      return this.bytes !== null;
    }
    create() {
      this.bytes = new Uint8Array(0);
    }
    delete() {
      this.bytes = null;
    }
    async write(bytes: Uint8Array) {
      this.bytes = bytes;
    }
    get uri() {
      return `file:///cache/${this.name}`;
    }
  }
  return { __esModule: true, File, Paths: { cache: '/cache' }, __instances: instances };
});
jest.mock('expo-sharing', () => ({ __esModule: true, shareAsync: jest.fn(async () => undefined) }));

describe('stats card', () => {
  it('renders at the published size with the brand background', () => {
    const canvas = drawStatsCard(summary);
    expect(canvas.width).toBe(STATS_CARD_WIDTH);
    expect(canvas.height).toBe(STATS_CARD_HEIGHT);
    expect(canvas.data).toHaveLength(STATS_CARD_WIDTH * STATS_CARD_HEIGHT * 4);
    expect(getPixel(canvas, 0, 0)).toEqual([20, 18, 43]);
    expect(getPixel(canvas, 0, STATS_CARD_HEIGHT - 1)).toEqual([42, 26, 94]);
  });

  it('paints the peak day violet and ordinary days cyan', () => {
    const canvas = drawStatsCard(summary);
    // Peak bucket (9 runs) is the 6th bar; ordinary buckets stay cyan.
    expect(getPixel(canvas, 481, 720)).toEqual([139, 92, 246]);
    expect(getPixel(canvas, 95, 720)).toEqual([34, 211, 238]);
  });

  it('draws hairline stubs for quiet days', () => {
    const canvas = drawStatsCard({ ...summary, buckets: [0, 0, 0, 0, 0, 0, 0].map(b) });
    expect(getPixel(canvas, 95, 728)).toEqual([34, 211, 238]);
  });

  it('survives an empty bucket list and huge token counts', () => {
    const canvas = drawStatsCard({ ...summary, buckets: [], tokens: 987654321 });
    // No bars anywhere on the chart floor, even where quiet stubs would sit.
    expect(getPixel(canvas, 95, 728)).not.toEqual([34, 211, 238]);
    expect(getPixel(canvas, 481, 728)).not.toEqual([139, 92, 246]);
    expect(encodeStatsCardPng({ ...summary, buckets: [] }).length).toBeGreaterThan(1000);
  });

  it('encodes to a PNG of the full card', () => {
    const png = encodeStatsCardPng(summary);
    expect(png[0]).toBe(0x89);
    expect((png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19]).toBe(STATS_CARD_WIDTH);
    expect((png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23]).toBe(STATS_CARD_HEIGHT);
  });

  it('builds a dated file name', () => {
    expect(statsCardFileName(Date.UTC(2026, 0, 7, 9, 30))).toBe('rafeeq-stats-20260107-0930.png');
  });
});

describe('stats card share', () => {
  it('runs render → write → share through the injectable IO', async () => {
    const writes: { name: string; bytes: Uint8Array }[] = [];
    const shared: string[] = [];
    const ok = await shareStatsCard(summary, {
      now: () => Date.UTC(2026, 0, 7, 9, 30),
      writeFile: async (name, bytes) => {
        writes.push({ name, bytes });
        return `file:///cache/${name}`;
      },
      share: async (uri) => {
        shared.push(uri);
        return true;
      },
    });
    expect(ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('rafeeq-stats-20260107-0930.png');
    expect(writes[0].bytes[0]).toBe(0x89);
    expect(shared).toEqual([`file:///cache/${writes[0].name}`]);
  });

  it('resolves false when the sheet is dismissed or IO throws', async () => {
    expect(await shareStatsCard(summary, { share: async () => false })).toBe(false);
    expect(await shareStatsCard(summary, { writeFile: async () => { throw new Error('disk'); } })).toBe(false);
  });

  it('uses the real cache + share sheet path with the mocked native modules', async () => {
    const mockShare = Sharing.shareAsync as jest.Mock;
    mockShare.mockClear();
    const ok = await shareStatsCard(summary, { now: () => Date.UTC(2026, 0, 7, 9, 30) });
    expect(ok).toBe(true);
    expect(mockShare).toHaveBeenCalledTimes(1);
    const [uri, opts] = mockShare.mock.calls[0];
    expect(uri).toBe('file:///cache/rafeeq-stats-20260107-0930.png');
    expect(opts).toMatchObject({ mimeType: 'image/png' });
  });

  it('keeps the raster helpers untouched for direct probing', () => {
    const canvas = createCanvas(4, 4);
    expect(getPixel(canvas, 3, 3)).toEqual([0, 0, 0]);
  });
});
