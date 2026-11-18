// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The full Permissions Center: every permission Rafeeq's real features can
 * use — the onboarding core set plus the agent-tool permissions — each with
 * its status read from the OS, its reason, the feature that uses it, and the
 * exact system page that governs it. Nothing here is requested in bulk and
 * no state is faked: every chip mirrors the OS at render time, refreshed on
 * every foreground return.
 */

import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryGlyph } from '../components/LibraryIcons';
import { LookArea } from '../components/LookArea';
import { BackChevron, Button, PressableScale, ScreenHeader } from '../components/ui';
import { goBack } from '../navigation/goBack';
import { PERMISSION_ORDER, permissionEntry, usePermissionStates, type PermissionId, type PermissionState } from '../onboarding/permissions';
import { BRAND, radius, spacing, type, useAppTheme } from '../theme';
import { haptic } from '../utils/haptics';

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

function stateTone(s: PermissionState | undefined): 'success' | 'warning' | 'neutral' {
  return s === 'granted' ? 'success' : s === 'unavailable' ? 'neutral' : 'warning';
}

export default function PermissionsCenterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { states, refresh } = usePermissionStates(PERMISSION_ORDER);

  const act = async (id: PermissionId) => {
    haptic.tap();
    const entry = permissionEntry(id);
    if (!entry) return;
    if (entry.io.request) await entry.io.request().catch(() => null);
    else await entry.io.openPage().catch(() => undefined);
    await refresh();
  };

  return (
    <LookArea style={[styles.root, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <BackChevron color={colors.text} />
        </PressableScale>
        <ScreenHeader title={t('permissions.title')} subtitle={t('permissions.subtitle')} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[type.callout, { color: colors.textMuted }]}>{t('permissions.optionalNote')}</Text>

        {PERMISSION_ORDER.map((id, i) => {
          const entry = permissionEntry(id)!;
          const state = states?.[id];
          const canRequest = entry.io.request !== null;
          const blocked = state === 'blocked';
          return (
            <Animated.View key={`${id}-${states ? 's' : 'l'}`} entering={FadeInDown.delay(i * 40).duration(320)}>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.row}>
                  <CategoryGlyph icon={GLYPHS[id]} color={BRAND.cyan} size={26} />
                  <View style={styles.flex}>
                    <Text style={[type.headline, { color: colors.text }]}>{t(entry.nameKey)}</Text>
                    <Text style={[type.caption, { color: colors.textMuted }]}>{t(entry.featureKey)}</Text>
                  </View>
                  <View style={styles.stateWrap}>
                    <View style={[styles.stateDot, { backgroundColor: stateTone(state) === 'success' ? colors.success : stateTone(state) === 'neutral' ? colors.textFaint : colors.warning }]} />
                    <Text style={[type.caption, { color: colors.textMuted }]}>
                      {state ? t(`permissions.state.${state}`) : '…'}
                    </Text>
                  </View>
                </View>
                <Text style={[type.body, { color: colors.textMuted }]}>{t(entry.whyKey)}</Text>
                {state === 'granted' ? null : (
                  <View style={styles.actions}>
                    {canRequest && !blocked ? (
                      <Button title={t('permissions.request')} compact variant="primary" onPress={() => void act(id)} />
                    ) : (
                      <Button title={t('permissions.openSettings')} compact variant="secondary" onPress={() => void act(id)} />
                    )}
                    {blocked ? (
                      <Text style={[type.caption, styles.help, { color: colors.textMuted }]}>{t('permissions.blockedHelp')}</Text>
                    ) : !canRequest ? (
                      <Text style={[type.caption, styles.help, { color: colors.textMuted }]}>{t('permissions.specialHelp')}</Text>
                    ) : null}
                  </View>
                )}
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  content: { gap: spacing.md, paddingTop: spacing.md },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  stateWrap: { alignItems: 'flex-end', gap: 4 },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  help: { flex: 1, minWidth: 160 },
});
