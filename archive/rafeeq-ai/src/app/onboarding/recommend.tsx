// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Paths } from 'expo-file-system';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LookArea } from '../../components/LookArea';
import { OnboardingCard, OnboardingShell } from '../../components/OnboardingShell';
import { CategoryGlyph } from '../../components/LibraryIcons';
import { Badge, Button, StatusChip } from '../../components/ui';
import { availableRamBytes } from '../../hooks/useModelLoader';
import { goalById } from '../../onboarding/goals';
import { TRACKS, type ReasonKey } from '../../onboarding/recommendation';
import { estimateRuntimeBytes } from '../../models/resources';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../../theme';
import { formatApproxBytes } from '../../utils/format';
import { useModelStore } from '../../store/modelStore';

function freeDisk(): number | null {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}

export default function RecommendScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const isAr = i18n.language === 'ar';
  const [ram] = useState(() => availableRamBytes());
  const [disk] = useState(() => freeDisk());
  const nCtx = useSettingsStore((s) => s.contextSize);
  const recommendation = useProfileStore((s) => s.recommendation);
  const goals = useProfileStore((s) => s.goals);

  // One honest computation whenever the inputs changed since the last run.
  useEffect(() => {
    useProfileStore.getState().refreshRecommendation({ ramBytes: ram, diskBytes: disk, nCtx });
  }, [ram, disk, nCtx, goals]);

  const track = useMemo(
    () => TRACKS.find((tr) => tr.id === recommendation?.trackId) ?? TRACKS[1]!,
    [recommendation?.trackId],
  );
  const primary = recommendation ? goalById(recommendation.primaryGoal) : null;
  const model = useModelStore((s) => (recommendation ? s.getModel(recommendation.modelId) : null));

  const reasonText = (key: ReasonKey, params?: Record<string, string | number>): string => {
    if (key === 'goals') {
      const g = goalById(String(params?.goal ?? ''));
      return t('onboarding.reason.goals', { goal: g ? (isAr ? g.ar : g.en) : '' });
    }
    return t(`onboarding.reason.${key}`, { ...params });
  };

  const next = () => {
    useSettingsStore.getState().setOnboardingStep('path');
    router.push('/onboarding/path');
  };

  return (
    <LookArea style={styles.root}>
      <OnboardingShell step="recommend">
        <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.recTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.recBody')}</Text>

        {recommendation ? (
          <>
            <OnboardingCard enteringDelay={40}>
              <View style={styles.trackRow}>
                <CategoryGlyph icon={track.icon} color={BRAND.cyan} size={30} />
                <View style={styles.flex}>
                  <Text style={[type.caption, { color: colors.textMuted }]}>{t('onboarding.recTrack')}</Text>
                  <Text style={[type.headline, { color: colors.text }]}>{isAr ? track.ar : track.en}</Text>
                </View>
              </View>
              <View style={styles.chips}>
                {primary ? (
                  <StatusChip tone="primary" label={`${t('onboarding.recPrimaryGoal')}: ${isAr ? primary.ar : primary.en}`} />
                ) : null}
                {recommendation.secondaryGoals.slice(0, 2).map((gid) => {
                  const g = goalById(gid);
                  return g ? <StatusChip key={gid} tone="neutral" label={isAr ? g.ar : g.en} /> : null;
                })}
              </View>
            </OnboardingCard>

            <OnboardingCard title={t('onboarding.recWhy')} enteringDelay={90}>
              {model ? (
                <View style={styles.modelRow}>
                  <Text style={[type.headline, styles.flex, { color: colors.text }]}>{model.name}</Text>
                  <StatusChip tone="success" label={t('onboarding.recommended')} />
                </View>
              ) : null}
              <View style={styles.reasons}>
                {recommendation.reasons.map((r, i) => (
                  <Animated.View key={`${r.key}-${i}`} entering={FadeInDown.delay(120 + i * 60).duration(300)}>
                    <Text style={[type.body, { color: colors.textMuted }]}>• {reasonText(r.key, r.params)}</Text>
                  </Animated.View>
                ))}
              </View>
              <View style={styles.badges}>
                {model ? <Badge label={t('onboarding.size', { value: formatApproxBytes(model.sizeBytes) })} /> : null}
                {model ? (
                  <Badge
                    label={
                      ram
                        ? t('onboarding.ram', { value: formatApproxBytes(estimateRuntimeBytes(model.sizeBytes, nCtx)) })
                        : t('onboarding.freeRamUnknown')
                    }
                  />
                ) : null}
              </View>
              <Text style={[type.caption, { color: colors.textFaint }]}>{t('onboarding.recVoiceNote')}</Text>
              {recommendation.visualNotIntegrated ? (
                <View style={[styles.visualNote, { borderColor: colors.warning }]}>
                  <Text style={[type.caption, { color: colors.textMuted }]}>{t('onboarding.recVisualNote')}</Text>
                </View>
              ) : null}
            </OnboardingCard>

            <Button title={t('onboarding.continue')} variant="primary" onPress={next} />
            <Button
              title={t('onboarding.recChange')}
              variant="ghost"
              onPress={() => {
                useSettingsStore.getState().setOnboardingStep('path');
                router.push('/onboarding/path');
              }}
            />
          </>
        ) : (
          <OnboardingCard enteringDelay={40}>
            <Text style={[type.body, styles.center, { color: colors.textMuted }]}>
              {goals.length === 0 ? t('onboarding.sumNone') : '…'}
            </Text>
            <Button title={t('onboarding.continue')} variant="primary" onPress={next} />
          </OnboardingCard>
        )}
      </OnboardingShell>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reasons: { gap: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  visualNote: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
});
