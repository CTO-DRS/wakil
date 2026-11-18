// Copyright (c) 2026 DRS AI. All rights reserved.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDialogStore, type DialogAction } from '../store/dialogStore';
import type { Palette } from '../theme';
import { radius, spacing, type, useAppTheme } from '../theme';
import { GlassSurface, PressableScale } from './ui';

/** Tone → palette color; destructive always wins with danger. Pure for clarity. */
function rowColor(colors: Palette, action: DialogAction): string {
  if (action.destructive) return colors.danger;
  switch (action.tone) {
    case 'accent':
      return colors.accent;
    case 'primary':
      return colors.primary;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    default:
      return colors.text;
  }
}

/**
 * Renders the head of the dialog queue as a themed bottom sheet — the single
 * replacement for every native Alert.alert in the app. Mounted once at the
 * root, above the navigation stack, so it floats over any screen or modal.
 */
export function AppDialogHost() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const dialog = useDialogStore((s) => s.queue[0] ?? null);
  const press = useDialogStore((s) => s.press);
  const dismiss = useDialogStore((s) => s.dismiss);

  // Split once per dialog: regular rows first, the dismissive cancel row apart
  // (bold, after a gap) — the established action-sheet hierarchy.
  const { rows, cancel } = useMemo(() => {
    const actions = dialog?.actions ?? [];
    return { rows: actions.filter((a) => !a.cancel), cancel: actions.find((a) => a.cancel) ?? null };
  }, [dialog]);

  return (
    <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      {/* Backdrop tap dismisses — mirrors the system alert's outside-tap behavior. */}
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={dismiss} accessibilityLabel={t('common.cancel')} />
      <View pointerEvents="box-none" style={[styles.sheetArea, { paddingBottom: insets.bottom + spacing.md }]}>
        {dialog ? (
          <GlassSurface strong radiusSize={radius.xl} style={styles.sheet}>
            <Text style={[type.headline, styles.title, { color: colors.text }]}>{dialog.title}</Text>
            {dialog.message ? (
              <Text style={[type.callout, styles.message, { color: colors.textMuted }]}>{dialog.message}</Text>
            ) : null}
            <ScrollView style={styles.rows} nestedScrollEnabled>
              {rows.map((action, i) => {
                // The original index inside dialog.actions (rows are filtered),
                // so the store's press() finds the right action.
                const index = dialog.actions?.indexOf(action) ?? i;
                const color = rowColor(colors, action);
                return (
                  <PressableScale
                    key={`${dialog.key}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    hapticOnPress
                    onPress={() => press(index)}
                    style={styles.row}
                  >
                    {action.icon ? (
                      <View style={[styles.rowIcon, { backgroundColor: color + '1F' }]}>{action.icon(color)}</View>
                    ) : null}
                    <Text
                      style={[type.body, styles.rowLabel, styles.rowText, { color: action.destructive ? colors.danger : colors.text }]}
                      numberOfLines={2}
                    >
                      {action.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
            {cancel ? (
              <>
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={cancel.label}
                  hapticOnPress
                  onPress={() => press(dialog.actions?.indexOf(cancel) ?? -1)}
                  style={styles.row}
                >
                  <Text style={[type.bodyStrong, styles.rowLabel, { color: colors.textMuted }]}>{cancel.label}</Text>
                </PressableScale>
              </>
            ) : null}
          </GlassSurface>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetArea: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.md },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { marginBottom: spacing.sm, textAlign: 'center' },
  message: { marginBottom: spacing.md, textAlign: 'center' },
  rows: { flexGrow: 0, maxHeight: 320 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, paddingHorizontal: spacing.xs },
  rowIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { textAlign: 'center' },
  rowText: { flex: 1, textAlign: 'start' },
  separator: { height: StyleSheet.hairlineWidth, marginTop: spacing.sm },
});
