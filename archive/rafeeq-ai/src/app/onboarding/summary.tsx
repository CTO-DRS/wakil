// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { LookArea } from '../../components/LookArea';
import { OnboardingCard, OnboardingShell } from '../../components/OnboardingShell';
import { CategoryGlyph } from '../../components/LibraryIcons';
import { Button, PressableScale, StatusChip } from '../../components/ui';
import { RafeeqBot } from '../../components/RafeeqBot';
import { goalById } from '../../onboarding/goals';
import { CORE_PERMISSION_IDS, readAllPermissionStates } from '../../onboarding/permissions';
import { TRACKS } from '../../onboarding/recommendation';
import { useModelStore } from '../../store/modelStore';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppearanceStore } from '../../store/appearanceStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../../theme';
import { themeById } from '../../theme/themes';
import { haptic } from '../../utils/haptics';

type SummaryRow = {
  key: string;
  label: string;
  value: string;
  chip?: { label: string; tone: 'success' | 'warning' };
  editTo?: string;
};

/** Static i18n keys for the answer-style names (the QA scan reads these). */
const STYLE_LABEL_KEYS = {
  concise: 'onboarding.styleConcise',
  balanced: 'onboarding.styleBalanced',
  detailed: 'onboarding.styleDetailed',
} as const;

/**
 * The final review. Every row is a live read from its store (no duplicated
 * state), and every row's «edit» jumps straight back to that step — the user
 * never replays the whole wizard to change one answer.
 */
export default function SummaryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const isAr = i18n.language === 'ar';
  const settings = useSettingsStore();
  const themeId = useAppearanceStore((s) => s.themeId);
  const profile = useProfileStore();
  const [permStates, setPermStates] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    void readAllPermissionStates(CORE_PERMISSION_IDS).then((s) => {
      if (alive) setPermStates(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const granted = CORE_PERMISSION_IDS.filter((id) => permStates?.[id] === 'granted').length;

  const track = TRACKS.find((tr) => tr.id === profile.recommendation?.trackId) ?? TRACKS[1]!;
  const model = useModelStore((s) => (settings.selectedModelId ? s.getModel(settings.selectedModelId) : null));
  const themeDef = themeId === 'system' ? null : themeById(themeId);
  const themeName = themeDef ? (isAr ? themeDef.nameAr : themeDef.name) : t('onboarding.systemTheme');
  const goals = profile.goals
    .map((g) => goalById(g))
    .filter((g): g is NonNullable<typeof g> => g !== null)
    .map((g) => (isAr ? g.ar : g.en));

  const rows: SummaryRow[] = [
    { key: 'language', label: t('onboarding.sumLanguage'), value: settings.language === 'ar' ? 'العربية' : 'English', editTo: '/onboarding/language' },
    { key: 'theme', label: t('onboarding.sumTheme'), value: themeName, editTo: '/onboarding/language' },
    {
      key: 'goals',
      label: t('onboarding.sumGoals'),
      value: goals.length ? goals.join('، ') : t('onboarding.sumNone'),
      editTo: '/onboarding/goals',
    },
    {
      key: 'track',
      label: t('onboarding.sumTrack'),
      value: isAr ? track.ar : track.en,
      editTo: '/onboarding/recommend',
    },
    {
      key: 'model',
      label: t('onboarding.sumModel'),
      value: model ? model.name : t('onboarding.skipLater'),
      editTo: '/onboarding/path',
    },
    {
      key: 'perms',
      label: t('onboarding.sumPermissions'),
      value: permStates
        ? t('onboarding.sumPerm', { granted, total: CORE_PERMISSION_IDS.length })
        : '…',
      editTo: '/onboarding/permissions',
    },
    {
      key: 'pers',
      label: t('onboarding.sumPersonalization'),
      value: [
        t(STYLE_LABEL_KEYS[profile.answerStyle]),
        settings.autoSpeak ? t('onboarding.persVoice') : null,
        settings.animated ? t('onboarding.persMotion') : null,
      ]
        .filter(Boolean)
        .join(' · '),
      editTo: '/onboarding/personalize',
    },
  ];

  const start = () => {
    haptic.success();
    // Home then opens the chat when a default model exists; otherwise the
    // models tab is one tap away — the honest behavior for «skip».
    useSettingsStore.getState().completeOnboarding({ openChat: !!useSettingsStore.getState().selectedModelId });
  };

  return (
    <LookArea style={styles.root}>
      <OnboardingShell step="summary">
        <View style={styles.botWrap}>
          <RafeeqBot size={110} interactive state="speaking" />
        </View>
        <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.sumTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.sumBody')}</Text>

        {rows.map((row, i) => (
          <OnboardingCard key={row.key} enteringDelay={i * 45}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={[type.caption, { color: colors.textMuted }]}>{row.label}</Text>
                <Text style={[type.body, { color: colors.text }]}>{row.value}</Text>
              </View>
              {row.editTo ? (
                <PressableScale
                  onPress={() => {
                    haptic.tap();
                    router.push(row.editTo as Href);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('onboarding.sumEdit')}: ${row.label}`}
                >
                  <View style={[styles.editBtn, { borderColor: colors.border }]}>
                    <Text style={[type.caption, { color: colors.primary }]}>{t('onboarding.sumEdit')}</Text>
                  </View>
                </PressableScale>
              ) : null}
            </View>
          </OnboardingCard>
        ))}

        <View style={styles.ctaWrap}>
          <Button title={t('onboarding.sumCta')} variant="primary" onPress={start} />
          <View style={styles.ctaChip}>
            <CategoryGlyph icon="bolt" color={BRAND.cyan} size={18} />
            <StatusChip tone="accent" label={t('onboarding.offlineFact')} dot={false} />
          </View>
        </View>
      </OnboardingShell>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { textAlign: 'center' },
  botWrap: { alignItems: 'center', paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  editBtn: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  ctaWrap: { gap: spacing.sm, marginTop: spacing.sm },
  ctaChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
