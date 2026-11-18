// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LookArea } from '../../components/LookArea';
import { OnboardingCard, OnboardingShell } from '../../components/OnboardingShell';
import { Button, Segmented, StatusChip } from '../../components/ui';
import { followUpQuestions, type AnswerStyle, type ExperienceLevel, type ModelWeight, type TaskPreference } from '../../onboarding/profile';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { radius, spacing, type, useAppTheme } from '../../theme';
import { haptic } from '../../utils/haptics';

/**
 * One question at a time — the next one only appears after the previous is
 * answered, and the set itself depends on the goals picked earlier (chat-only
 * users are never asked about advanced models).
 */
export default function ProfilingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const goals = useProfileStore((s) => s.goals);
  const experience = useProfileStore((s) => s.experience);
  const preference = useProfileStore((s) => s.preference);
  const answerStyle = useProfileStore((s) => s.answerStyle);
  const modelWeight = useProfileStore((s) => s.modelWeight);

  const questions = useMemo(() => followUpQuestions(goals), [goals]);
  const [revealed, setRevealed] = useState(() => {
    // Resume: everything already answered stays answered; reveal up to the
    // first unanswered question.
    const store = useProfileStore.getState();
    let n = 0;
    for (const q of questions) {
      const answered =
        (q.id === 'experience' && store.experience !== null) ||
        (q.id === 'preference' && store.preference !== null) ||
        q.id === 'answerStyle';
      if (!answered) break;
      n += 1;
    }
    return Math.max(0, Math.min(n, questions.length));
  });

  const advance = () => {
    // Advancing the persisted flow step happens here so an app kill on the
    // recommendation screen resumes there.
    useSettingsStore.getState().setOnboardingStep('recommend');
  };

  const next = () => {
    useProfileStore.getState().markProfileComplete();
    advance();
    router.push('/onboarding/recommend');
  };

  const skip = () => {
    // Skipping leaves unanswered slots at their defaults — no fake answers.
    useProfileStore.getState().markProfileComplete();
    advance();
    router.push('/onboarding/recommend');
  };

  const visible = questions.slice(0, revealed + 1);
  const done = revealed >= questions.length;

  return (
    <LookArea style={styles.root}>
      <OnboardingShell step="profile" onSkip={skip} skipLabel={t('onboarding.skip')}>
        <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.profileTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.profileBody')}</Text>
        <View style={styles.rowCenter}>
          <StatusChip tone="accent" label={t('onboarding.profileStep', { current: Math.min(revealed + 1, questions.length), total: questions.length })} />
          <StatusChip tone="neutral" label={t('onboarding.offlineFact')} dot={false} />
        </View>

        {visible.map((q, i) => {
          if (q.id === 'experience') {
            return (
              <OnboardingCard key={q.id} title={t('onboarding.qExperience')} enteringDelay={i * 60}>
                <Segmented
                  value={experience ?? ''}
                  onChange={(v) => {
                    haptic.tap();
                    useProfileStore.getState().setExperience(v as ExperienceLevel);
                    setRevealed((r) => Math.max(r, i + 1));
                  }}
                  options={[
                    { value: 'beginner', label: t('onboarding.expBeginner') },
                    { value: 'intermediate', label: t('onboarding.expIntermediate') },
                    { value: 'pro', label: t('onboarding.expPro') },
                  ]}
                />
                <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
                  {experience === 'beginner'
                    ? t('onboarding.expBeginnerHint')
                    : experience === 'intermediate'
                      ? t('onboarding.expIntermediateHint')
                      : experience === 'pro'
                        ? t('onboarding.expProHint')
                        : ''}
                </Text>
              </OnboardingCard>
            );
          }
          if (q.id === 'preference') {
            return (
              <OnboardingCard key={q.id} title={t('onboarding.qPreference')} enteringDelay={i * 60}>
                <Segmented
                  value={preference ?? ''}
                  onChange={(v) => {
                    haptic.tap();
                    useProfileStore.getState().setPreference(v as TaskPreference);
                    setRevealed((r) => Math.max(r, i + 1));
                  }}
                  options={[
                    { value: 'speed', label: t('onboarding.prefSpeed') },
                    { value: 'balance', label: t('onboarding.prefBalance') },
                    { value: 'accuracy', label: t('onboarding.prefAccuracy') },
                  ]}
                />
                <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
                  {preference === 'speed'
                    ? t('onboarding.prefSpeedHint')
                    : preference === 'accuracy'
                      ? t('onboarding.prefAccuracyHint')
                      : preference === 'balance'
                        ? t('onboarding.prefBalanceHint')
                        : ''}
                </Text>
              </OnboardingCard>
            );
          }
          if (q.id === 'answerStyle') {
            return (
              <OnboardingCard key={q.id} title={t('onboarding.qAnswerStyle')} enteringDelay={i * 60}>
                <Segmented
                  value={answerStyle}
                  onChange={(v) => {
                    haptic.tap();
                    useProfileStore.getState().setAnswerStyle(v as AnswerStyle);
                    setRevealed((r) => Math.max(r, i + 1));
                  }}
                  options={[
                    { value: 'concise', label: t('onboarding.styleConcise') },
                    { value: 'balanced', label: t('onboarding.styleBalanced') },
                    { value: 'detailed', label: t('onboarding.styleDetailed') },
                  ]}
                />
                <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
                  {answerStyle === 'concise'
                    ? t('onboarding.styleConciseHint')
                    : answerStyle === 'detailed'
                      ? t('onboarding.styleDetailedHint')
                      : t('onboarding.styleBalancedHint')}
                </Text>
              </OnboardingCard>
            );
          }
          return (
            <OnboardingCard key={q.id} title={t('onboarding.qModelWeight')} enteringDelay={i * 60}>
              <Segmented
                value={modelWeight === 'auto' ? '' : modelWeight}
                onChange={(v) => {
                  haptic.tap();
                  useProfileStore.getState().setModelWeight(v as ModelWeight);
                  setRevealed((r) => Math.max(r, i + 1));
                }}
                options={[
                  { value: 'light', label: t('onboarding.weightLight') },
                  { value: 'advanced', label: t('onboarding.weightAdvanced') },
                ]}
              />
              <Text style={[type.caption, styles.center, { color: colors.textMuted }]}>
                {modelWeight === 'light' ? t('onboarding.weightLightHint') : t('onboarding.weightAdvancedHint')}
              </Text>
            </OnboardingCard>
          );
        })}

        {done ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Button title={t('onboarding.continue')} variant="primary" onPress={next} />
          </Animated.View>
        ) : null}
      </OnboardingShell>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { textAlign: 'center' },
  rowCenter: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  hint: { borderRadius: radius.md },
});
