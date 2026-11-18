// Copyright (c) 2026 DRS AI. All rights reserved.
import type { TFunction } from 'i18next';
import * as DocumentPicker from 'expo-document-picker';
import { Paths } from 'expo-file-system';
import { useRouter, usePathname, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';

import { Badge, Button, Card, PressableScale, ProgressRing, ScreenHeader, SectionTitle, StatusChip, type StatusTone } from '../../components/ui';
import { CategoryGlyph } from '../../components/LibraryIcons';
import { dialogIcons } from '../../components/DialogIcons';
import { UsageStats } from '../../components/UsageStats';
import { availableRamBytes, useModelLoader } from '../../hooks/useModelLoader';
import { useTabBarSpace } from '../../hooks/useTabBarSpace';
import { batchDeleteCount, planBatchDelete } from '../../models/batchDelete';
import { applyModelFilter, MODEL_FILTERS, type ModelFilterId } from '../../models/filter';
import { CATALOG, VOICE_MODELS, VOICE_MODEL_ID } from '../../models/catalog';
import { LIBRARY_CATEGORIES } from '../../models/library/categories';
import { categoryModelCounts, searchLibraryModels } from '../../models/library/search';
import { estimateRuntimeBytes, hasDiskSpace } from '../../models/resources';
import { etaParts, etaSeconds, speedParts } from '../../models/speed';
import { useChatStore } from '../../store/chatStore';
import { useDownloadCelebrateStore } from '../../store/downloadCelebrate';
import { useLlmStore } from '../../store/llmStore';
import { notify, showDialog } from '../../store/dialogStore';
import { useModelHistoryStore, type ModelEvent, type ModelEventKind } from '../../store/modelHistoryStore';
import { EMPTY_FILE_STATE, useModelStore } from '../../store/modelStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useVoiceStore } from '../../store/voiceStore';
import { radius, spacing, type, useAppTheme } from '../../theme';
import type { ModelInfo } from '../../types';
import { formatBytes, progressRatio } from '../../utils/format';
import { haptic } from '../../utils/haptics';

function freeDisk(): number | null {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}

/** Known download error codes get friendly, translated text; anything else shows raw. */
function downloadErrorText(code: string, t: TFunction): string {
  if (code === 'SHA256_MISMATCH') return t('models.integrityFailed');
  return t('models.failed', { message: code });
}

/** "12.3 MB/s · 4m 05s left" while bytes flow; null when there is nothing to show yet. */
function speedLine(written: number, total: number, bps: number | undefined, t: TFunction): string | null {
  if (!bps || bps <= 0 || (total > 0 && written >= total)) return null;
  const sp = speedParts(bps);
  const speed = t(sp.unit === 'MB' ? 'models.speedUnitMB' : 'models.speedUnitKB', { value: sp.value });
  const eta = etaSeconds(written, total, bps);
  if (eta === null) return t('models.speedOnly', { speed });
  const e = etaParts(eta);
  const time = e.kind === 'h' ? t('models.etaH', { h: e.h, m: e.m }) : e.kind === 'm' ? t('models.etaM', { m: e.m, s: e.s }) : t('models.etaS', { s: e.s });
  return t('models.speedEta', { speed, time });
}

function StatusGlyph({ kind, color }: { kind: 'done' | 'idle' | 'error'; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      {kind === 'done' ? (
        <Path d="M6 12.5l4 4 8-9" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : kind === 'error' ? (
        <Path d="M12 7v6M12 17h.01" stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      ) : (
        <Path d="M12 5v10M7.5 11L12 15.5L16.5 11M6 19h12" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
    </Svg>
  );
}

/** How many log rows show before the "show all" toggle kicks in. */
const HISTORY_PREVIEW = 4;

type StorageBannerState = { supported: boolean; granted: boolean } | null;

/**
 * One-time "All files access" invite: with the grant, model files move into the
 * shared Download/Rafeeq folder and survive app updates, reinstalling the app
 * and device cleaners. Refreshes on focus — the user comes back from the
 * Android Settings screen through here.
 */
function StorageBanner() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<StorageBannerState>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // Lazy require keeps expo-file-system and the native module out of tests.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { refreshStatus } = require('../../models/publicStorage') as typeof import('../../models/publicStorage');
      refreshStatus()
        .then((st: { supported: boolean; granted: boolean }) => {
          if (alive) setStatus({ supported: st.supported, granted: st.granted });
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );
  if (!status || !status.supported || status.granted) return null;
  const enable = async () => {
    haptic.tap();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openAllFilesAccessSettings } = require('../../models/publicStorage') as typeof import('../../models/publicStorage');
    await openAllFilesAccessSettings();
  };
  return (
    <Card>
      <Text style={[type.headline, styles.auto, { color: colors.text }]}>{t('models.storageBannerTitle')}</Text>
      <Text style={[type.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>{t('models.storageBannerBody')}</Text>
      <View style={styles.actions}>
        <Button title={t('models.storageBannerEnable')} variant="primary" compact onPress={() => void enable()} />
      </View>
    </Card>
  );
}

/** The success chip shown once models are protected in the shared folder. */
function StorageProtectedChip() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<StorageBannerState>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { refreshStatus } = require('../../models/publicStorage') as typeof import('../../models/publicStorage');
      refreshStatus()
        .then((st: { supported: boolean; granted: boolean }) => {
          if (alive) setStatus({ supported: st.supported, granted: st.granted });
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []),
  );
  if (!status || !status.supported || !status.granted) return null;
  return <StatusChip tone="success" label={t('models.storageProtected')} />;
}

/** Locale-aware "when" line for a log row; falls back to ISO on odd locales. */
function formatWhen(ms: number, language: string): string {
  try {
    return new Date(ms).toLocaleString(language === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return new Date(ms).toISOString();
  }
}

/** Glyph per event kind: download arrow, plus for added customs, trash for deletions. */
function historyGlyph(kind: ModelEventKind) {
  return kind === 'download' ? dialogIcons.download : kind === 'added' ? dialogIcons.plus : dialogIcons.trash;
}

function historyTone(kind: ModelEventKind): 'success' | 'accent' | 'danger' {
  return kind === 'download' ? 'success' : kind === 'added' ? 'accent' : 'danger';
}

function HistoryRow({ event }: { event: ModelEvent }) {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const kindLabel = t(
    event.kind === 'download' ? 'models.eventDownload' : event.kind === 'added' ? 'models.eventAdded' : 'models.eventDeleted',
  );
  const tone = historyTone(event.kind);
  const kindColor = tone === 'success' ? colors.success : tone === 'accent' ? colors.accent : colors.danger;
  const meta = [event.build, event.sizeBytes > 0 ? formatBytes(event.sizeBytes) : null, formatWhen(event.at, i18n.language)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.historyRow}>
      <View style={[styles.historyGlyph, { backgroundColor: kindColor + '1A' }]}>{historyGlyph(event.kind)(kindColor, 15)}</View>
      <View style={styles.historyText}>
        <Text numberOfLines={1} style={[type.body, styles.auto, { color: colors.text }]}>
          {event.modelName}
        </Text>
        <Text numberOfLines={1} style={[type.caption, styles.auto, { color: colors.textMuted }]}>
          {kindLabel} · {meta}
        </Text>
      </View>
    </View>
  );
}

/** The on-device download & version log, capped to the newest MODEL_HISTORY_CAP events. */
function HistorySection() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const events = useModelHistoryStore(useShallow((s) => s.events));
  const clear = useModelHistoryStore((s) => s.clear);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, HISTORY_PREVIEW);

  const confirmClear = () =>
    showDialog({
      title: t('models.historyClearTitle'),
      message: t('models.historyClearBody'),
      actions: [
        { label: t('common.cancel'), cancel: true },
        { label: t('common.delete'), icon: dialogIcons.trash, destructive: true, onPress: () => clear() },
      ],
    });

  return (
    <>
      <SectionTitle>{t('models.history')}</SectionTitle>
      <Card>
        {events.length === 0 ? (
          <Text style={[type.callout, styles.auto, { color: colors.textMuted }]}>{t('models.historyEmpty')}</Text>
        ) : (
          <View style={styles.historyBody}>
            {visible.map((e) => (
              <HistoryRow key={e.id} event={e} />
            ))}
            {events.length > HISTORY_PREVIEW ? (
              <Button
                title={expanded ? t('models.showLess') : t('models.showAll', { n: events.length })}
                variant="ghost"
                compact
                onPress={() => setExpanded((v) => !v)}
              />
            ) : null}
            <Button title={t('models.clearHistory')} variant="danger" compact onPress={confirmClear} />
          </View>
        )}
      </Card>
    </>
  );
}

function SelectionCircle({ selected, color }: { selected: boolean; color: string }) {
  return (
    <View
      style={[
        styles.selectCircle,
        { borderColor: selected ? color : undefined, backgroundColor: selected ? color : 'transparent' },
      ]}
    >
      {selected ? (
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path d="M5 13l4 4 10-11" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      ) : null}
    </View>
  );
}

function ModelCard({
  model,
  index,
  selectMode,
  selected,
  onToggleSelect,
}: {
  model: ModelInfo;
  index: number;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const file = useModelStore((s) => s.files[model.id] ?? EMPTY_FILE_STATE);
  const store = useModelStore.getState();
  const loadedModelId = useLlmStore((s) => s.loadedModelId);
  const llmStatus = useLlmStore((s) => s.status);
  const release = useLlmStore((s) => s.release);
  const nCtx = useSettingsStore((s) => s.contextSize);
  const micVoiceId = useSettingsStore((s) => s.selectedVoiceModelId ?? VOICE_MODEL_ID);
  const loadWithChecks = useModelLoader();
  // Voice models feed whisper.rn, not the LLM engine: no "Use"/RAM-estimate affordances.
  const isVoice = model.source === 'voice';

  const total = file.totalBytes || model.sizeBytes;
  const ratio = progressRatio(file.bytesWritten, total);
  const pct = Math.round(ratio * 100);
  const inUse = !isVoice && loadedModelId === model.id && llmStatus === 'ready';
  const description = model.description
    ? t(model.description)
    : isVoice
      ? t('models.importedVoiceDesc')
      : t('models.customDesc');

  const status: { label: string; tone: StatusTone } = inUse
    ? { label: t('models.inUse'), tone: 'accent' }
    : file.status === 'downloaded'
      ? { label: t('models.downloaded'), tone: 'success' }
      : file.status === 'downloading'
        ? { label: t('models.statusDownloading', { percent: pct }), tone: 'primary' }
        : file.status === 'paused'
          ? { label: t('models.paused'), tone: 'warning' }
          : file.status === 'error'
            ? { label: t('models.statusError'), tone: 'danger' }
            : { label: t('models.statusNotDownloaded'), tone: 'neutral' };

  const download = () => {
    const free = freeDisk();
    if (!hasDiskSpace(model.sizeBytes, free)) {
      notify(
        t('models.download'),
        t('models.notEnoughDisk', { needed: formatBytes(model.sizeBytes), available: formatBytes(free ?? 0) }),
        t('common.ok'),
      );
      return;
    }
    store.startDownload(model.id);
  };

  const confirmDelete = () =>
    showDialog({
      title: t('models.deleteTitle'),
      message: t('models.deleteBody'),
      actions: [
        { label: t('common.cancel'), cancel: true },
        {
          label: t('common.delete'),
          icon: dialogIcons.trash,
          destructive: true,
          onPress: async () => {
            // Settle any background pass first: unloading the engine mid-run is unsafe.
            await useChatStore.getState().cancelBackgroundPasses();
            if (isVoice) {
              await useVoiceStore.getState().release();
              if (useSettingsStore.getState().selectedVoiceModelId === model.id) {
                useSettingsStore.getState().setSelectedVoiceModelId(null);
              }
            } else if (loadedModelId === model.id) await release();
            // Imported entries (local:// customs, LLM or voice) own their file:
            // removing them also deletes it. Catalog models only drop the file.
            const isImported = useModelStore.getState().customModels.some((x) => x.id === model.id);
            if (isImported) store.removeCustomModel(model.id);
            else store.deleteModelFile(model.id);
          },
        },
      ],
    });

  const busy = file.status === 'downloading' || file.status === 'paused';
  const live = file.status === 'downloading' ? speedLine(file.bytesWritten, total, file.speedBps, t) : null;
  // The mic uses one voice model at a time (the Saudi dialectal fine-tune when
  // chosen); the catalog default is the fallback the settings null resolves to.
  const micActive = isVoice && file.status === 'downloaded' && micVoiceId === model.id;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(360)} layout={LinearTransition}>
      <Card>
        <View style={styles.cardTop}>
          {selectMode ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!selected }}
              accessibilityLabel={t('models.selectOne', { name: model.name })}
              onPress={onToggleSelect}
              hitSlop={8}
            >
              <SelectionCircle selected={!!selected} color={colors.primary} />
            </Pressable>
          ) : null}
          <ProgressRing value={file.status === 'downloaded' ? 1 : ratio} size={58} stroke={5}>
            {busy ? (
              <Text style={[type.micro, { color: colors.text }]}>{pct}%</Text>
            ) : (
              <StatusGlyph
                kind={file.status === 'downloaded' ? 'done' : file.status === 'error' ? 'error' : 'idle'}
                color={file.status === 'downloaded' ? colors.success : file.status === 'error' ? colors.danger : colors.textMuted}
              />
            )}
          </ProgressRing>
          <View style={styles.cardBody}>
            <Text style={[type.headline, styles.auto, { color: colors.text }]} numberOfLines={2}>
              {model.name}
            </Text>
            <StatusChip label={status.label} tone={status.tone} />
          </View>
        </View>

        <View style={styles.badges}>
          {model.params || model.quant ? <Badge label={[model.params, model.quant].filter(Boolean).join(' · ')} /> : null}
          <Badge label={total > 0 ? formatBytes(total) : '?'} />
          {!isVoice && total > 0 ? <Badge label={t('models.ramNeeded', { value: formatBytes(estimateRuntimeBytes(total, nCtx)) })} /> : null}
          {model.license ? <Badge label={model.license} /> : null}
        </View>

        <Text style={[type.callout, styles.auto, styles.desc, { color: colors.textMuted }]}>{description}</Text>

        {busy ? (
          <Text style={[type.caption, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]}>
            {formatBytes(file.bytesWritten)} / {total > 0 ? formatBytes(total) : '?'}
          </Text>
        ) : null}
        {live ? (
          <Text
            style={[type.caption, styles.auto, styles.live, { color: colors.primary }]}
            accessibilityLiveRegion="polite"
          >
            {live}
          </Text>
        ) : null}
        {file.status === 'error' && file.error ? (
          <Text style={[type.caption, styles.auto, { color: colors.danger, marginTop: spacing.sm }]}>{downloadErrorText(file.error, t)}</Text>
        ) : null}

        <View style={styles.actions}>
          {file.status === 'idle' || file.status === 'error' ? (
            <>
              <Button title={t('models.download')} variant="primary" compact onPress={download} />
              {model.source === 'custom' || model.url.startsWith('local://') ? (
                <Button title={t('models.removeEntry')} compact variant="danger" onPress={() => store.removeCustomModel(model.id)} />
              ) : null}
            </>
          ) : null}
          {file.status === 'downloading' ? (
            <>
              <Button title={t('models.pause')} compact onPress={() => void store.pauseDownload(model.id)} />
              <Button title={t('models.cancelDownload')} compact variant="danger" onPress={() => store.cancelDownload(model.id)} />
            </>
          ) : null}
          {file.status === 'paused' ? (
            <>
              <Button title={t('models.resume')} variant="primary" compact onPress={() => store.resumeDownload(model.id)} />
              <Button title={t('models.cancelDownload')} compact variant="danger" onPress={() => store.cancelDownload(model.id)} />
            </>
          ) : null}
          {file.status === 'downloaded' ? (
            <>
              {isVoice ? (
                micActive ? (
                  <StatusChip tone="accent" label={t('models.micActive')} />
                ) : (
                  <Button
                    title={t('models.useForMic')}
                    variant="primary"
                    compact
                    onPress={() => useSettingsStore.getState().setSelectedVoiceModelId(model.id)}
                  />
                )
              ) : (
                <Button
                  title={inUse ? t('models.inUse') : t('models.use')}
                  variant="primary"
                  compact
                  disabled={inUse || llmStatus === 'loading'}
                  onPress={async () => {
                    const ok = await loadWithChecks(model.id);
                    if (ok) router.push({ pathname: '/chat/[id]', params: { id: 'new' } });
                  }}
                />
              )}
              <Button title={t('models.deleteFile')} compact variant="danger" onPress={confirmDelete} />
            </>
          ) : null}
        </View>
      </Card>
    </Animated.View>
  );
}

const FILTER_LABEL_KEYS: Record<ModelFilterId, string> = {
  all: 'models.filterAll',
  small: 'models.filterSmall',
  medium: 'models.filterMedium',
  large: 'models.filterLarge',
  fits: 'models.filterFits',
};

/**
 * The model library section: free-text search over the whole registry plus one
 * card per category (glyph, name, description, live count) that opens the
 * category's list. Entries are real and documented; the availability contract
 * shows on every row and detail page.
 */
function LibrarySection() {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const counts = useMemo(() => categoryModelCounts(), []);
  const isAr = i18n.language === 'ar';
  const trimmed = query.trim();
  const results = useMemo(
    () => (trimmed ? searchLibraryModels(trimmed) : []),
    [trimmed],
  );

  return (
    <>
      <SectionTitle>{t('models.libraryTitle')}</SectionTitle>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('library.searchHint')}
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
        style={[type.callout, styles.searchBox, styles.auto, { color: colors.text, borderColor: colors.border, backgroundColor: colors.input }]}
      />
      {trimmed ? (
        results.length === 0 ? (
          <Text style={[type.callout, styles.auto, { color: colors.textMuted }]}>{t('library.emptyTitle')}</Text>
        ) : (
          results.map((m) => (
            <PressableScale
              key={m.id}
              onPress={() => router.push(`/model/${m.id}`)}
              accessibilityRole="button"
              style={{ marginBottom: spacing.sm }}
            >
              <Card>
                <View style={styles.libRow}>
                  <Text style={[type.bodyStrong, styles.auto, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <StatusChip
                    label={m.availability === 'integrated' ? t('library.integrated') : t('library.catalog')}
                    tone={m.availability === 'integrated' ? 'success' : 'neutral'}
                  />
                </View>
                <Text style={[type.caption, styles.auto, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                  {m.developer}
                  {m.params ? ` · ${m.params}` : ''}
                </Text>
              </Card>
            </PressableScale>
          ))
        )
      ) : (
        <View style={styles.libGrid}>
          {LIBRARY_CATEGORIES.map((c) => (
            <PressableScale
              key={c.id}
              onPress={() => router.push(`/models-category/${c.id}`)}
              accessibilityRole="button"
              accessibilityLabel={isAr ? c.name.ar : c.name.en}
              style={styles.libCell}
            >
              <Card>
                <View style={styles.libRow}>
                  <CategoryGlyph icon={c.icon} color={colors.primary} size={26} />
                  <Text style={[type.label, styles.auto, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {isAr ? c.name.ar : c.name.en}
                  </Text>
                </View>
                <Text style={[type.caption, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]} numberOfLines={2}>
                  {isAr ? c.desc.ar : c.desc.en}
                </Text>
                <Text style={[type.micro, { color: colors.primary, marginTop: spacing.sm, fontWeight: '700' }]}>
                  {t('library.count', { n: counts[c.id] ?? 0 })}
                </Text>
              </Card>
            </PressableScale>
          ))}
        </View>
      )}
    </>
  );
}

export default function ModelsScreen() {
  const { t } = useTranslation();
  const bottom = useTabBarSpace();
  const { colors } = useAppTheme();
  const addFromUrl = useModelStore((s) => s.addFromUrl);
  const addFromLocalFile = useModelStore((s) => s.addFromLocalFile);
  const justCompleted = useDownloadCelebrateStore((s) => s.justCompleted);
  const dismissCompleted = useDownloadCelebrateStore((s) => s.dismiss);
  const setModelsScreenVisible = useDownloadCelebrateStore((s) => s.setModelsScreenVisible);
  // Catalog filter + multi-select deletion state.
  const [filter, setFilter] = useState<ModelFilterId>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Read once on mount (lazy initializer avoids a setState-in-effect cascade).
  const [resources] = useState<{ ram: number | null; disk: number | null }>(() => ({
    ram: availableRamBytes(),
    disk: freeDisk(),
  }));
  const nCtx = useSettingsStore((s) => s.contextSize);
  const filterCtx = {
    freeRamBytes: resources.ram,
    runtimeBytes: (sizeBytes: number) => estimateRuntimeBytes(sizeBytes, nCtx),
  };
  const customModels = useModelStore(useShallow((s) => s.customModels));
  // Imported voice models (.bin whisper fine-tunes) live in the voice section,
  // beside the catalog voice models — never under the custom LLM list.
  const importedVoiceModels = customModels.filter((m) => m.source === 'voice');
  const llmCustomModels = customModels.filter((m) => m.source !== 'voice');
  const filteredCatalog = applyModelFilter(CATALOG, filter, filterCtx);
  const filteredCustom = applyModelFilter(llmCustomModels, filter, filterCtx);

  const pathname = usePathname();
  // Tab screens stay mounted across tab switches; the flag follows the real focus,
  // so a completion elsewhere pops the notice while a completion here shows the banner.
  useEffect(() => {
    setModelsScreenVisible(pathname === '/models');
    return () => setModelsScreenVisible(false);
  }, [pathname, setModelsScreenVisible]);

  // A finished download deserves a beat while its banner appears.
  useEffect(() => {
    if (justCompleted) haptic.success();
  }, [justCompleted]);

  const toggleSelect = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const confirmDeleteSelected = () =>
    showDialog({
      title: t('models.deleteSelectedTitle'),
      message: t('models.deleteSelectedBody', { n: selectedIds.length }),
      actions: [
        { label: t('common.cancel'), cancel: true },
        {
          label: t('common.delete'),
          icon: dialogIcons.trash,
          destructive: true,
          onPress: async () => {
            const { files, removeCustomModel, deleteModelFile } = useModelStore.getState();
            const customIds = new Set(useModelStore.getState().customModels.map((m) => m.id));
            const voiceIds = new Set(VOICE_MODELS.map((m) => m.id));
            const loadedModelId = useLlmStore.getState().loadedModelId;
            const plan = planBatchDelete(selectedIds, files, loadedModelId, customIds);
            // Settle background passes first: unloading the engine mid-run is unsafe.
            await useChatStore.getState().cancelBackgroundPasses();
            if (plan.unloadModelIds.some((id) => !customIds.has(id))) await useLlmStore.getState().release();
            if (plan.removeCustomIds.concat(plan.deleteFileIds).some((id) => voiceIds.has(id))) {
              await useVoiceStore.getState().release();
            }
            for (const id of plan.removeCustomIds) removeCustomModel(id);
            for (const id of plan.deleteFileIds) deleteModelFile(id);
            const removed = batchDeleteCount(plan);
            exitSelectMode();
            haptic.success();
            notify(t('models.deleteSelectedTitle'), t('models.deleteSelectedDone', { n: removed }), t('common.ok'));
          },
        },
      ],
    });

  const onAdd = async () => {
    setAdding(true);
    setAddError(null);
    try {
      const res = await addFromUrl(url, t('models.customDesc'));
      if (res.ok) setUrl('');
      else if (res.reason === 'invalid') setAddError(t('models.invalidUrl'));
      else if (res.reason === 'duplicate') setAddError(t('models.duplicate'));
      else setAddError(t('models.failed', { message: res.message ?? '' }));
    } finally {
      setAdding(false);
    }
  };

  const onImportPick = async () => {
    setImportError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ multiple: false, type: '*/*', copyToCacheDirectory: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      setImporting(true);
      const res = await addFromLocalFile(asset.uri, asset.name ?? '', asset.size ?? 0);
      if (!res.ok) {
        setImportError(
          res.reason === 'invalid'
            ? t('models.importInvalid')
            : res.reason === 'duplicate'
              ? t('models.duplicate')
              : res.reason === 'nospace'
                ? t('models.importNoSpace')
                : t('models.failed', { message: res.message ?? '' }),
        );
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title={t('nav.models')} subtitle={t('models.subtitle')} />
      <View style={styles.inner}>
        <View style={styles.resources}>
          {resources.ram ? <StatusChip tone="accent" label={t('models.freeRam', { value: formatBytes(resources.ram) })} /> : null}
          {resources.disk ? <StatusChip tone="primary" label={t('models.freeDisk', { value: formatBytes(resources.disk) })} /> : null}
          <StorageProtectedChip />
        </View>

        <StorageBanner />

        <LibrarySection />

        {justCompleted ? (
          <Animated.View entering={FadeInDown.duration(360)} layout={LinearTransition}>
            <Card>
              <Text style={[type.headline, styles.auto, { color: colors.text }]}>{t('models.doneTitle')}</Text>
              <Text style={[type.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>{t('models.doneBody')}</Text>
              <View style={styles.actions}>
                <Button title={t('models.doneDismiss')} variant="secondary" compact onPress={dismissCompleted} />
              </View>
            </Card>
          </Animated.View>
        ) : null}

        <SectionTitle>{t('models.curated')}</SectionTitle>
        <View style={styles.filterRow} accessibilityRole="tablist">
          {MODEL_FILTERS.map((id) => (
            <Button
              key={id}
              title={t(FILTER_LABEL_KEYS[id])}
              accessibilityState={{ selected: filter === id }}
              variant={filter === id ? 'primary' : 'secondary'}
              compact
              onPress={() => setFilter(id)}
            />
          ))}
        </View>
        {selectMode ? (
          <Card>
            <View style={styles.selectActions}>
              <Button title={t('models.cancelSelect')} compact variant="ghost" onPress={exitSelectMode} />
              <Button
                title={t('models.deleteSelectedCount', { n: selectedIds.length })}
                compact
                variant="danger"
                disabled={selectedIds.length === 0}
                onPress={confirmDeleteSelected}
              />
            </View>
            <Text style={[type.caption, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]}>
              {t('models.selectHint')}
            </Text>
          </Card>
        ) : (
          <View style={styles.selectActions}>
            <Button title={t('models.selectModels')} compact variant="ghost" onPress={() => setSelectMode(true)} />
          </View>
        )}
        {filteredCatalog.length === 0 ? (
          <Text style={[type.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]}>{t('models.filterEmpty')}</Text>
        ) : (
          filteredCatalog.map((m, i) => (
            <ModelCard
              key={m.id}
              model={m}
              index={i}
              selectMode={selectMode}
              selected={selectedIds.includes(m.id)}
              onToggleSelect={() => toggleSelect(m.id)}
            />
          ))
        )}

        <SectionTitle>{t('models.voiceSection')}</SectionTitle>
        {VOICE_MODELS.concat(importedVoiceModels).map((m, i) => (
          <ModelCard
            key={m.id}
            model={m}
            index={i}
            selectMode={selectMode}
            selected={selectedIds.includes(m.id)}
            onToggleSelect={() => toggleSelect(m.id)}
          />
        ))}

        <SectionTitle>{t('models.custom')}</SectionTitle>
        {llmCustomModels.length > 0 && filteredCustom.length === 0 ? (
          <Text style={[type.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.sm }]}>{t('models.filterEmpty')}</Text>
        ) : (
          filteredCustom.map((m, i) => (
            <ModelCard
              key={m.id}
              model={m}
              index={i}
              selectMode={selectMode}
              selected={selectedIds.includes(m.id)}
              onToggleSelect={() => toggleSelect(m.id)}
            />
          ))
        )}

        <Card>
          <Text style={[type.headline, styles.auto, { color: colors.text }]}>{t('models.addByUrl')}</Text>
          <TextInput
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setAddError(null);
            }}
            placeholder={t('models.urlPlaceholder')}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[type.callout, styles.urlInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.input }]}
          />
          {addError ? <Text style={[type.caption, styles.auto, { color: colors.danger, marginTop: spacing.sm }]}>{addError}</Text> : null}
          <View style={styles.actions}>
            <Button
              title={adding ? t('models.adding') : t('models.add')}
              variant="primary"
              compact
              loading={adding}
              disabled={!url.trim()}
              onPress={() => void onAdd()}
            />
          </View>
        </Card>

        <Card>
          <Text style={[type.headline, styles.auto, { color: colors.text }]}>{t('models.importLocalTitle')}</Text>
          <Text style={[type.callout, styles.auto, { color: colors.textMuted, marginTop: spacing.xs }]}>{t('models.importLocalBody')}</Text>
          {importError ? <Text style={[type.caption, styles.auto, { color: colors.danger, marginTop: spacing.sm }]}>{importError}</Text> : null}
          <View style={styles.actions}>
            <Button
              title={importing ? t('models.importing') : t('models.importLocalPick')}
              variant="primary"
              compact
              loading={importing}
              disabled={importing}
              onPress={() => void onImportPick()}
            />
          </View>
        </Card>

        <UsageStats />
        <HistorySection />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {},
  inner: { paddingHorizontal: spacing.lg },
  auto: { textAlign: 'auto' },
  resources: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  searchBox: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  libGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  libCell: { width: '47.5%', flexGrow: 1 },
  libRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selectActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selectCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(128,128,128,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md },
  desc: { marginTop: spacing.sm },
  live: { marginTop: 2, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  urlInput: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: spacing.md,
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  historyBody: { gap: spacing.xs },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  historyGlyph: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  historyText: { flex: 1, gap: 1 },
});
