// Copyright (c) 2026 DRS AI. All rights reserved.
import { buildConversationPreview, formatListTimestamp } from '../src/utils/listFormatting';

// A fixed reference instant: Sunday 2026-03-15 12:00 local time.
const NOW = new Date(2026, 2, 15, 12, 0, 0).getTime();
const JUST_NOW = 'Just now';

describe('buildConversationPreview', () => {
  it('keeps plain text as-is', () => {
    expect(buildConversationPreview('ما هو رفيق؟')).toBe('ما هو رفيق؟');
  });

  it('strips fenced code blocks, links, headings, quotes, lists and emphasis', () => {
    const md = [
      '# Title',
      '',
      '```py',
      'print("secret")',
      '```',
      '',
      '- **bold** item',
      '> quoted',
      'See [docs](https://x.y) now',
    ].join('\n');
    expect(buildConversationPreview(md)).toBe('Title bold item quoted See docs now');
  });

  it('keeps inline code content and image alt text', () => {
    expect(buildConversationPreview('run `npm test` and ![logo](a.png)')).toBe('run npm test and logo');
  });

  it('collapses whitespace and newlines into single spaces', () => {
    expect(buildConversationPreview('سطر  أول\n\nثالث\tثاني')).toBe('سطر أول ثالث ثاني');
  });

  it('caps long text with an ellipsis', () => {
    const long = 'كلمة '.repeat(40).trim();
    const preview = buildConversationPreview(long, 30);
    expect(preview.length).toBe(30);
    expect(preview.endsWith('…')).toBe(true);
    expect(long.startsWith(preview.slice(0, -1))).toBe(true);
  });

  it('is idempotent on already-cleaned previews', () => {
    const once = buildConversationPreview('#hello **world** from a fairly long message that keeps going');
    expect(buildConversationPreview(once)).toBe(once);
  });
});

describe('formatListTimestamp', () => {
  const at = (day: number, hour: number, minute: number) => new Date(2026, 2, day, hour, minute).getTime();

  it('uses the just-now label below one minute', () => {
    expect(formatListTimestamp(NOW - 30_000, NOW, 'en', JUST_NOW)).toBe('Just now');
    expect(formatListTimestamp(NOW + 10_000, NOW, 'en', JUST_NOW)).toBe('Just now');
  });

  it('formats minutes with Intl in the requested locale', () => {
    expect(formatListTimestamp(NOW - 5 * 60_000, NOW, 'en', JUST_NOW)).toBe('5 minutes ago');
    expect(formatListTimestamp(NOW - 5 * 60_000, NOW, 'ar', 'الآن')).toBe('قبل 5 دقائق');
  });

  it('shows clock time for messages earlier today', () => {
    expect(formatListTimestamp(at(15, 9, 30), NOW, 'en', JUST_NOW)).toBe('9:30 AM');
  });

  it('says yesterday by calendar day, not by 24 hours', () => {
    expect(formatListTimestamp(at(14, 9, 0), NOW, 'en', JUST_NOW)).toBe('yesterday');
    expect(formatListTimestamp(at(14, 9, 0), NOW, 'ar', 'الآن')).toBe('أمس');
  });

  it('uses the weekday name within the same week', () => {
    expect(formatListTimestamp(at(12, 10, 0), NOW, 'en', JUST_NOW)).toBe('Thursday');
    expect(formatListTimestamp(at(12, 10, 0), NOW, 'ar', 'الآن')).toBe('الخميس');
  });

  it('falls back to a short date, adding the year when it differs', () => {
    expect(formatListTimestamp(new Date(2026, 1, 13, 10, 0).getTime(), NOW, 'en', JUST_NOW)).toBe('Feb 13');
    expect(formatListTimestamp(new Date(2025, 11, 24, 10, 0).getTime(), NOW, 'en', JUST_NOW)).toBe('Dec 24, 2025');
  });
});
