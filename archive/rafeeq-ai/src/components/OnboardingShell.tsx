// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The shared onboarding shell: a themed glass surface with the flow progress
 * (animated bar + «step X of N» label) and an optional skip affordance. Every
 * onboarding screen renders inside one, so the whole wizard feels like a
 * single journey — and the progress indicator the user sees is always honest
 * about where they are.
 */

import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, GlassSurface } from './ui';
import { ONBOARDING_STEPS, type OnboardingStep } from '../store/settingsStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../theme';

export function stepIndex(step: OnboardingStep): number {
  return Math.max(0, ONBOARDING_STEPS.indexOf(step));
}

export function OnboardingShell({
  step,
  onSkip,
  skipLabel,
  children,
  scroll = true,
  style,
}: {
  step: OnboardingStep;
  /** When provided, a skip button renders in the top bar. */
  onSkip?: () => void;
  skipLabel?: string;
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const index = stepIndex(step);
  const total = ONBOARDING_STEPS.length;
  const progress = (index + 1) / total;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }, style]}>
      <View style={styles.topBar}>
        <Text style={[type.caption, { color: colors.textMuted }]} accessibilityRole="header">
          {t('onboarding.progress', { current: index + 1, total })}
        </Text>
        {onSkip ? <Button title={skipLabel ?? t('onboarding.skip')} variant="ghost" compact onPress={onSkip} /> : null}
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: index + 1 }}>
        <Animated.View
          entering={FadeInUp.duration(300)}
          style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: BRAND.cyan }]}
        />
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
    </View>
  );
}

/** A titled glass card used by the onboarding steps for one consistent look. */
export function OnboardingCard({
  title,
  children,
  enteringDelay = 0,
}: {
  title?: string;
  children: React.ReactNode;
  enteringDelay?: number;
}) {
  const { colors } = useAppTheme();
  return (
    <Animated.View entering={FadeInDown.delay(enteringDelay).duration(360)}>
      <GlassSurface radiusSize={radius.xl} style={styles.card}>
        {title ? <Text style={[type.headline, { color: colors.text }]}>{title}</Text> : null}
        {children}
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xl },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    gap: spacing.sm,
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,127,127,0.25)',
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: { height: '100%', borderRadius: radius.pill },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  card: { padding: spacing.xl, gap: spacing.md },
});
