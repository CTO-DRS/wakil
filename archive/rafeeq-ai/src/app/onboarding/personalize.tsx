// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { LookArea } from '../../components/LookArea';
import { OnboardingCard, OnboardingShell } from '../../components/OnboardingShell';
import { Button, Segmented } from '../../components/ui';
import type { AnswerStyle, TaskPreference } from '../../onboarding/profile';
import { permissionEntry, usePermissionStates } from '../../onboarding/permissions';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { spacing, type, useAppTheme } from '../../theme';
import { haptic } from '../../utils/haptics';

/**
 * Real personalization: every control here writes to the very store the rest
 * of the app reads — answer style feeds the chat system prompt, the two
 * reminder switches schedule actual local notifications. Nothing decorative,
 * nothing fake.
 */
export default function PersonalizeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const settings = useSettingsStore();
  const answerStyle = useProfileStore((s) => s.answerStyle);
  const preference = useProfileStore((s) => s.preference);
  // Lifecycle-aware: coming back from Android Settings re-reads the state.
  const { states, refresh } = usePermissionStates(['notifications']);
  const notificationsGranted = states?.notifications === 'granted';

  const grantNotifications = async () => {
    haptic.tap();
    const entry = permissionEntry('notifications');
    if (entry?.io.request) await entry.io.request().catch(() => null);
    await refresh();
  };

  const finish = () => {
    useSettingsStore.getState().setOnboardingStep('summary');
    router.push('/onboarding/summary');
  };

  return (
    <LookArea style={styles.root}>
      <OnboardingShell step="personalize">
        <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.persTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.persBody')}</Text>

        <OnboardingCard title={t('onboarding.persStyle')}>
          <Segmented
            value={answerStyle}
            onChange={(v) => {
              haptic.tap();
              useProfileStore.getState().setAnswerStyle(v as AnswerStyle);
            }}
            options={[
              { value: 'concise', label: t('onboarding.styleConcise') },
              { value: 'balanced', label: t('onboarding.styleBalanced') },
              { value: 'detailed', label: t('onboarding.styleDetailed') },
            ]}
          />
        </OnboardingCard>

        <OnboardingCard title={t('onboarding.persPreference')}>
          <Segmented
            value={preference ?? 'balance'}
            onChange={(v) => {
              haptic.tap();
              useProfileStore.getState().setPreference(v as TaskPreference);
            }}
            options={[
              { value: 'speed', label: t('onboarding.prefSpeed') },
              { value: 'balance', label: t('onboarding.prefBalance') },
              { value: 'accuracy', label: t('onboarding.prefAccuracy') },
            ]}
          />
        </OnboardingCard>

        <OnboardingCard>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={[type.label, { color: colors.text }]}>{t('onboarding.persVoice')}</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>{t('onboarding.persVoiceHint')}</Text>
            </View>
            <Switch
              value={settings.autoSpeak}
              onValueChange={settings.setAutoSpeak}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('onboarding.persVoice')}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={[type.label, { color: colors.text }]}>{t('onboarding.persMotion')}</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>{t('onboarding.persMotionHint')}</Text>
            </View>
            <Switch
              value={settings.animated}
              onValueChange={settings.setAnimated}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('onboarding.persMotion')}
            />
          </View>
        </OnboardingCard>

        <OnboardingCard>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={[type.label, { color: colors.text }]}>{t('onboarding.persBriefing')}</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>{t('onboarding.persBriefingHint')}</Text>
            </View>
            <Switch
              value={settings.briefingEnabled}
              onValueChange={settings.setBriefingEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('onboarding.persBriefing')}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={[type.label, { color: colors.text }]}>{t('onboarding.persBackup')}</Text>
              <Text style={[type.caption, { color: colors.textMuted }]}>{t('onboarding.persBackupHint')}</Text>
            </View>
            <Switch
              value={settings.backupReminder}
              onValueChange={settings.setBackupReminder}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
              accessibilityLabel={t('onboarding.persBackup')}
            />
          </View>
          {!notificationsGranted ? (
            <>
              <Text style={[type.caption, { color: colors.textMuted }]}>{t('onboarding.persNotificationsHint')}</Text>
              <Button
                title={t('permissions.request')}
                compact
                variant="secondary"
                onPress={() => void grantNotifications()}
              />
            </>
          ) : null}
        </OnboardingCard>

        <Button title={t('onboarding.continue')} variant="primary" onPress={finish} />
      </OnboardingShell>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  flex: { flex: 1 },
});
