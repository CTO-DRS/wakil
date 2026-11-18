// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Collapses a message's raw text into a one-line list preview: Markdown noise
 * (fences, links, emphasis, headings, quotes, list bullets) is stripped and all
 * whitespace is squashed, so both chat bubbles and list rows stay readable.
 */
export function buildConversationPreview(content: string, max = 90): string {
  const text = content
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/(\*\*\*|\*\*|\*|___|__|_|~~)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Tiered list timestamp in the user's locale, via Intl only: the just-now label /
 * "N minutes ago" / clock time today / "yesterday" / weekday within a week /
 * short date, with the year added once the message is from another year. Falls
 * back to a plain ISO date when the runtime lacks Intl data (older Hermes builds).
 */
export function formatListTimestamp(ms: number, now: number, locale: string, justNowLabel: string): string {
  const date = new Date(ms);
  const reference = new Date(now);
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const diffMinutes = Math.floor((reference.getTime() - ms) / 60000);
    if (diffMinutes < 1) return justNowLabel;
    if (diffMinutes < 60) return rtf.format(-diffMinutes, 'minute');

    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yesterday = new Date(reference);
    yesterday.setDate(reference.getDate() - 1);
    if (sameDay(date, reference)) return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
    if (sameDay(date, yesterday)) return rtf.format(-1, 'day');

    const daysApart = Math.floor((reference.getTime() - ms) / 86400000);
    if (daysApart < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
    const options: Intl.DateTimeFormatOptions =
      date.getFullYear() === reference.getFullYear()
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString(locale, options);
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}
