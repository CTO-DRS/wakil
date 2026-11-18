// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LookArea } from '../../components/LookArea';
import { OnboardingShell } from '../../components/OnboardingShell';
import { Button, PressableScale } from '../../components/ui';
import { CategoryGlyph } from '../../components/LibraryIcons';
import { GOALS, normalizeGoals, type GoalId } from '../../onboarding/goals';
import { useProfileStore } from '../../store/profileStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function GoalsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const isAr = i18n.language === 'ar';
  const setGoals = useProfileStore((s) => s.setGoals);
  const saved = useProfileStore((s) => s.goals);
  const [selected, setSelected] = useState<GoalId[]>(saved);

  const toggle = (id: GoalId) => {
    haptic.tap();
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((g) => g !== id);
      // «Free use» clears the rest, and any concrete goal clears «free».
      if (id === 'free') return ['free'];
      const next = prev.filter((g) => g !== 'free');
      return [...next, id];
    });
  };

  const next = () => {
    setGoals(selected);
    router.push('/onboarding/profile');
  };

  const skip = () => {
    // Skipping the goals keeps the profile honest: no goals were picked, so
    // the recommendation falls back to the default chat track.
    setGoals([]);
    router.push('/onboarding/profile');
  };

  return (
    <LookArea style={styles.root}>
      <OnboardingShell step="goals" onSkip={skip}>
        <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.goalsTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.goalsBody')}</Text>

        <View style={styles.grid}>
          {GOALS.map((g, i) => {
            const active = selected.includes(g.id);
            return (
              <Animated.View key={g.id} entering={FadeInDown.delay(i * 45).duration(320)} style={styles.cell}>
                <PressableScale
                  onPress={() => toggle(g.id)}
                  hapticOnPress={false}
                  accessibilityRole="checkbox"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={isAr ? g.ar : g.en}
                >
                  <View
                    style={[
                      styles.card,
                      {
                        backgroundColor: active ? colors.surfaceAlt : colors.surface,
                        borderColor: active ? BRAND.cyan : colors.border,
                      },
                    ]}
                  >
                    <CategoryGlyph icon={g.icon} color={active ? BRAND.cyan : colors.textMuted} size={26} />
                    <Text style={[type.label, styles.center, { color: active ? colors.text : colors.textMuted }]} numberOfLines={2}>
                      {isAr ? g.ar : g.en}
                    </Text>
                    {active ? <View style={[styles.bar, { backgroundColor: BRAND.cyan }]} /> : null}
                  </View>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>

        <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
          {t('onboarding.goalsCount', { count: selected.length })}
        </Text>

        <Button
          title={t('onboarding.continue')}
          variant="primary"
          onPress={next}
          disabled={normalizeGoals(selected).length === 0}
          style={styles.cta}
        />
      </OnboardingShell>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  cell: { width: '31%' },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 6,
    minHeight: 96,
    justifyContent: 'center',
  },
  bar: { position: 'absolute', top: spacing.sm, bottom: spacing.sm, start: 0, width: 3, borderRadius: 2 },
  cta: { marginTop: spacing.sm },
});
