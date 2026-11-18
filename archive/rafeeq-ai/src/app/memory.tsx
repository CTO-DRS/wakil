// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The memory screen — the user's window into what Rafeeq remembers. Every
 * record is readable, editable and deletable, and "forget everything" wipes
 * the shelf in one tap: the competition's data-protection rule made
 * user-owned memory, not just claimed it.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMemoryStore, MEMORY_KINDS, type MemoryKind } from '../agent/memory';
import { BackChevron, Button, GlassSurface, PressableScale, Segmented } from '../components/ui';
import { TextPromptModal } from '../components/TextPromptModal';
import { goBack } from '../navigation/goBack';
import { confirmDialog, notify } from '../store/dialogStore';
import { radius, spacing, type, useAppTheme } from '../theme';

const KIND_KEYS: Record<MemoryKind, string> = {
  preference: 'memory.kindPreference',
  person: 'memory.kindPerson',
  routine: 'memory.kindRoutine',
  fact: 'memory.kindFact',
};

function MemoryRow({
  text,
  onEdit,
  onDelete,
  kindLabel,
  sourceLabel,
}: {
  text: string;
  onEdit: () => void;
  onDelete: () => void;
  kindLabel: string;
  sourceLabel: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.rowWrap}>
      <GlassSurface style={styles.row}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: 'rgba(128,128,128,0.12)' }]}>
            <Text style={[type.caption, { color: colors.accent }]}>{kindLabel}</Text>
          </View>
          <Text style={[type.caption, styles.flex1, { color: colors.textFaint }]}>{sourceLabel}</Text>
        </View>
        <Text style={[type.body, styles.auto, styles.rowText, { color: colors.text }]}>{text}</Text>
        <View style={styles.rowActions}>
          <PressableScale onPress={onEdit} accessibilityRole="button" accessibilityLabel={kindLabel} style={styles.action}>
            <Text style={[type.caption, { color: colors.accent }]}>{'✎'}</Text>
          </PressableScale>
          <PressableScale onPress={onDelete} accessibilityRole="button" accessibilityLabel={sourceLabel} style={styles.action}>
            <Text style={[type.caption, { color: colors.danger }]}>{'🗑'}</Text>
          </PressableScale>
        </View>
      </GlassSurface>
    </View>
  );
}

export default function MemoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const memories = useMemoryStore((s) => s.memories);
  const updateMemory = useMemoryStore((s) => s.updateMemory);
  const deleteMemory = useMemoryStore((s) => s.deleteMemory);
  const clearMemories = useMemoryStore((s) => s.clearMemories);
  const upsertMemory = useMemoryStore((s) => s.upsertMemory);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftKind, setDraftKind] = useState<MemoryKind>('fact');

  const kindLabels = useMemo(
    () => Object.fromEntries(MEMORY_KINDS.map((k) => [k, t(KIND_KEYS[k])])) as Record<MemoryKind, string>,
    [t],
  );
  const sourceLabel = (source: 'agent' | 'user') =>
    source === 'agent' ? t('memory.sourceAgent') : t('memory.sourceUser');

  const openAdd = () => {
    setEditingId(null);
    setDraftText('');
    setDraftKind('fact');
    setModalVisible(true);
  };
  const openEdit = (id: string, text: string, kind: MemoryKind) => {
    setEditingId(id);
    setDraftText(text);
    setDraftKind(kind);
    setModalVisible(true);
  };
  const submitModal = () => {
    const text = draftText.trim();
    if (!text) return;
    if (editingId) {
      updateMemory(editingId, { text, kind: draftKind });
      notify(t('memory.title'), t('memory.saved'));
    } else {
      upsertMemory({
        id: `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
        kind: draftKind,
        text,
        source: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      notify(t('memory.title'), t('memory.saved'));
    }
    setModalVisible(false);
  };
  const onDelete = async (id: string, text: string) => {
    const ok = await confirmDialog({
      title: t('memory.deleteTitle'),
      message: t('memory.deleteBody', { text }),
      confirmLabel: t('memory.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) {
      deleteMemory(id);
      notify(t('memory.title'), t('memory.deleted'));
    }
  };
  const onClearAll = async () => {
    const ok = await confirmDialog({
      title: t('memory.clearTitle'),
      message: t('memory.clearBody', { count: memories.length }),
      confirmLabel: t('memory.clearAll'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) clearMemories();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <PressableScale onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel={t('chat.back')} hitSlop={10}>
          <BackChevron color={colors.text} />
        </PressableScale>
        <Text style={[type.title, styles.auto, styles.headerTitle, { color: colors.text }]}>{t('memory.title')}</Text>
      </View>
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        ListHeaderComponent={
          <View>
            <Text style={[type.caption, styles.auto, { color: colors.textMuted }]}>{t('memory.subtitle')}</Text>
            <Text style={[type.caption, styles.auto, styles.kindTitle, { color: colors.text }]}>{t('memory.kind')}</Text>
            <Segmented<MemoryKind>
              value={draftKind}
              onChange={(k) => setDraftKind(k)}
              options={MEMORY_KINDS.map((k) => ({ value: k, label: kindLabels[k] }))}
            />
            <View style={styles.addRow}>
              <Button title={t('memory.add')} compact variant="primary" onPress={openAdd} />
            </View>
          </View>
        }
        data={memories}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MemoryRow
            text={item.text}
            kindLabel={kindLabels[item.kind]}
            sourceLabel={sourceLabel(item.source)}
            onEdit={() => openEdit(item.id, item.text, item.kind)}
            onDelete={() => void onDelete(item.id, item.text)}
          />
        )}
        ListEmptyComponent={
          <Text style={[type.body, styles.auto, styles.empty, { color: colors.textMuted }]}>{t('memory.empty')}</Text>
        }
        ListFooterComponent={memories.length > 0 ? <View style={styles.clearRow}><Button title={t('memory.clearAll')} compact variant="ghost" onPress={() => void onClearAll()} /></View> : undefined}
      />
      <TextPromptModal
        visible={modalVisible}
        title={editingId ? t('memory.editTitle') : t('memory.addTitle')}
        initialValue={draftText}
        multiline
        maxLength={500}
        onCancel={() => setModalVisible(false)}
        onSubmit={submitModal}
        hint={`${t('memory.kind')}: ${kindLabels[draftKind]}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  headerTitle: { marginStart: spacing.sm, flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  auto: { textAlign: 'auto', writingDirection: 'auto' },
  addRow: { marginTop: spacing.md },
  rowWrap: { marginTop: spacing.md },
  row: { padding: spacing.md, borderRadius: radius.lg },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, overflow: 'hidden' },
  flex1: { flex: 1 },
  rowText: { marginTop: spacing.sm },
  rowActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, justifyContent: 'flex-end' },
  action: { padding: spacing.xs },
  empty: { marginTop: spacing.xl },
  clearRow: { marginTop: spacing.lg, alignItems: 'flex-start' },
  kindTitle: { marginTop: spacing.lg, marginBottom: spacing.xs },
});
