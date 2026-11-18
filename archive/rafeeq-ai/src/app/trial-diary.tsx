// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The trial diary screen — the 10-user × 1-week protocol's nightly form,
 * living where the data already lives: on the phone. Counters only, never
 * content (the one-word feeling field is capped at one word); the SUS
 * questionnaire lands here at the end of the week; the export button hands
 * the participant their own counters-only CSV to share if and when they
 * choose to. This is what makes the trial protocol executable without paper.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChevron, Button, Card, PressableScale, Segmented, Stepper } from '../components/ui';
import { goBack } from '../navigation/goBack';
import { confirmDialog, notify } from '../store/dialogStore';
import { useTrialStore } from '../store/trialStore';
import { syncDiaryReminder } from '../trial/diaryReminder';
import {
  DIARY_LIMITS,
  SUS_STATEMENTS,
  buildTrialCsv,
  dateKeyOf,
  normalizeDiaryEntry,
  susScore,
  weekSummary,
} from '../trial/diary';
import { radius, spacing, type as typeScale, useAppTheme } from '../theme';

/** The nightly nudge fires at 21:30 (the protocol's "2 minutes at night"). */
const DIARY_REMINDER_TIME = '21:30';

const SUS_STATEMENT_KEYS = Array.from({ length: SUS_STATEMENTS }, (_, i) => `trial.sus${i + 1}`);

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.metricRow}>
      <Text style={[typeScale.body, styles.auto, styles.metricLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typeScale.body, styles.auto, styles.metricValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function StepperRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.stepperRow}>
      <View style={styles.stepperText}>
        <Text style={[typeScale.body, styles.auto, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function TrialDiaryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const entries = useTrialStore((s) => s.entries);
  const sus = useTrialStore((s) => s.sus);
  const reminderEnabled = useTrialStore((s) => s.reminderEnabled);
  const scheduledId = useTrialStore((s) => s.scheduledId);
  const saveEntry = useTrialStore((s) => s.saveEntry);
  const deleteEntry = useTrialStore((s) => s.deleteEntry);
  const setSusAnswer = useTrialStore((s) => s.setSusAnswer);
  const setReminder = useTrialStore((s) => s.setReminder);
  const clearWeek = useTrialStore((s) => s.clearWeek);

  const todayKey = dateKeyOf(new Date());
  const today = entries[todayKey] ?? null;

  const [tasksTried, setTasksTried] = useState(today?.tasksTried ?? 0);
  const [completed, setCompleted] = useState(today?.completed ?? 0);
  const [rephrased, setRephrased] = useState(today?.rephrased ?? 0);
  const [wrongAction, setWrongAction] = useState(today?.wrongAction ?? 0);
  const [cardsAllShown, setCardsAllShown] = useState(today?.cardsAllShown ?? true);
  const [minutes, setMinutes] = useState(today?.minutes ?? 0);
  const [voiceTasks, setVoiceTasks] = useState(today?.voiceTasks ?? 0);
  const [felt, setFelt] = useState(today?.felt ?? '');

  const week = useMemo(() => weekSummary(Object.values(entries)), [entries]);
  const score = useMemo(() => susScore(sus), [sus]);
  const susDone = sus.every((a) => a !== null);

  const onSaveToday = () => {
    const entry = normalizeDiaryEntry({
      dateKey: todayKey,
      tasksTried,
      completed,
      rephrased,
      wrongAction,
      cardsAllShown,
      minutes,
      voiceTasks,
      felt,
    });
    saveEntry(entry);
    notify(t('trial.title'), t('trial.savedToday'));
  };

  const onDeleteToday = async () => {
    const ok = await confirmDialog({
      title: t('trial.deleteTodayTitle'),
      message: t('trial.deleteTodayBody', { date: todayKey }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) {
      deleteEntry(todayKey);
      setTasksTried(0);
      setCompleted(0);
      setRephrased(0);
      setWrongAction(0);
      setCardsAllShown(true);
      setMinutes(0);
      setVoiceTasks(0);
      setFelt('');
    }
  };

  const onExport = async () => {
    const csv = buildTrialCsv(Object.values(entries), score);
    try {
      await Share.share({ message: csv });
    } catch {
      // share sheet dismissed — nothing to do
    }
  };

  const onClearWeek = async () => {
    const ok = await confirmDialog({
      title: t('trial.clearTitle'),
      message: t('trial.clearBody', { days: week.days }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) clearWeek();
  };

  const onToggleReminder = async (v: boolean) => {
    const result = await syncDiaryReminder(v, DIARY_REMINDER_TIME, scheduledId);
    setReminder(v, result.id);
    if (v && result.id === null) {
      notify(t('trial.title'), t('trial.reminderFailed'));
    }
  };

  const susOptions = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

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
        <Text style={[typeScale.title, styles.auto, styles.headerTitle, { color: colors.text }]}>{t('trial.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('trial.subtitle')}</Text>

        <Card style={styles.block}>
          <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>{t('trial.todayTitle', { date: todayKey })}</Text>
          <StepperRow label={t('trial.tasksTried')}>
            <Stepper value={tasksTried} onChange={setTasksTried} step={1} min={0} max={DIARY_LIMITS.tasksMax} />
          </StepperRow>
          <StepperRow label={t('trial.completed')} hint={t('trial.completedHint')}>
            <Stepper value={completed} onChange={setCompleted} step={1} min={0} max={DIARY_LIMITS.tasksMax} />
          </StepperRow>
          <StepperRow label={t('trial.rephrased')}>
            <Stepper value={rephrased} onChange={setRephrased} step={1} min={0} max={DIARY_LIMITS.tasksMax} />
          </StepperRow>
          <StepperRow label={t('trial.wrongAction')} hint={t('trial.wrongActionHint')}>
            <Stepper value={wrongAction} onChange={setWrongAction} step={1} min={0} max={DIARY_LIMITS.tasksMax} />
          </StepperRow>
          <StepperRow label={t('trial.minutes')}>
            <Stepper value={minutes} onChange={setMinutes} step={1} min={0} max={DIARY_LIMITS.minutesMax} />
          </StepperRow>
          <StepperRow label={t('trial.voiceTasks')} hint={t('trial.voiceTasksHint')}>
            <Stepper value={voiceTasks} onChange={setVoiceTasks} step={1} min={0} max={DIARY_LIMITS.tasksMax} />
          </StepperRow>
          <View style={styles.settingRow}>
            <View style={styles.switchText}>
              <Text style={[typeScale.body, styles.auto, { color: colors.text }]}>{t('trial.cardsAllShown')}</Text>
              <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('trial.cardsAllShownHint')}</Text>
            </View>
            <Switch
              value={cardsAllShown}
              onValueChange={setCardsAllShown}
              accessibilityLabel={t('trial.cardsAllShown')}
            />
          </View>
          <Text style={[typeScale.body, styles.auto, styles.feltLabel, { color: colors.text }]}>{t('trial.felt')}</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            value={felt}
            onChangeText={setFelt}
            placeholder={t('trial.feltPlaceholder')}
            placeholderTextColor={colors.textFaint}
            maxLength={DIARY_LIMITS.feltMax}
            accessibilityLabel={t('trial.felt')}
          />
          <View style={styles.row}>
            <Button title={t('trial.saveToday')} compact variant="primary" onPress={onSaveToday} />
            {today ? (
              <Button title={t('common.delete')} compact variant="ghost" onPress={() => void onDeleteToday()} />
            ) : null}
          </View>
        </Card>

        <Card style={styles.block}>
          <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>{t('trial.susTitle')}</Text>
          <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('trial.susHint')}</Text>
          {SUS_STATEMENT_KEYS.map((key, i) => (
            <View key={key} style={styles.susRow}>
              <Text style={[typeScale.caption, styles.auto, styles.flex1, { color: colors.text }]}>
                {`${i + 1}. ${t(key)}`}
              </Text>
              <Segmented<number>
                value={sus[i] ?? 0}
                onChange={(v) => setSusAnswer(i, v)}
                options={susOptions}
              />
            </View>
          ))}
          {score !== null ? (
            <Text style={[typeScale.body, styles.auto, styles.susScore, { color: colors.accent }]}>
              {t('trial.susScore', { n: score })}
            </Text>
          ) : null}
        </Card>

        {week.days > 0 ? (
          <Card style={styles.block}>
            <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>{t('trial.weekTitle')}</Text>
            <SummaryRow label={t('trial.weekDays')} value={String(week.days)} />
            <SummaryRow label={t('trial.weekTried')} value={`${week.completed.toLocaleString()} / ${week.tasksTried.toLocaleString()}`} />
            <SummaryRow label={t('trial.weekCompletion')} value={fmtPct(week.completionRate)} />
            <SummaryRow label={t('trial.weekMisfire')} value={fmtPct(week.misfireRate)} />
            <SummaryRow label={t('trial.weekCards')} value={fmtPct(week.cardCoverageRate)} />
            <SummaryRow label={t('trial.weekMinutes')} value={week.minutesTotal.toLocaleString()} />
            <SummaryRow label={t('trial.weekAvgMinutes')} value={week.avgMinutesPerTask === null ? '—' : String(week.avgMinutesPerTask)} />
            <SummaryRow
              label={t('trial.weekTrend')}
              value={t('trial.weekTrendValue', {
                first: week.firstDayMinPerTask === null ? '—' : String(week.firstDayMinPerTask),
                last: week.lastDayMinPerTask === null ? '—' : String(week.lastDayMinPerTask),
              })}
            />
            <SummaryRow label={t('trial.weekSus')} value={score === null ? (susDone ? '—' : t('trial.susPending')) : String(score)} />
          </Card>
        ) : null}

        <Card style={styles.block}>
          <View style={styles.settingRow}>
            <View style={styles.switchText}>
              <Text style={[typeScale.body, styles.auto, { color: colors.text }]}>{t('trial.reminderSwitch')}</Text>
              <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('trial.reminderHint')}</Text>
            </View>
            <Switch value={reminderEnabled} onValueChange={(v) => void onToggleReminder(v)} accessibilityLabel={t('trial.reminderSwitch')} />
          </View>
          <View style={styles.row}>
            <Button title={t('trial.export')} compact variant="primary" onPress={() => void onExport()} />
            <Button title={t('trial.clearWeek')} compact variant="ghost" onPress={() => void onClearWeek()} />
          </View>
          <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('trial.exportHint')}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  headerTitle: { marginStart: spacing.sm, flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  auto: { textAlign: 'auto', writingDirection: 'auto' },
  block: { marginTop: spacing.md, borderRadius: radius.lg },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, gap: spacing.md },
  stepperText: { flexShrink: 1 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  switchText: { flexShrink: 1, marginEnd: spacing.md },
  feltLabel: { marginTop: spacing.md },
  input: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'center',
  },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  susRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, gap: spacing.md },
  flex1: { flexShrink: 1 },
  susScore: { marginTop: spacing.md },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  metricLabel: { flexShrink: 1, marginEnd: spacing.md },
  metricValue: { fontVariant: ['tabular-nums'] },
});

