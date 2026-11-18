// Copyright (c) 2026 DRS AI. All rights reserved.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { LookArea } from '../../components/LookArea';
import { OnboardingCard, OnboardingShell } from '../../components/OnboardingShell';
import { CategoryGlyph } from '../../components/LibraryIcons';
import { Button, StatusChip } from '../../components/ui';
import {
  CORE_PERMISSION_IDS,
  permissionEntry,
  usePermissionStates,
  type PermissionId,
  type PermissionState,
} from '../../onboarding/permissions';
import { useSettingsStore } from '../../store/settingsStore';
import { BRAND, spacing, type, useAppTheme } from '../../theme';
import { haptic } from '../../utils/haptics';

/** Glyph per permission id (LibraryIcons renderers). */
const GLYPHS: Record<PermissionId, string> = {
  notifications: 'bell',
  microphone: 'mic',
  location: 'location',
  biometric: 'finger',
  contacts: 'contacts',
  calendar: 'calendar',
  callPhone: 'phone',
  dndPolicy: 'moon',
  writeSettings: 'gear',
};

export default function OnboardingPermissionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { states, refresh } = usePermissionStates(CORE_PERMISSION_IDS);
  // Bump forces a re-render after each request so chips stay honest.
  const [nonce, setNonce] = useState(0);

  const ask = async (id: PermissionId) => {
    haptic.tap();
    const entry = permissionEntry(id);
    if (!entry) return;
    if (entry.io.request) {
      await entry.io.request().catch(() => null);
    } else {
      await entry.io.openPage().catch(() => undefined);
    }
    await refresh();
    setNonce((n) => n + 1);
  };

  const openPage = async (id: PermissionId) => {
    haptic.tap();
    const entry = permissionEntry(id);
    await entry?.io.openPage().catch(() => undefined);
    await refresh();
    setNonce((n) => n + 1);
  };

  const next = () => {
    useSettingsStore.getState().setOnboardingStep('personalize');
    router.push('/onboarding/personalize');
  };

  const stateTone = (s: PermissionState | undefined): 'success' | 'warning' | 'neutral' =>
    s === 'granted' ? 'success' : s === 'unavailable' ? 'neutral' : 'warning';

  return (
    <LookArea style={styles.root}>
      <OnboardingShell step="permissions" onSkip={next} skipLabel={t('onboarding.permSkip')}>
        <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.permTitle')}</Text>
        <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.permBody')}</Text>

        {CORE_PERMISSION_IDS.map((id, i) => {
          const entry = permissionEntry(id)!;
          const state = states?.[id];
          return (
            <OnboardingCard key={`${id}-${nonce}`} enteringDelay={i * 60}>
              <View style={styles.row}>
                <CategoryGlyph icon={GLYPHS[id]} color={BRAND.cyan} size={26} />
                <View style={styles.flex}>
                  <Text style={[type.headline, { color: colors.text }]}>{t(entry.nameKey)}</Text>
                  <Text style={[type.caption, { color: colors.textMuted }]}>{t(entry.featureKey)}</Text>
                </View>
                <StatusChip tone={stateTone(state)} label={state ? t(`permissions.state.${state}`) : '…'} />
              </View>
              <Text style={[type.body, { color: colors.textMuted }]}>{t(entry.whyKey)}</Text>
              <View style={styles.actions}>
                {state === 'granted' || state === 'unavailable' ? null : entry.io.request && state !== 'blocked' ? (
                  <Button title={t('permissions.request')} compact variant="primary" onPress={() => void ask(id)} />
                ) : (
                  <Button title={t('permissions.openSettings')} compact variant="secondary" onPress={() => void openPage(id)} />
                )}
                {state === 'blocked' ? (
                  <Text style={[type.caption, styles.help, { color: colors.textMuted }]}>{t('permissions.blockedHelp')}</Text>
                ) : null}
              </View>
            </OnboardingCard>
          );
        })}

        <Button title={t('onboarding.continue')} variant="primary" onPress={next} />
      </OnboardingShell>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  help: { flex: 1, minWidth: 160 },
});
