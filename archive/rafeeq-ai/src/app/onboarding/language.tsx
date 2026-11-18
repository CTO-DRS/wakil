// Copyright (c) 2026 DRS AI. All rights reserved.
import { reloadAppAsync } from 'expo';
import { useRouter } from 'expo-router';
import { Storage } from 'expo-sqlite/kv-store';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { LookArea } from '../../components/LookArea';
import { OnboardingShell } from '../../components/OnboardingShell';
import { Button, GlassSurface, PressableScale } from '../../components/ui';
import { applyLayoutDirection, initI18n, RTL_RELOAD_KEY } from '../../i18n';
import { useAppearanceStore } from '../../store/appearanceStore';
import { useSettingsStore } from '../../store/settingsStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../../theme';
import { THEMES, themeById } from '../../theme/themes';
import type { Language } from '../../types';

const OPTIONS: { value: Language; label: string; sample: string }[] = [
  { value: 'ar', label: 'العربية', sample: 'مرحبًا، أنا رفيق' },
  { value: 'en', label: 'English', sample: 'Hello, I am Rafeeq' },
];

function Check({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M6 12.5l4 4 8-9" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** A tiny live preview of a theme: background, card and accent swatches. */
function ThemeTile({ id, active }: { id: string; active: boolean }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const def = id === 'system' ? null : themeById(id);
  const palette = def ? def.palette : themeById('dark').palette;
  const dark = def ? def.dark : true;
  const label = def ? (isAr ? def.nameAr : def.name) : t('onboarding.systemTheme');
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: palette.background, borderColor: active ? BRAND.cyan : palette.border },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View style={[styles.tileCard, { backgroundColor: palette.surface }]}>
        <View style={[styles.tileDot, { backgroundColor: palette.primary }]} />
        <View style={[styles.tileLine, { backgroundColor: palette.accent }]} />
      </View>
      <Text style={[styles.tileLabel, { color: dark ? '#FFFFFF' : '#111827' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function LanguageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setStep = useSettingsStore((s) => s.setOnboardingStep);
  const themeId = useAppearanceStore((s) => s.themeId);
  const setTheme = useAppearanceStore((s) => s.setTheme);

  const choose = (lang: Language) => {
    if (lang === language) return;
    setLanguage(lang);
    initI18n(lang);
    if (applyLayoutDirection(lang)) {
      // Direction flips need a reload; resume on this screen afterwards.
      setStep('language');
      Storage.setItemSync(RTL_RELOAD_KEY, lang);
      void reloadAppAsync('language changed during onboarding');
    }
  };

  const next = () => {
    setStep('goals');
    router.push('/onboarding/goals');
  };

  return (
    <LookArea style={styles.root}>
      <OnboardingShell step="language">
        <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.languageTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.languageBody')}</Text>

        {OPTIONS.map((o, i) => {
          const selected = o.value === language;
          return (
            <Animated.View key={o.value} entering={FadeInDown.delay(i * 80).duration(360)}>
              <PressableScale
                onPress={() => choose(o.value)}
                hapticOnPress
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={o.label}
              >
                <GlassSurface style={[styles.option, selected && { borderColor: colors.primary, borderWidth: 1.5 }]} radiusSize={radius.xl}>
                  <View style={styles.flex}>
                    <Text style={[type.title, styles.auto, { color: colors.text }]}>{o.label}</Text>
                    <Text style={[type.callout, styles.auto, { color: colors.textMuted }]}>{o.sample}</Text>
                  </View>
                  <View style={[styles.radio, { borderColor: selected ? BRAND.cyan : colors.border, backgroundColor: selected ? BRAND.from : 'transparent' }]}>
                    {selected ? <Check color="#FFFFFF" /> : null}
                  </View>
                </GlassSurface>
              </PressableScale>
            </Animated.View>
          );
        })}

        <Text style={[type.title, styles.center, styles.section, { color: colors.text }]}>{t('onboarding.themeTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.themeBody')}</Text>

        <View style={styles.themeGrid}>
          {/* «system» first: it honors whatever the phone is set to. */}
          <PressableScale onPress={() => setTheme('system')} hapticOnPress>
            <ThemeTile id="system" active={themeId === 'system'} />
          </PressableScale>
          {THEMES.map((def) => (
            <PressableScale key={def.id} onPress={() => setTheme(def.id)} hapticOnPress>
              <ThemeTile id={def.id} active={themeId === def.id} />
            </PressableScale>
          ))}
        </View>
        <Text style={[type.caption, styles.center, { color: colors.textFaint }]}>{t('onboarding.customizeHint')}</Text>

        <Button title={t('onboarding.continue')} variant="primary" onPress={next} style={styles.cta} />
      </OnboardingShell>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  auto: { textAlign: 'auto' },
  section: { marginTop: spacing.lg },
  options: { gap: spacing.md },
  option: { flexDirection: 'row', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  radio: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
  },
  tile: {
    width: 104,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  tileCard: {
    height: 44,
    borderRadius: radius.sm,
    padding: spacing.xs,
    gap: 4,
  },
  tileDot: { width: 14, height: 14, borderRadius: 7 },
  tileLine: { width: 48, height: 6, borderRadius: 3, opacity: 0.8 },
  tileLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  cta: { marginTop: spacing.lg },
});
