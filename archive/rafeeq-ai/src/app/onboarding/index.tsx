// Copyright (c) 2026 DRS AI. All rights reserved.
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideInRight, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LookArea } from '../../components/LookArea';
import { RafeeqBot, type BotState } from '../../components/RafeeqBot';
import { Button } from '../../components/ui';
import { ONBOARDING_STEPS, useSettingsStore } from '../../store/settingsStore';
import { BRAND, motion, radius, spacing, type, useAppTheme } from '../../theme';

const SLIDES: { title: string; body: string; bot: BotState; progress?: number }[] = [
  { title: 'onboarding.slide1Title', body: 'onboarding.slide1Body', bot: 'idle' },
  { title: 'onboarding.slide2Title', body: 'onboarding.slide2Body', bot: 'downloading', progress: 1 },
  { title: 'onboarding.slide3Title', body: 'onboarding.slide3Body', bot: 'speaking' },
];

function Dot({ active }: { active: boolean }) {
  const { colors } = useAppTheme();
  const st = useAnimatedStyle(() => ({
    width: withSpring(active ? 26 : 8, motion.spring),
    opacity: withSpring(active ? 1 : 0.4, motion.spring),
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: active ? colors.accent : colors.textMuted }, st]} />;
}

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  // Read once: later step changes (pushing the language screen) must not re-redirect this screen.
  const [step] = useState(() => useSettingsStore.getState().onboardingStep);
  const setStep = useSettingsStore((s) => s.setOnboardingStep);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
    if (clamped === index) return;
    setDir(clamped > index ? 1 : -1);
    setIndex(clamped);
  };

  const toLanguage = () => {
    setStep('language');
    router.push('/onboarding/language');
  };

  // Swipe between slides. "Forward" follows the reading direction (right-to-left in Arabic).
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 40) return;
        const forward = I18nManager.isRTL ? g.dx > 0 : g.dx < 0;
        setDir(forward ? 1 : -1);
        setIndex((i) => Math.max(0, Math.min(SLIDES.length - 1, i + (forward ? 1 : -1))));
      },
    }),
  );

  // Resume where we were after the language step reloaded the app to flip RTL,
  // or after the app was killed mid-wizard: every step persists its position.
  if (step === 'language') return <Redirect href="/onboarding/language" />;
  if (step === 'goals') return <Redirect href="/onboarding/goals" />;
  if (step === 'profile') return <Redirect href="/onboarding/profile" />;
  if (step === 'recommend') return <Redirect href="/onboarding/recommend" />;
  if (step === 'path') return <Redirect href="/onboarding/path" />;
  if (step === 'permissions') return <Redirect href="/onboarding/permissions" />;
  if (step === 'personalize') return <Redirect href="/onboarding/personalize" />;
  if (step === 'summary') return <Redirect href="/onboarding/summary" />;

  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;
  // Content enters from the side the user swipes toward (mirrored in RTL).
  const fromEnd = (dir === 1) !== I18nManager.isRTL;
  const entering = (fromEnd ? SlideInRight : SlideInLeft).springify().damping(18).stiffness(160);

  return (
    <LookArea style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.topBar}>
        <Text style={[type.headline, { color: colors.text }]}>{t('appName')}</Text>
        {!last ? <Button title={t('onboarding.skip')} variant="ghost" compact onPress={toLanguage} /> : <View style={styles.skipSpacer} />}
      </View>
      {/* The same flow progress the later steps show (welcome is step 1 of N). */}
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${Math.round((1 / ONBOARDING_STEPS.length) * 100)}%`, backgroundColor: BRAND.cyan }]} />
      </View>

      <View style={styles.stage} {...pan.panHandlers}>
        <Animated.View key={`bot-${index}`} entering={FadeIn.duration(320)} exiting={FadeOut.duration(160)} style={styles.botWrap}>
          <RafeeqBot size={210} interactive state={slide.bot} progress={slide.progress ?? 0} />
        </Animated.View>
        <Animated.View key={`text-${index}`} entering={entering} style={styles.textBlock}>
          <Text style={[type.display, styles.center, { color: colors.text }]}>{t(slide.title)}</Text>
          <Text style={[type.body, styles.center, { color: colors.textMuted }]}>{t(slide.body)}</Text>
        </Animated.View>
      </View>

      <View style={styles.dots} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: SLIDES.length, now: index + 1 }}>
        {SLIDES.map((s, i) => (
          <Dot key={s.title} active={i === index} />
        ))}
      </View>

      <View style={styles.footer}>
        {index > 0 ? <Button title={t('onboarding.back')} onPress={() => go(index - 1)} style={styles.footerBtn} /> : null}
        <Button
          title={last ? t('onboarding.start') : t('onboarding.next')}
          variant="primary"
          onPress={() => (last ? toLanguage() : go(index + 1))}
          style={styles.footerBtnMain}
        />
      </View>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,127,127,0.25)',
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  trackFill: { height: '100%', borderRadius: radius.pill },
  skipSpacer: { height: 36 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  botWrap: { alignItems: 'center', justifyContent: 'center', height: 230 },
  textBlock: { gap: spacing.md, alignItems: 'center', paddingHorizontal: spacing.sm },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: spacing.xl },
  dot: { height: 8, borderRadius: radius.pill },
  footer: { flexDirection: 'row', gap: spacing.md },
  footerBtn: { flex: 1 },
  footerBtnMain: { flex: 2 },
});
