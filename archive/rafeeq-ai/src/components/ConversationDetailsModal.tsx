// Copyright (c) 2026 DRS AI. All rights reserved.
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useModelStore } from '../store/modelStore';
import { radius, spacing, type, useAppTheme } from '../theme';
import type { ChatMessage } from '../types';
import { buildConversationDetails } from '../utils/conversationDetails';

/**
 * Read-only details sheet for the open conversation: creation date, message
 * counts, word and generated-token totals, the model behind the chat and
 * whether a per-conversation instruction is set. Purely informational — the
 * rows come from the pure builder, the modal only formats and lays them out.
 */
export function ConversationDetailsModal({
  visible,
  onClose,
  conversation,
  messages,
}: {
  visible: boolean;
  onClose: () => void;
  /** Minimal shape of the open conversation; null keeps the sheet closed. */
  conversation: { createdAt: number; modelId: string | null; systemPrompt?: string; summary?: string | null } | null;
  messages: ChatMessage[];
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const getModel = useModelStore((s) => s.getModel);

  const open = visible && conversation !== null;
  const rows =
    conversation !== null
      ? buildConversationDetails({
          conversation,
          messages,
          modelName: conversation.modelId ? (getModel(conversation.modelId)?.name ?? null) : null,
          formatDate: (ms: number) => {
            try {
              return new Date(ms).toLocaleString(i18n.language === 'ar' ? 'ar' : 'en', {
                dateStyle: 'medium',
                timeStyle: 'short',
              });
            } catch {
              return new Date(ms).toISOString();
            }
          },
          labels: {
            created: t('chat.detailsCreated'),
            messages: t('chat.detailsMessages'),
            yours: t('chat.detailsYours'),
            replies: t('chat.detailsReplies'),
            words: t('chat.detailsWords'),
            tokens: t('chat.detailsTokens'),
            model: t('chat.detailsModel'),
            instructions: t('chat.detailsInstructions'),
            yes: t('chat.detailsYes'),
            no: t('chat.detailsNo'),
          },
        })
      : [];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}>
          {conversation !== null ? (
            <>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {t('chat.details')}
              </Text>
              {rows.map((row) => (
                <View key={row.label} style={styles.row}>
                  <Text style={[type.caption, styles.rowLabel, { color: colors.textMuted }]} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text style={[type.label, styles.rowValue, { color: colors.text }]}>{row.value}</Text>
                </View>
              ))}
              {conversation.summary?.trim() ? (
                <View style={styles.summaryBlock}>
                  <Text style={[type.caption, { color: colors.textMuted }]}>{t('chat.detailsSummary')}</Text>
                  <Text style={[type.callout, styles.summaryText, { color: colors.text }]}>{conversation.summary.trim()}</Text>
                </View>
              ) : null}
              <Text style={[type.caption, styles.hint, { color: colors.textFaint }]}>
                {t('chat.detailsPrivacy')}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    margin: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryBlock: { gap: 4, marginTop: spacing.xs },
  summaryText: { textAlign: 'auto' },
  rowLabel: { flexShrink: 1 },
  rowValue: { fontVariant: ['tabular-nums'], textAlign: 'auto' },
  hint: { textAlign: 'center', marginTop: spacing.xs },
});
