// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The measure lab — the Phase-5 device protocol (battery / heat / RAM) as an
 * in-app, one-tap flow. Pick one of the five protocol sessions, start it,
 * use the app the way the session describes, stop — and the summary evaluates
 * the pre-declared acceptance gates from real rows sampled by the native
 * probe. Everything runs in airplane mode and stays on the device; the CSV
 * export is the row source the results tables in
 * docs/phase5-device-measurements.md paste from.
 */

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hasNativeMeasure, readDeviceSample, type MeasureSample } from '../../modules/rafeeq-measure';
import {
  MEASURE_SESSION_IDS,
  MEASURE_SESSION_MINUTES,
  buildMeasureCsv,
  type MeasureSessionId,
} from '../measure/session';
import { reconcileMeasure } from '../measure/controller';
import { BackChevron, Button, Card, PressableScale, Segmented, StatusChip } from '../components/ui';
import { goBack } from '../navigation/goBack';
import { confirmDialog, notify } from '../store/dialogStore';
import { sessionSummary, useMeasureStore } from '../store/measureStore';
import { radius, spacing, type as typeScale, useAppTheme } from '../theme';

const SESSION_LABEL_KEY: Record<MeasureSessionId, string> = {
  s1_idle: 'measure.s1Idle',
  s2_chat: 'measure.s2Chat',
  s3_agent: 'measure.s3Agent',
  s4_voice: 'measure.s4Voice',
  s5_briefing: 'measure.s5Briefing',
};

const SESSION_DO_KEY: Record<MeasureSessionId, string> = {
  s1_idle: 'measure.doIdle',
  s2_chat: 'measure.doChat',
  s3_agent: 'measure.doAgent',
  s4_voice: 'measure.doVoice',
  s5_briefing: 'measure.doBriefing',
};

function fmt(v: number | null, suffix = ''): string {
  return v === null ? '—' : `${v.toLocaleString()}${suffix}`;
}

function fmtTemp(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}°C`;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${`${s}`.padStart(2, '0')}`;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.metricRow}>
      <Text style={[typeScale.body, styles.auto, styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typeScale.body, styles.auto, styles.metricValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function GateRow({ label, ok }: { label: string; ok: boolean | null }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const tone = ok === null ? 'neutral' : ok ? 'success' : 'danger';
  const chip = ok === null ? t('measure.gateNa') : ok ? t('measure.gatePass') : t('measure.gateFail');
  return (
    <View style={styles.gateRow}>
      <Text style={[typeScale.caption, styles.auto, styles.flex1, { color: colors.text }]}>{label}</Text>
      <StatusChip label={chip} tone={tone} dot={ok !== null} />
    </View>
  );
}

export default function MeasureScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const active = useMeasureStore((s) => s.active);
  const sessions = useMeasureStore((s) => s.sessions);
  const begin = useMeasureStore((s) => s.begin);
  const tick = useMeasureStore((s) => s.tick);
  const finish = useMeasureStore((s) => s.finish);
  const clear = useMeasureStore((s) => s.clear);

  const [selected, setSelected] = useState<MeasureSessionId>(active ? active.id : 's4_voice');
  const [live, setLive] = useState<MeasureSample | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const probe = hasNativeMeasure();

  // The sampler lives in the app-level controller (src/measure/controller.ts)
  // so it survives leaving this screen — the S5 protocol demands it. The
  // screen only reconciles once on mount: a rehydrated session past its
  // deadline is auto-finished, an in-window one gets its due sample.
  useEffect(() => {
    reconcileMeasure(Date.now());
  }, []);

  // Live readout: a light poll while the screen is open, active or not. The
  // first read rides a timeout (never a synchronous setState inside the effect).
  useEffect(() => {
    if (!probe) return;
    const first = setTimeout(() => setLive(readDeviceSample()), 0);
    const iv = setInterval(() => setLive(readDeviceSample()), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [probe]);

  // Elapsed clock while a session runs.
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [active]);

  const summary = useMemo(() => sessionSummary(selected, sessions), [selected, sessions]);
  const sessionLabels = useMemo(
    () =>
      Object.fromEntries(MEASURE_SESSION_IDS.map((id) => [id, t(SESSION_LABEL_KEY[id])])) as Record<
        MeasureSessionId,
        string
      >,
    [t],
  );

  const onStart = () => {
    if (begin(selected, Date.now())) {
      tick(readDeviceSample());
      notify(t('measure.title'), t('measure.started', { name: sessionLabels[selected] }));
    }
  };

  const onStop = () => {
    if (finish(Date.now())) {
      notify(t('measure.title'), t('measure.stopped', { name: sessionLabels[selected] }));
    }
  };

  const onExport = async () => {
    const stored = sessions[selected];
    if (!stored || stored.rows.length === 0) return;
    const deviceModel = stored.rows[stored.rows.length - 1].deviceModel ?? null;
    const csv = buildMeasureCsv(selected, stored.rows, deviceModel, {
      startedAt: stored.startedAt,
      endedAt: stored.endedAt,
    });
    try {
      await Share.share({ message: csv });
    } catch {
      // share sheet dismissed — nothing to do
    }
  };

  const onClear = async (id: MeasureSessionId) => {
    const ok = await confirmDialog({
      title: t('measure.clearTitle'),
      message: t('measure.clearBody', { name: sessionLabels[id] }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) clear(id);
  };

  const elapsed = active ? fmtDuration(Math.max(0, Math.floor((now - active.startedAt) / 1000))) : null;
  const gateLabels: { label: string; ok: boolean | null }[] = summary
    ? [
        {
          label:
            summary.gates.batteryDrainPct === null
              ? t('measure.gateBatteryNA')
              : t('measure.gateBattery', { n: summary.gates.batteryDrainPct }),
          ok: summary.gates.batteryOk,
        },
        {
          label: t('measure.gateTemp', { n: summary.maxTempC === null ? '—' : summary.maxTempC.toFixed(1) }),
          ok: summary.gates.tempOk,
        },
        {
          label: t('measure.gateRam', {
            n: summary.peakPssKb === null ? '—' : Math.round(summary.peakPssKb / 1024).toLocaleString(),
          }),
          ok: summary.gates.pssOk,
        },
        { label: t('measure.gateUnplug'), ok: summary.gates.unplugOk },
      ]
    : [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <PressableScale
          onPress={() => goBack(router)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.back')}
          hitSlop={10}
        >
          <BackChevron color={colors.text} />
        </PressableScale>
        <Text style={[typeScale.title, styles.auto, styles.headerTitle, { color: colors.text }]}>{t('measure.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('measure.subtitle')}</Text>
        {!probe ? <Text style={[typeScale.caption, styles.auto, styles.warn, { color: colors.danger }]}>{t('measure.noProbe')}</Text> : null}

        <Text style={[typeScale.caption, styles.auto, styles.pickerLabel, { color: colors.text }]}>{t('measure.pickSession')}</Text>
        <Segmented<MeasureSessionId>
          value={selected}
          onChange={(id) => setSelected(id)}
          options={MEASURE_SESSION_IDS.map((id) => ({ value: id, label: sessionLabels[id] }))}
        />
        <Text style={[typeScale.caption, styles.auto, styles.doHint, { color: colors.textMuted }]}>
          {t(SESSION_DO_KEY[selected], { minutes: MEASURE_SESSION_MINUTES[selected] })}
        </Text>
        <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('measure.airplaneHint')}</Text>

        {live ? (
          <Card style={styles.block}>
            <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>{t('measure.liveTitle')}</Text>
            <MetricRow label={t('measure.liveBattery')} value={fmt(live.batteryPct, '%')} />
            <MetricRow label={t('measure.liveTemp')} value={fmtTemp(live.tempC)} />
            <MetricRow
              label={t('measure.livePower')}
              value={fmt(live.powerMw === null ? null : Math.round(live.powerMw), ' mW')}
            />
            <MetricRow
              label={t('measure.livePss')}
              value={fmt(live.pssKb === null ? null : Math.round(live.pssKb / 1024), ' MB')}
            />
            <MetricRow label={t('measure.liveThermal')} value={live.thermal ?? '—'} />
            <MetricRow
              label={t('measure.liveCharging')}
              value={t(live.charging ? 'measure.chargingYes' : 'measure.chargingNo')}
            />
          </Card>
        ) : null}

        {active ? (
          <Card style={styles.block}>
            <Text style={[typeScale.label, styles.auto, { color: colors.accent }]}>
              {t('measure.running', { name: sessionLabels[active.id] })}
            </Text>
            <MetricRow label={t('measure.elapsed')} value={elapsed ?? '0:00'} />
            <MetricRow label={t('measure.samples')} value={String(active.rows.length)} />
            <View style={styles.row}>
              <Button title={t('measure.stop')} compact variant="primary" onPress={onStop} />
            </View>
          </Card>
        ) : (
          <View style={[styles.row, styles.block]}>
            <Button
              title={t('measure.start', { minutes: MEASURE_SESSION_MINUTES[selected] })}
              compact
              variant="primary"
              onPress={onStart}
              disabled={!probe}
            />
          </View>
        )}

        {summary ? (
          <Card style={styles.block}>
            <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>
              {t('measure.summaryTitle', { name: sessionLabels[summary.id] })}
            </Text>
            <MetricRow label={t('measure.duration')} value={fmtDuration(summary.durationSec)} />
            <MetricRow label={t('measure.samples')} value={String(summary.samples)} />
            {summary.coveragePct !== null ? (
              <MetricRow label={t('measure.coverage')} value={`${summary.coveragePct}%`} />
            ) : null}
            {summary.coveragePct !== null && summary.coveragePct < 50 ? (
              <Text style={[typeScale.caption, styles.auto, styles.lowCoverage, { color: colors.textMuted }]}>
                {t('measure.lowCoverage')}
              </Text>
            ) : null}
            <MetricRow
              label={t('measure.batterySpan')}
              value={t('measure.batterySpanValue', {
                from: fmt(summary.batteryStartPct, '%'),
                to: fmt(summary.batteryEndPct, '%'),
              })}
            />
            <MetricRow label={t('measure.maxTemp')} value={fmtTemp(summary.maxTempC)} />
            <MetricRow
              label={t('measure.peakRam')}
              value={fmt(summary.peakPssKb === null ? null : Math.round(summary.peakPssKb / 1024), ' MB')}
            />
            <MetricRow label={t('measure.thermal')} value={summary.worstThermal ?? '—'} />
            <View style={styles.gates}>
              {gateLabels.map((g) => (
                <GateRow key={g.label} label={g.label} ok={g.ok} />
              ))}
            </View>
            <View style={styles.row}>
              <Button title={t('measure.export')} compact variant="primary" onPress={() => void onExport()} />
              <Button title={t('common.delete')} compact variant="ghost" onPress={() => void onClear(summary.id)} />
            </View>
          </Card>
        ) : (
          <Text style={[typeScale.caption, styles.auto, styles.empty, { color: colors.textMuted }]}>
            {t('measure.empty')}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  headerTitle: { marginStart: spacing.sm, flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  auto: { textAlign: 'auto', writingDirection: 'auto' },
  warn: { marginTop: spacing.xs },
  pickerLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  doHint: { marginTop: spacing.sm },
  block: { marginTop: spacing.md, borderRadius: radius.lg },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  metricLabel: { flexShrink: 1 },
  metricValue: { fontVariant: ['tabular-nums'] },
  lowCoverage: { marginTop: spacing.xs, fontStyle: 'italic' },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  gates: { marginTop: spacing.md, gap: spacing.xs },
  gateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex1: { flex: 1 },
  empty: { marginTop: spacing.lg },
});
