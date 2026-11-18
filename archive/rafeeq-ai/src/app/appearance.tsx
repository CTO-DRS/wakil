// Copyright (c) 2026 DRS AI. All rights reserved.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme, Image, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { BackChevron, Button, Card, PressableScale, SectionTitle } from '../components/ui';
import { getRafeeqNative } from '../agent/tools/native';
import {
  CUSTOM_COLOR_SLOTS,
  EMPTY_CUSTOM_COLORS,
  hasCustomColors,
  isHexColor,
  normalizeHexColor,
  resolveAppearancePalette,
  useAppearanceStore,
  type CustomColorSlot,
  type CustomColors,
} from '../store/appearanceStore';
import { LAUNCHER_ICON_ALL_IDS, type LauncherIconId } from '../appearance/appIcons';
import { goBack } from '../navigation/goBack';
import { haptic } from '../utils/haptics';
import { radius, spacing, type as typeScale, useAppTheme } from '../theme';
import { THEMES, type Palette } from '../theme/themes';

/** Curated preset swatches offered for every overridable slot. */
const COLOR_PRESETS = [
  '#7C3AED', '#2563EB', '#22D3EE', '#14B8A6', '#10B981', '#84CC16',
  '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#D4AF37', '#FF2D8C',
] as const;

/** Static require map: Metro bundles each thumb once, lookups stay static. */
const ICON_THUMBS: Record<LauncherIconId, number> = {
  default: require('../../assets/icon.png'),
  midnight: require('../../assets/launcher-icons/thumbs/midnight.png'),
  gold: require('../../assets/launcher-icons/thumbs/gold.png'),
  glass: require('../../assets/launcher-icons/thumbs/glass.png'),
  cyber: require('../../assets/launcher-icons/thumbs/cyber.png'),
  neon: require('../../assets/launcher-icons/thumbs/neon.png'),
  mono: require('../../assets/launcher-icons/thumbs/mono.png'),
  sunset: require('../../assets/launcher-icons/thumbs/sunset.png'),
};

const SLOT_LABEL_KEYS: Record<CustomColorSlot, string> = {
  primary: 'appearance.slotPrimary',
  secondary: 'appearance.slotSecondary',
  background: 'appearance.slotBackground',
  card: 'appearance.slotCard',
};

const SLOT_HINT_KEYS: Record<CustomColorSlot, string> = {
  primary: 'appearance.slotPrimaryHint',
  secondary: 'appearance.slotSecondaryHint',
  background: 'appearance.slotBackgroundHint',
  card: 'appearance.slotCardHint',
};

/** A small self-contained theme preview: background, card, button, text dots. */
function ThemeTile({ palette, dark, active }: { palette: Palette; dark: boolean; active: boolean }) {
  return (
    <View style={[styles.tile, { backgroundColor: palette.background, borderColor: active ? palette.primary : palette.border }]}>
      <View
        style={[
          styles.tileCard,
          {
            backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.75)',
            borderColor: palette.border,
          },
        ]}
      >
        <View style={[styles.tileLine, { backgroundColor: palette.text, opacity: 0.75 }]} />
        <View style={[styles.tileLine, { backgroundColor: palette.textMuted, opacity: 0.6, width: '62%' }]} />
      </View>
      <View style={styles.tileRow}>
        <View style={[styles.tileButton, { backgroundColor: palette.primary }]} />
        <View style={[styles.tileDot, { backgroundColor: palette.accent }]} />
      </View>
    </View>
  );
}

function ThemeSection() {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const themeId = useAppearanceStore((s) => s.themeId);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const isAr = i18n.language === 'ar';

  return (
    <>
      <SectionTitle>{t('appearance.themesSection')}</SectionTitle>
      <Card>
        <View style={styles.systemRow}>
          <View style={styles.systemText}>
            <Text style={[typeScale.bodyStrong, styles.auto, { color: colors.text }]}>
              {t('appearance.followSystem')}
            </Text>
            <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>
              {t('appearance.followSystemHint')}
            </Text>
          </View>
          <Switch
            value={themeId === 'system'}
            onValueChange={(v) => {
              haptic.tap();
              setTheme(v ? 'system' : 'dark');
            }}
            trackColor={{ true: colors.primary, false: undefined }}
            accessibilityLabel={t('appearance.followSystem')}
          />
        </View>
        <View style={styles.themeGrid}>
          {THEMES.map((def) => {
            const active = themeId === def.id;
            return (
              <PressableScale
                key={def.id}
                onPress={() => {
                  haptic.tap();
                  setTheme(def.id);
                }}
                style={styles.themeCell}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={isAr ? def.nameAr : def.name}
              >
                <ThemeTile palette={def.palette} dark={def.dark} active={active} />
                <View style={styles.themeNameRow}>
                  <Text
                    numberOfLines={1}
                    style={[
                      typeScale.caption,
                      styles.auto,
                      {
                        color: active ? colors.primary : colors.textMuted,
                        fontWeight: active ? '700' : '500',
                        flex: 1,
                      },
                    ]}
                  >
                    {isAr ? def.nameAr : def.name}
                  </Text>
                  {active ? <Text style={[typeScale.micro, { color: colors.primary }]}>✓</Text> : null}
                </View>
              </PressableScale>
            );
          })}
        </View>
      </Card>
    </>
  );
}

/** Renders a realistic slice of the app (bubble, buttons, chip, card) with the pending colors. */
function LivePreview({ draft }: { draft: CustomColors }) {
  const { t } = useTranslation();
  const themeId = useAppearanceStore((s) => s.themeId);
  const system = useColorScheme();
  const { palette } = resolveAppearancePalette(themeId, system === 'dark', draft);
  return (
    <Card>
      <Text style={[typeScale.label, styles.auto, { color: palette.textMuted }]}>{t('appearance.previewTitle')}</Text>
      <View style={[styles.previewStage, { backgroundColor: palette.background, borderColor: palette.border }]}>
        <View style={[styles.previewCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={[styles.previewBubble, { backgroundColor: palette.primary }]}>
            <Text style={[typeScale.caption, styles.auto, { color: palette.primaryText }]}>
              {t('appearance.previewUser')}
            </Text>
          </View>
          <View style={[styles.previewBubble, { backgroundColor: palette.surfaceAlt, alignSelf: 'flex-start' }]}>
            <Text style={[typeScale.caption, styles.auto, { color: palette.text }]}>
              {t('appearance.previewAgent')}
            </Text>
          </View>
          <View style={styles.previewRow}>
            <View style={[styles.previewButton, { backgroundColor: palette.primary }]}>
              <Text style={[typeScale.micro, { color: palette.primaryText }]}>{t('common.ok')}</Text>
            </View>
            <View style={[styles.previewChip, { borderColor: palette.border }]}>
              <View style={[styles.previewChipDot, { backgroundColor: palette.accent }]} />
              <Text style={[typeScale.micro, { color: palette.textMuted }]}>{t('appearance.previewChip')}</Text>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}

function ColorSlotRow({
  slot,
  value,
  onChange,
}: {
  slot: CustomColorSlot;
  value: string | null;
  onChange: (hex: string | null) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [hex, setHex] = useState(value ?? '');
  const [open, setOpen] = useState(false);
  const valid = hex.trim() === '' || isHexColor(hex);

  return (
    <View style={[styles.slotRow, { borderColor: colors.border }]}>
      <PressableScale onPress={() => setOpen((v) => !v)} style={styles.slotHeader} accessibilityRole="button">
        <View style={[styles.slotSwatch, { backgroundColor: value ?? colors.primary, borderColor: colors.border }]}>
          {!value ? <Text style={[typeScale.micro, { color: colors.primaryText }]}>A</Text> : null}
        </View>
        <View style={styles.slotText}>
          <Text style={[typeScale.bodyStrong, styles.auto, { color: colors.text }]}>{t(SLOT_LABEL_KEYS[slot])}</Text>
          <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]} numberOfLines={1}>
            {value ? value.toUpperCase() : t('appearance.slotThemeDefault')} · {t(SLOT_HINT_KEYS[slot])}
          </Text>
        </View>
        {value ? (
          <Button
            title={t('appearance.slotClear')}
            variant="ghost"
            compact
            onPress={() => {
              setHex('');
              onChange(null);
            }}
          />
        ) : null}
      </PressableScale>
      {open ? (
        <View style={styles.slotBody}>
          <View style={styles.swatchRow}>
            {COLOR_PRESETS.map((c) => (
              <PressableScale
                key={c}
                onPress={() => {
                  setHex(c);
                  onChange(c);
                }}
                style={[styles.swatch, { backgroundColor: c, borderColor: value === c ? colors.text : colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={c}
              >
                {null}
              </PressableScale>
            ))}
          </View>
          <View style={styles.hexRow}>
            <TextInput
              value={hex}
              onChangeText={(v) => {
                setHex(v);
                onChange(normalizeHexColor(v));
              }}
              placeholder="#7C3AED"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              style={[typeScale.callout, styles.hexInput, styles.auto, { color: colors.text, borderColor: valid ? colors.border : colors.danger, backgroundColor: colors.input }]}
            />
            {!valid ? <Text style={[typeScale.caption, { color: colors.danger }]}>{t('appearance.invalidHex')}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ColorsSection() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const custom = useAppearanceStore((s) => s.custom);
  const setCustomColor = useAppearanceStore((s) => s.setCustomColor);
  const resetCustomColors = useAppearanceStore((s) => s.resetCustomColors);
  // The draft is what the live preview shows; Apply commits it to the store at once.
  const [draft, setDraft] = useState<CustomColors>(custom);

  const change = (slot: CustomColorSlot, hex: string | null) =>
    setDraft((d) => ({ ...d, [slot]: hex === null ? null : normalizeHexColor(hex) }));

  return (
    <>
      <SectionTitle>{t('appearance.colorsSection')}</SectionTitle>
      <LivePreview draft={draft} />
      <Card>
        {CUSTOM_COLOR_SLOTS.map((slot) => (
          <ColorSlotRow key={slot} slot={slot} value={draft[slot]} onChange={(hex) => change(slot, hex)} />
        ))}
        <View style={styles.applyRow}>
          <Button
            title={t('appearance.apply')}
            variant="primary"
            compact
            onPress={() => {
              for (const slot of CUSTOM_COLOR_SLOTS) setCustomColor(slot, draft[slot]);
              haptic.success();
            }}
          />
          <Button
            title={t('appearance.resetColors')}
            variant="ghost"
            compact
            disabled={!hasCustomColors(draft)}
            onPress={() => {
              setDraft({ ...EMPTY_CUSTOM_COLORS });
              resetCustomColors();
              haptic.tap();
            }}
          />
        </View>
        <Text style={[typeScale.caption, styles.auto, { color: colors.textFaint }]}>
          {t('appearance.colorsHint')}
        </Text>
      </Card>
    </>
  );
}

function IconsSection() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const iconId = useAppearanceStore((s) => s.iconId);
  const setIconId = useAppearanceStore((s) => s.setIconId);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<LauncherIconId | null>(null);

  // Re-sync with reality on every focus: the OS owns the enabled alias, the
  // store only mirrors it for the UI. The alias itself survives updates and
  // reinstalls (it lives in the manifest), so selection is never lost.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const tools = getRafeeqNative();
      if (!tools) {
        setSupported(false);
        return () => {
          alive = false;
        };
      }
      tools
        .launcherIconStatus()
        .then((res) => {
          if (!alive) return;
          setSupported(res.ok === true && res.supported === true);
          if (res.ok && typeof res.iconId === 'string') setIconId(res.iconId);
        })
        .catch(() => alive && setSupported(false));
      return () => {
        alive = false;
      };
    }, [setIconId]),
  );

  const apply = async (id: LauncherIconId) => {
    if (busy || id === iconId) return;
    setBusy(id);
    try {
      const tools = getRafeeqNative();
      const res = await tools?.setLauncherIcon(id);
      if (res?.ok) {
        setIconId(id);
        haptic.success();
      } else {
        haptic.tap();
      }
    } finally {
      setBusy(null);
    }
  };

  const names: Record<LauncherIconId, string> = {
    default: t('appearance.iconDefault'),
    midnight: t('appearance.iconMidnight'),
    gold: t('appearance.iconGold'),
    glass: t('appearance.iconGlass'),
    cyber: t('appearance.iconCyber'),
    neon: t('appearance.iconNeon'),
    mono: t('appearance.iconMono'),
    sunset: t('appearance.iconSunset'),
  };

  if (supported === false) {
    return (
      <>
        <SectionTitle>{t('appearance.iconsSection')}</SectionTitle>
        <Card>
          <Text style={[typeScale.callout, styles.auto, { color: colors.textMuted }]}>
            {t('appearance.iconsUnsupported')}
          </Text>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionTitle>{t('appearance.iconsSection')}</SectionTitle>
      <Card>
        <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted, marginBottom: spacing.sm }]}>
          {t('appearance.iconsHint')}
        </Text>
        <View style={styles.iconGrid}>
          {LAUNCHER_ICON_ALL_IDS.map((id) => {
            const active = iconId === id;
            return (
              <PressableScale
                key={id}
                onPress={() => void apply(id)}
                style={[styles.iconCell, { borderColor: active ? colors.primary : 'transparent' }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={names[id]}
                disabled={busy !== null}
              >
                <Image source={ICON_THUMBS[id]} style={styles.iconThumb} resizeMode="cover" />
                <Text
                  numberOfLines={1}
                  style={[typeScale.micro, styles.auto, { color: active ? colors.primary : colors.textMuted, flex: 1 }]}
                >
                  {names[id]}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </Card>
    </>
  );
}

export default function AppearanceScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <BackChevron color={colors.text} />
        </PressableScale>
        <Text style={[typeScale.title, styles.auto, styles.headerTitle, { color: colors.text }]}>
          {t('appearance.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={[typeScale.caption, styles.auto, { color: colors.textMuted }]}>{t('appearance.subtitle')}</Text>
        <Animated.View entering={FadeInDown.duration(320)}>
          <ThemeSection />
          <ColorsSection />
          <IconsSection />
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
  systemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  systemText: { flex: 1, gap: 2 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  themeCell: { width: '47%', flexGrow: 1 },
  tile: { borderRadius: radius.md, borderWidth: 2, padding: spacing.sm, gap: spacing.sm, minHeight: 86 },
  tileCard: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, padding: spacing.sm, gap: 6, flex: 1 },
  tileLine: { height: 5, borderRadius: 3, width: '86%' },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tileButton: { width: 44, height: 16, borderRadius: 8 },
  tileDot: { width: 12, height: 12, borderRadius: 6 },
  themeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  previewStage: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  previewCard: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.sm },
  previewBubble: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-end',
    maxWidth: '86%',
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  previewButton: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  previewChipDot: { width: 7, height: 7, borderRadius: 4 },
  slotRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, marginBottom: spacing.sm },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  slotSwatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  slotText: { flex: 1, gap: 2 },
  slotBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  hexRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  hexInput: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minWidth: 130,
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  applyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  iconCell: {
    width: '23%',
    minWidth: 74,
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexGrow: 1,
  },
  iconThumb: { width: 56, height: 56, borderRadius: 14 },
});
