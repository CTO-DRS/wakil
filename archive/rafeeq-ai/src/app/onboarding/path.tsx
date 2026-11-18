// Copyright (c) 2026 DRS AI. All rights reserved.
import { Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LookArea } from '../../components/LookArea';
import { RafeeqBot } from '../../components/RafeeqBot';
import { Badge, Button, PressableScale, StatusChip } from '../../components/ui';
import { availableRamBytes } from '../../hooks/useModelLoader';
import { CATALOG } from '../../models/catalog';
import { checkRam, estimateRuntimeBytes, hasDiskSpace } from '../../models/resources';
import { notify } from '../../store/dialogStore';
import { useModelStore } from '../../store/modelStore';
import { useProfileStore } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import { BRAND, radius, spacing, type, useAppTheme } from '../../theme';
import { formatApproxBytes, formatBytes } from '../../utils/format';
import { haptic } from '../../utils/haptics';

function freeDisk(): number | null {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}

/**
 * The model step of the onboarding: every integrated chat model, sized and
 * RAM-checked against this device, with the engine's recommendation marked.
 * Choosing one starts the real download and records the default — but the
 * wizard keeps going: permissions, personalization and the summary come after.
 */
export default function PathScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const nCtx = useSettingsStore((s) => s.contextSize);
  const [ram] = useState(() => availableRamBytes());
  const [disk] = useState(() => freeDisk());
  const recommendedId = useProfileStore((s) => s.recommendation?.modelId ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(recommendedId);

  const models = CATALOG.filter((m) => m.source === 'catalog').sort((a, b) => a.sizeBytes - b.sizeBytes);

  const choose = (id: string) => {
    haptic.tap();
    setSelectedId(id);
  };

  const downloadAndContinue = () => {
    const settings = useSettingsStore.getState();
    if (!selectedId) return;
    const model = useModelStore.getState().getModel(selectedId);
    if (!model) return;
    if (!hasDiskSpace(model.sizeBytes, disk)) {
      notify(
        t('models.download'),
        t('models.notEnoughDisk', { needed: formatBytes(model.sizeBytes), available: formatBytes(disk ?? 0) }),
        t('common.ok'),
      );
      return;
    }
    const status = useModelStore.getState().fileState(selectedId).status;
    if (status === 'idle' || status === 'error') useModelStore.getState().startDownload(selectedId);
    else if (status === 'paused') useModelStore.getState().resumeDownload(selectedId);
    settings.setSelectedModelId(selectedId);
    haptic.success();
    useSettingsStore.getState().setOnboardingStep('permissions');
    router.push('/onboarding/permissions');
  };

  const skip = () => {
    useSettingsStore.getState().setOnboardingStep('permissions');
    router.push('/onboarding/permissions');
  };

  return (
    <LookArea style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.head}>
          <RafeeqBot size={96} interactive />
          <Text style={[type.title, styles.center, { color: colors.text }]}>{t('onboarding.pathTitle')}</Text>
          <Text style={[type.callout, styles.center, { color: colors.textMuted }]}>{t('onboarding.pathBody')}</Text>
          <StatusChip
            tone="accent"
            label={ram ? t('onboarding.freeRam', { value: formatBytes(ram) }) : t('onboarding.freeRamUnknown')}
          />
        </View>

        {models.map((m, i) => {
          const active = selectedId === m.id;
          const ramVerdict = checkRam(m.sizeBytes, nCtx, ram).verdict;
          const isRecommended = recommendedId === m.id;
          return (
            <Animated.View key={m.id} entering={FadeInDown.delay(80 + i * 70).duration(360)}>
              <PressableScale
                onPress={() => choose(m.id)}
                hapticOnPress={false}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={m.name}
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
                  <View style={styles.cardHead}>
                    <Text style={[type.headline, styles.flex, { color: colors.text }]}>{m.name}</Text>
                    {isRecommended ? <StatusChip tone="success" label={t('onboarding.recommended')} /> : null}
                  </View>
                  <View style={styles.badges}>
                    <Badge label={t('onboarding.size', { value: formatApproxBytes(m.sizeBytes) })} />
                    <Badge label={t('onboarding.ram', { value: formatApproxBytes(estimateRuntimeBytes(m.sizeBytes, nCtx)) })} />
                    <Badge label={`${m.params} · ${m.quant}`} />
                  </View>
                  <Text style={[type.caption, { color: ramVerdict === 'insufficient' ? colors.warning : colors.textFaint }]}>
                    {ramVerdict === 'unknown'
                      ? t('onboarding.freeRamUnknown')
                      : ramVerdict === 'insufficient'
                        ? t('onboarding.reason.ramDowngrade')
                        : m.license}
                  </Text>
                  {active ? <View style={[styles.activeBar, { backgroundColor: BRAND.cyan }]} /> : null}
                </View>
              </PressableScale>
            </Animated.View>
          );
        })}

        <Button
          title={t('onboarding.download')}
          variant="primary"
          onPress={downloadAndContinue}
          disabled={!selectedId}
          style={styles.cta}
        />
        <Button title={t('onboarding.skipLater')} variant="ghost" onPress={skip} />
      </ScrollView>
    </LookArea>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  head: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  card: { padding: spacing.lg, gap: spacing.xs, borderRadius: radius.xl, borderWidth: 1.5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  activeBar: { position: 'absolute', top: spacing.lg, bottom: spacing.lg, start: 0, width: 3, borderRadius: 2 },
  cta: { marginTop: spacing.md },
});
