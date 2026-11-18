// Copyright (c) 2026 DRS AI. All rights reserved.
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMessage } from '../types';
import { radius, spacing, type, useAppTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { dialogIcons } from './DialogIcons';
import { MarkdownBody } from './MarkdownBody';
import { GlassSurface, PressableScale, StatusChip } from './ui';

/**
 * Focus mode: a near-opaque overlay that shows only the newest assistant
 * reply — the streaming one during generation — in a calm reading surface.
 * Auto-follows the stream while it grows; exits via the close button or the
 * Android back gesture (the backdrop is the content itself, so it stays put).
 */
export function FocusOverlay({
  visible,
  message,
  generating,
  onStop,
  onClose,
}: {
  visible: boolean;
  message: ChatMessage | null;
  generating: boolean;
  /** Shown instead of the close button while the model is still writing. */
  onStop: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);

  // The overlay reads its content from a snapshot taken at open time through
  // the `message` prop; the footer stats derive from the same object.
  const stats = useMemo(() => {
    if (!message) return null;
    const tokens = message.tokenCount;
    return tokens && tokens > 0 ? t('chat.tokenCount', { value: tokens }) : null;
  }, [message, t]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.fill, { backgroundColor: colors.overlay }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Text style={[type.label, { color: colors.textMuted }]}>{t('chat.focusTitle')}</Text>
          <View style={styles.topRight}>
            {generating ? <StatusChip tone="accent" label={t('chat.generating')} /> : null}
            {generating ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('chat.stop')}
                hapticOnPress
                onPress={onStop}
                style={[styles.chipBtn, { borderColor: colors.danger }]}
              >
                <Text style={[type.label, { color: colors.danger }]}>{t('chat.stop')}</Text>
              </PressableScale>
            ) : (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={t('chat.focusExit')}
                hapticOnPress
                onPress={() => {
                  haptic.light();
                  onClose();
                }}
                style={[styles.chipBtn, { borderColor: colors.border }]}
              >
                {dialogIcons.close(colors.textMuted, 16)}
              </PressableScale>
            )}
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          // Follow the stream tick by tick; a reading scroll stays untouched.
          onContentSizeChange={() => {
            if (generating) scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          {message ? <MarkdownBody content={message.content} /> : null}
          {stats ? (
            <Text style={[type.caption, styles.stats, { color: colors.textFaint }]}>{stats}</Text>
          ) : null}
        </ScrollView>
        {!generating ? (
          <Pressable
            style={styles.exitHint}
            onPress={onClose}
            accessibilityLabel={t('chat.focusExit')}
            hitSlop={12}
          >
            <GlassSurface style={styles.exitPill} radiusSize={radius.pill}>
              <Text style={[type.label, { color: colors.textMuted }]}>{t('chat.focusExit')}</Text>
            </GlassSurface>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chipBtn: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  stats: { marginTop: spacing.lg, textAlign: 'center', fontVariant: ['tabular-nums'] },
  exitHint: { position: 'absolute', bottom: spacing.xl, alignSelf: 'center' },
  exitPill: { paddingHorizontal: spacing.lg, paddingVertical: 8 },
});
