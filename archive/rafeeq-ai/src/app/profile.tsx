// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * «My goals & recommendations»: the post-onboarding home of the profile. It
 * reuses the same goals editor the onboarding uses, recomputes the
 * recommendation from real device facts on demand, and applying it only
 * changes the default model id — nothing downloads behind the user's back.
 */

import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Paths } from 'expo-file-system';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';

import { CategoryGlyph } from '../components/LibraryIcons';
import { LookArea } from '../components/LookArea';
import { BackChevron, Button, PressableScale, ScreenHeader, SectionTitle, Segmented, StatusChip } from '../components/ui';
import { goBack } from '../navigation/goBack';
import { availableRamBytes } from '../hooks/useModelLoader';
import { GOALS, type GoalId } from '../onboarding/goals';
import { TRACKS } from '../onboarding/recommendation';
import { useModelStore } from '../store/modelStore';
import { useProfileStore } from '../store/profileStore';
import { useSettingsStore } from '../store/settingsStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../theme';
import { haptic } from '../utils/haptics';

export default function ProfileEditorScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const isAr = i18n.language === 'ar';
  const goals = useProfileStore((s) => s.goals);
  const experience = useProfileStore((s) => s.experience);
  const preference = useProfileStore((s) => s.preference);
  const answerStyle = useProfileStore((s) => s.answerStyle);
  const recommendation = useProfileStore((s) => s.recommendation);

  const [ram] = useState(() => availableRamBytes());
  const [disk] = useState(() => {
    try {
      return Paths.availableDiskSpace;
    } catch {
      return null;
    }
  });

  // One honest recompute when the screen opens or the inputs changed.
  useEffect(() => {
    useProfileStore.getState().refreshRecommendation({
      ramBytes: ram,
      diskBytes: disk,
      nCtx: useSettingsStore.getState().contextSize,
    });
  }, [ram, disk, goals, experience, preference, answerStyle]);

  const track = TRACKS.find((tr) => tr.id === recommendation?.trackId);
  const recModel = useModelStore((s) => (recommendation ? s.getModel(recommendation.modelId) : null));
  const currentModel = useSettingsStore((s) => (s.selectedModelId ? useModelStore.getState().getModel(s.selectedModelId) : null));

  const toggleGoal = (id: GoalId) => {
    haptic.tap();
    const prev = useProfileStore.getState().goals;
    const next = prev.includes(id)
      ? prev.filter((g) => g !== id)
      : id === 'free'
        ? ['free' as GoalId]
        : [...prev.filter((g) => g !== 'free'), id];
    useProfileStore.getState().setGoals(next);
  };

  const apply = () => {
    if (!recommendation) return;
    useSettingsStore.getState().setSelectedModelId(recommendation.modelId);
    haptic.success();
  };

  return (
    <LookArea style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <BackChevron color={colors.text} />
        </PressableScale>
        <ScreenHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle>{t('profile.goalsSection')}</SectionTitle>
        {goals.length === 0 ? (
          <Text style={[type.callout, { color: colors.textMuted }]}>{t('profile.emptyHint')}</Text>
        ) : null}
        <View style={styles.grid}>
          {GOALS.map((g, i) => {
            const active = goals.includes(g.id);
            return (
              <Animated.View key={g.id} entering={FadeInDown.delay(i * 30).duration(280)} style={styles.cell}>
                <PressableRow active={active} onPress={() => toggleGoal(g.id)} icon={g.icon} label={isAr ? g.ar : g.en} />
              </Animated.View>
            );
          })}
        </View>

        <SectionTitle>{t('profile.answersSection')}</SectionTitle>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[type.label, { color: colors.text }]}>{t('onboarding.qPreference')}</Text>
          <Segmented
            value={preference ?? 'balance'}
            onChange={(v) => useProfileStore.getState().setPreference(v as 'speed' | 'accuracy' | 'balance')}
            options={[
              { value: 'speed', label: t('onboarding.prefSpeed') },
              { value: 'balance', label: t('onboarding.prefBalance') },
              { value: 'accuracy', label: t('onboarding.prefAccuracy') },
            ]}
          />
          <Text style={[type.label, styles.gap, { color: colors.text }]}>{t('onboarding.qAnswerStyle')}</Text>
          <Segmented
            value={answerStyle}
            onChange={(v) => useProfileStore.getState().setAnswerStyle(v as 'concise' | 'balanced' | 'detailed')}
            options={[
              { value: 'concise', label: t('onboarding.styleConcise') },
              { value: 'balanced', label: t('onboarding.styleBalanced') },
              { value: 'detailed', label: t('onboarding.styleDetailed') },
            ]}
          />
          <Text style={[type.label, styles.gap, { color: colors.text }]}>{t('onboarding.qExperience')}</Text>
          <Segmented
            value={experience ?? ''}
            onChange={(v) => useProfileStore.getState().setExperience(v as 'beginner' | 'intermediate' | 'pro')}
            options={[
              { value: 'beginner', label: t('onboarding.expBeginner') },
              { value: 'intermediate', label: t('onboarding.expIntermediate') },
              { value: 'pro', label: t('onboarding.expPro') },
            ]}
          />
        </View>

        <SectionTitle>{t('profile.recSection')}</SectionTitle>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {track ? (
            <View style={styles.row}>
              <CategoryGlyph icon={track.icon} color={BRAND.cyan} size={24} />
              <Text style={[type.headline, styles.flex, { color: colors.text }]}>{isAr ? track.ar : track.en}</Text>
            </View>
          ) : null}
          {recModel ? (
            <View style={styles.row}>
              <Text style={[type.body, styles.flex, { color: colors.text }]}>{recModel.name}</Text>
              {currentModel?.id === recModel.id ? (
                <StatusChip tone="success" label={t('profile.appliedNote')} dot={false} />
              ) : null}
            </View>
          ) : null}
          <Button title={t('profile.refresh')} variant="secondary" compact onPress={() => {
            useProfileStore.getState().refreshRecommendation({
              ramBytes: availableRamBytes(),
              diskBytes: disk,
              nCtx: useSettingsStore.getState().contextSize,
            });
          }} />
          <Button title={t('profile.apply')} variant="primary" onPress={apply} disabled={!recommendation} />
          <Text style={[type.caption, { color: colors.textFaint }]}>{t('profile.appliedNote')}</Text>
        </View>
      </ScrollView>
    </LookArea>
  );
}

function PressableRow({ active, onPress, icon, label }: { active: boolean; onPress: () => void; icon: string; label: string }) {
  return (
    <Button
      title={label}
      variant={active ? 'primary' : 'secondary'}
      compact
      onPress={onPress}
      accessibilityLabel={label}
      icon={<CategoryGlyph icon={icon} color={active ? '#FFFFFF' : BRAND.cyan} size={16} />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  content: { gap: spacing.md, paddingTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { width: '48%', flexGrow: 1 },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  gap: { marginTop: spacing.sm },
});
