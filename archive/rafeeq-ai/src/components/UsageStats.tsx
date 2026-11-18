// Copyright (c) 2026 DRS AI. All rights reserved.
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { summarizeUsage, usageTimeline, type UsageDayBucket } from '../model/usage/records';
import { useUsageStore } from '../model/usage/store';
import { CATALOG, VOICE_MODELS } from '../models/catalog';
import { useModelStore } from '../store/modelStore';
import { ShareStatsButton } from './ShareStatsButton';
import { radius, spacing, type, useAppTheme } from '../theme';

/**
 * The model-usage dashboard, all computed on-device: how many engine runs
 * finished, how many tokens they produced, and a per-model breakdown (busiest
 * first) naming each model, its run count, its tokens and its last use.
 * Background passes count too — variants, smart replies and auto summaries are
 * engine work the model actually did.
 */

const MAX_ROWS = 6;
/** Spans the activity chart can show. */
type ChartSpan = 7 | 30;
const SPANS: readonly ChartSpan[] = [7, 30];
const CHART_HEIGHT = 72;

function modelNames(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of [...CATALOG, ...VOICE_MODELS, ...useModelStore.getState().customModels]) map[m.id] = m.name;
  return map;
}

/** Short day label under the chart edges, e.g. «7 نوفمبر» / 'Nov 7'. */
function dayLabel(key: string, locale: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(y, (m || 1) - 1, d || 1));
}

/** One column per day: height ∝ runs that day, with a hairline stub for quiet days. */
const ActivityBars = memo(function ActivityBars({ buckets, span, colors }: { buckets: readonly UsageDayBucket[]; span: ChartSpan; colors: ReturnType<typeof useAppTheme>['colors'] }) {
  const { t, i18n } = useTranslation();
  const max = buckets.reduce((m, b) => Math.max(m, b.runs), 0);
  const total = buckets.reduce((n, b) => n + b.runs, 0);
  if (max === 0) {
    return (
      <Text style={[type.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]}>{t('usage.chartEmpty')}</Text>
    );
  }
  return (
    <View style={styles.chartWrap}>
      <View style={[styles.chart, { height: CHART_HEIGHT }]} accessibilityLabel={t('usage.chartTitle')}>
        {buckets.map((b) => {
          const ratio = b.runs / max;
          return (
            <View key={b.dayKey} style={styles.barSlot}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(3, Math.round(ratio * (CHART_HEIGHT - 8))),
                    backgroundColor: b.runs === max ? colors.primary : colors.accent,
                    opacity: b.runs === 0 ? 0.25 : 1,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.chartLabels}>
        <Text style={[type.micro, styles.auto, { color: colors.textMuted }]}>{dayLabel(buckets[0].dayKey, i18n.language === 'en' ? 'en' : 'ar')}</Text>
        <Text style={[type.micro, styles.auto, { color: colors.textMuted }]}>{t('usage.chartTotal', { n: total, days: span })}</Text>
        <Text style={[type.micro, styles.auto, { color: colors.textMuted }]}>{dayLabel(buckets[buckets.length - 1].dayKey, i18n.language === 'en' ? 'en' : 'ar')}</Text>
      </View>
    </View>
  );
});

export const UsageStats = memo(function UsageStats() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const entries = useUsageStore((s) => s.entries);
  const clear = useUsageStore((s) => s.clear);
  const names = useMemo(modelNames, []);
  const [span, setSpan] = useState<ChartSpan>(7);

  const totals = useMemo(() => summarizeUsage(entries, MAX_ROWS), [entries]);
  const buckets = useMemo(() => usageTimeline(entries, span, Date.now()), [entries, span]);

  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <Text style={[type.headline, styles.auto, { color: colors.text }]}>{t('usage.title')}</Text>
      {totals.runs === 0 ? (
        <Text style={[type.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>
          {t('usage.empty')}
        </Text>
      ) : (
        <>
          <View style={styles.totalRow}>
            <View style={styles.totalBox}>
              <Text style={[type.title, styles.auto, { color: colors.text }]}>{totals.runs}</Text>
              <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>{t('usage.runs')}</Text>
            </View>
            <View style={styles.totalBox}>
              <Text style={[type.title, styles.auto, { color: colors.text }]}>{totals.tokens}</Text>
              <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>{t('usage.tokens')}</Text>
            </View>
            <View style={styles.totalBox}>
              <Text style={[type.title, styles.auto, { color: colors.text }]}>{totals.models}</Text>
              <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>{t('usage.models')}</Text>
            </View>
          </View>

          <View style={[styles.chartCard, { borderColor: colors.border }]}>
            <View style={styles.chartHead}>
              <Text style={[type.callout, styles.auto, { color: colors.text, flex: 1 }]}>{t('usage.chartTitle')}</Text>
              <View style={styles.spanRow} accessibilityRole="radiogroup">
                {SPANS.map((s) => (
                  <Text
                    key={s}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: span === s }}
                    onPress={() => setSpan(s)}
                    style={[
                      type.caption,
                      styles.spanChip,
                      { color: span === s ? colors.primary : colors.textMuted, borderColor: span === s ? colors.primary : colors.border },
                    ]}
                  >
                    {t(s === 7 ? 'usage.span7' : 'usage.span30')}
                  </Text>
                ))}
              </View>
            </View>
            <ActivityBars buckets={buckets} span={span} colors={colors} />
          </View>

          {totals.byModel.map((row) => {
            const date = new Date(row.lastAt);
            const lastLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
            return (
              <View key={row.modelId} style={[styles.modelRow, { borderColor: colors.border }]}>
                <View style={styles.modelText}>
                  <Text numberOfLines={1} style={[type.callout, styles.auto, { color: colors.text }]}>
                    {names[row.modelId] ?? row.modelId}
                  </Text>
                  <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>
                    {t('usage.lastUsed', { date: lastLabel })}
                  </Text>
                </View>
                <View style={styles.modelNumbers}>
                  <Text style={[type.callout, { color: colors.text, fontVariant: ['tabular-nums'] }]}>
                    {t('usage.runsCount', { n: row.runs })}
                  </Text>
                  <Text style={[type.caption, { color: colors.textMuted, fontVariant: ['tabular-nums'] }]}>
                    {row.tokens > 0 ? t('usage.tokensCount', { n: row.tokens }) : t('usage.tokensUnknown')}
                  </Text>
                </View>
              </View>
            );
          })}

          <View style={styles.footer}>
            <Text style={[type.caption, styles.auto, { color: colors.textMuted, flex: 1 }]}>
              {t('usage.hint')}
            </Text>
            <ShareStatsButton span={span} />
            <Text
              accessibilityRole="button"
              accessibilityLabel={t('usage.clear')}
              onPress={clear}
              style={[type.caption, styles.clear, { color: colors.danger }]}
            >
              {t('usage.clear')}
            </Text>
          </View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  auto: { textAlign: 'auto' },
  totalRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  totalBox: { alignItems: 'flex-start' },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  modelText: { flex: 1, gap: 1 },
  modelNumbers: { alignItems: 'flex-end' },
  chartCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spanRow: { flexDirection: 'row', gap: spacing.sm },
  spanChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  chartWrap: { marginTop: spacing.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  bar: { borderRadius: 2 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md },
  clear: { textDecorationLine: 'underline' },
});
