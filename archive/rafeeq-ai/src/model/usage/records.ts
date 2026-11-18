// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * Pure bookkeeping for on-device model usage stats. Every finished engine run
 * (a chat turn, extra variants, smart replies, the auto summary) lands as one
 * entry naming the model that produced it; the aggregators here turn the log
 * into the dashboard numbers — totals and a per-model breakdown. Storage-free
 * so the rules stay table-driven testable.
 */

/** What kind of engine run produced the entry. */
export type UsageKind = 'chat' | 'variants' | 'suggestions' | 'summary';

export type UsageEntry = {
  /** The loaded model's id at run time. */
  readonly modelId: string;
  /** When the run finished (epoch ms). */
  readonly at: number;
  readonly kind: UsageKind;
  /** Generated tokens, when the engine reported them. */
  readonly tokens: number | null;
  /** Wall-clock duration of the run in ms. */
  readonly ms: number | null;
};

/** Newest entries kept; the log never grows past this. */
export const USAGE_CAP = 400;

/** Per-model rollup row. */
export type ModelUsageSummary = {
  readonly modelId: string;
  readonly runs: number;
  readonly tokens: number;
  readonly lastAt: number;
};

export type UsageTotals = {
  readonly runs: number;
  readonly tokens: number;
  /** Distinct models that ran at least once. */
  readonly models: number;
  /** By-model breakdown, busiest first, at most `cap` rows. */
  readonly byModel: readonly ModelUsageSummary[];
};

/** Drops the oldest entries so at most `cap` remain. */
export function trimUsage(entries: readonly UsageEntry[], cap = USAGE_CAP): UsageEntry[] {
  return entries.length > cap ? entries.slice(entries.length - cap) : entries.slice();
}

/**
 * Totals for the dashboard: run count, summed tokens (nulls skipped), distinct
 * models, and the per-model rows sorted busiest-first (ties: most recent
 * first), limited to `cap` rows.
 */
export function summarizeUsage(entries: readonly UsageEntry[], cap = 8): UsageTotals {
  type Acc = { runs: number; tokens: number; lastAt: number };
  const byId = new Map<string, Acc>();
  let tokensTotal = 0;
  for (const entry of entries) {
    const row = byId.get(entry.modelId) ?? { runs: 0, tokens: 0, lastAt: 0 };
    row.runs += 1;
    if (entry.tokens !== null && Number.isFinite(entry.tokens)) row.tokens += entry.tokens;
    if (entry.at > row.lastAt) row.lastAt = entry.at;
    byId.set(entry.modelId, row);
  }
  for (const row of byId.values()) tokensTotal += row.tokens;
  const byModel: ModelUsageSummary[] = [...byId.entries()]
    .map(([modelId, row]) => ({ modelId, runs: row.runs, tokens: row.tokens, lastAt: row.lastAt }))
    .sort((a, b) => b.runs - a.runs || b.lastAt - a.lastAt)
    .slice(0, Math.max(0, cap));
  return { runs: entries.length, tokens: tokensTotal, models: byId.size, byModel };
}

/** One local day in the usage timeline. */
export type UsageDayBucket = {
  /** The device-local day, zero-padded: `2026-11-07`. */
  readonly dayKey: string;
  /** Engine runs that finished that day. */
  readonly runs: number;
  /** Tokens generated that day (null-token runs skipped). */
  readonly tokens: number;
};

/** The device-local day of an epoch-ms timestamp, zero-padded. */
export function localDayKey(at: number): string {
  const d = new Date(at);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Hard ceiling on the window so a stray argument cannot explode the buckets. */
export const TIMELINE_MAX_DAYS = 60;

/**
 * The daily histogram behind the stats chart: one bucket per local day for the
 * last `days` days ending today (oldest first), zero-filled, with entries from
 * outside the window and from the future ignored. Days are device-local
 * midnights, so the chart reads the same as the runs it counts.
 */
export function usageTimeline(entries: readonly UsageEntry[], days: number, now: number): UsageDayBucket[] {
  const count = Math.max(1, Math.min(TIMELINE_MAX_DAYS, Math.floor(days)));
  const buckets = new Map<string, { runs: number; tokens: number }>();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    // Calendar arithmetic (setDate) keeps each bucket on a true local midnight, DST included.
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d.getTime());
    buckets.set(key, { runs: 0, tokens: 0 });
    keys.push(key);
  }
  for (const entry of entries) {
    const bucket = buckets.get(localDayKey(entry.at));
    if (!bucket) continue;
    bucket.runs += 1;
    if (entry.tokens !== null && Number.isFinite(entry.tokens)) bucket.tokens += entry.tokens;
  }
  return keys.map((dayKey) => ({ dayKey, ...(buckets.get(dayKey) as { runs: number; tokens: number }) }));
}
