// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * One library model's detail page. Data comes from the pure registry; the
 * action area stays honest by construction — integrated entries get real
 * buttons wired to the same model/voice stores the Models tab uses, while
 * catalog entries plainly state they are documentation-only and offer the
 * official page. No invented runtimes, no fake progress.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BackChevron, Card, Button, PressableScale, SectionTitle, StatusChip } from '../../components/ui';
import { CategoryGlyph } from '../../components/LibraryIcons';
import { CATALOG, VOICE_MODELS } from '../../models/catalog';
import { libraryCategory } from '../../models/library/categories';
import { libraryModel } from '../../models/library/search';
import type { LibraryModel } from '../../models/library/types';
import { goBack } from '../../navigation/goBack';
import { notify } from '../../store/dialogStore';
import { useModelStore } from '../../store/modelStore';
import { useSettingsStore } from '../../store/settingsStore';
import { haptic } from '../../utils/haptics';
import { spacing, type as typeScale, useAppTheme } from '../../theme';
import { formatBytes } from '../../utils/format';

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.factRow}>
      <Text style={[typeScale.caption, styles.auto, { color: colors.textFaint, width: 108 }]}>{label}</Text>
      <Text style={[typeScale.callout, styles.auto, styles.factValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

/** Bulleted feature list — every bullet is that model's own, no boilerplate. */
function Features({ model }: { model: LibraryModel }) {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const list = i18n.language === 'ar' ? model.features.ar : model.features.en;
  if (list.length === 0) return null;
  return (
    <Card>
      <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>{t('library.features')}</Text>
      {list.map((f) => (
        <View key={f} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
          <Text style={[typeScale.callout, styles.auto, styles.bulletText, { color: colors.textMuted }]}>{f}</Text>
        </View>
      ))}
    </Card>
  );
}

/** The honest action area: real buttons for integrated entries, a plain statement otherwise. */
function ActionArea({ model }: { model: LibraryModel }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const fileState = useModelStore((s) => s.files);
  const startDownload = useModelStore((s) => s.startDownload);
  const setSelectedModelId = useSettingsStore((s) => s.setSelectedModelId);
  const setSelectedVoiceModelId = useSettingsStore((s) => s.setSelectedVoiceModelId);

  const ref = model.integratedRef ?? null;
  const dl = ref ? fileState[ref] : undefined;
  const isDownloaded = dl?.status === 'downloaded';
  const isBusy = dl?.status === 'downloading' || dl?.status === 'paused';

  const beginDownload = () => {
    if (!ref) return;
    try {
      startDownload(ref);
      router.push('/models');
    } catch (e) {
      notify(t('library.diskErrorTitle'), e instanceof Error ? e.message : String(e));
    }
  };

  if (model.availability !== 'integrated') {
    return (
      <Card>
        <Text style={[typeScale.bodyStrong, styles.auto, { color: colors.text }]}>{t('library.catalogBannerTitle')}</Text>
        <Text style={[typeScale.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>
          {t('library.catalogBannerBody')}
        </Text>
        <View style={[styles.actions, { marginTop: spacing.md }]}>
          <Button
            title={t('library.officialPage')}
            variant="secondary"
            compact
            onPress={() => {
              haptic.tap();
              void Linking.openURL(model.url);
            }}
          />
        </View>
      </Card>
    );
  }

  if (model.kind === 'builtin') {
    return (
      <Card>
        <StatusChip label={t('library.builtinReady')} tone="success" />
        <Text style={[typeScale.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]}>
          {t('library.tryHintBuiltin')}
        </Text>
        <View style={[styles.actions, { marginTop: spacing.md }]}>
          <Button
            title={t('library.tryBuiltin')}
            variant="primary"
            compact
            onPress={() => {
              haptic.tap();
              router.push('/');
            }}
          />
        </View>
      </Card>
    );
  }

  if (!ref) return null;

  const isVoice = model.kind === 'voice';
  const hint = isVoice ? t('library.tryHintVoice') : t('library.tryHintLlm');

  const tryIt = () => {
    haptic.tap();
    if (isVoice) {
      setSelectedVoiceModelId(ref);
    } else {
      setSelectedModelId(ref);
    }
    router.push('/');
  };

  return (
    <Card>
      <StatusChip
        label={isDownloaded ? t('library.downloaded') : isBusy ? t('library.downloading') : t('library.notDownloaded')}
        tone={isDownloaded ? 'success' : isBusy ? 'warning' : 'neutral'}
      />
      <Text style={[typeScale.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]}>{hint}</Text>
      <View style={[styles.actions, { marginTop: spacing.md }]}>
        {isDownloaded ? (
          <Button title={isVoice ? t('library.tryVoiceSelect') : t('library.tryLlm')} variant="primary" compact onPress={tryIt} />
        ) : isBusy ? (
          <Button title={t('library.watchDownload')} variant="secondary" compact onPress={() => router.push('/models')} />
        ) : (
          <Button title={isVoice ? t('library.tryVoiceDownload') : t('library.tryLlmDownload')} variant="primary" compact onPress={beginDownload} />
        )}
        <Button
          title={t('library.officialPage')}
          variant="ghost"
          compact
          onPress={() => {
            haptic.tap();
            void Linking.openURL(model.url);
          }}
        />
      </View>
    </Card>
  );
}

export default function LibraryModelScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const model = typeof id === 'string' ? libraryModel(id) : null;

  if (!model) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
            <BackChevron color={colors.text} />
          </PressableScale>
          <Text style={[typeScale.title, styles.auto, styles.headerTitle, { color: colors.text }]}>
            {t('library.title')}
          </Text>
        </View>
        <View style={styles.content}>
          <Card>
            <Text style={[typeScale.bodyStrong, styles.auto, { color: colors.text }]}>{t('library.emptyTitle')}</Text>
          </Card>
        </View>
      </View>
    );
  }

  const cat = libraryCategory(model.categoryId);
  const isAr = i18n.language === 'ar';
  const downloadable = [...CATALOG, ...VOICE_MODELS].find((c) => c.id === model.integratedRef);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <BackChevron color={colors.text} />
        </PressableScale>
        <Text style={[typeScale.title, styles.auto, styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {model.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Animated.View entering={FadeInDown.duration(280)}>
          <Card>
            <View style={styles.heroRow}>
              <CategoryGlyph icon={cat?.icon ?? 'chat'} color={colors.primary} size={40} />
              <View style={styles.heroText}>
                <Text style={[typeScale.headline, styles.auto, { color: colors.text }]}>{model.name}</Text>
                <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>
                  {isAr && cat ? cat.name.ar : cat?.name.en}
                  {` · ${model.developer}`}
                </Text>
              </View>
              <StatusChip
                label={model.availability === 'integrated' ? t('library.integrated') : t('library.catalog')}
                tone={model.availability === 'integrated' ? 'success' : 'neutral'}
              />
            </View>
            <Text style={[typeScale.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.md }]}>
              {isAr ? model.desc.ar : model.desc.en}
            </Text>
          </Card>

          <ActionArea model={model} />

          <Card>
            <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>{t('library.facts')}</Text>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              <Row label={t('library.developer')} value={model.developer} />
              <Row label={t('library.ioIn')} value={model.io.in} />
              <Row label={t('library.ioOut')} value={model.io.out} />
              {model.params ? <Row label={t('library.params')} value={model.params} /> : null}
              {model.quant ? <Row label={t('library.quant')} value={model.quant} /> : null}
              {model.sizeBytes ? <Row label={t('library.size')} value={formatBytes(model.sizeBytes)} /> : null}
              {downloadable?.url ? <Row label={t('library.source')} value="Hugging Face" /> : null}
              <Row label={t('library.license')} value={model.license ?? t('library.licenseUnknown')} />
            </View>
          </Card>

          <Features model={model} />

          {(
            [
              ['library.requirements', model.requirements],
              ['library.quality', model.quality],
              ['library.limits', model.limits],
              ['library.cost', model.cost],
            ] as const
          ).map(([key, value]) => (
            <Card key={key}>
              <Text style={[typeScale.label, styles.auto, { color: colors.text }]}>{t(key)}</Text>
              <Text style={[typeScale.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>
                {isAr ? value.ar : value.en}
              </Text>
            </Card>
          ))}

          <SectionTitle>{t('library.poweredBy')}</SectionTitle>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  auto: { textAlign: 'auto' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  factRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  factValue: { flex: 1 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1 },
});
