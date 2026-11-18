// Copyright (c) 2026 DRS AI. All rights reserved.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { confirmDialog, notify, showDialog } from '../store/dialogStore';
import { dialogIcons } from './DialogIcons';
import { radius, spacing, type, useAppTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { MAX_PROMPTS, PROMPT_BODY_MAX, PROMPT_TITLE_MAX } from '../utils/promptLimits';
import { Button, PressableScale } from './ui';
import { usePromptLibraryStore, type PromptItem } from '../store/promptLibraryStore';

type Editing = { id: string | null; title: string; body: string };

/**
 * Library of saved prompts as a modal sheet: tapping a row hands the body to
 * "onInsert" (the chat screen appends it to the draft), long-press offers edit
 * and delete. "editSeed" pre-opens the editor with a body — the "save this
 * message as a prompt" flow lands here straight in the editor.
 */
export function PromptLibraryModal({
  visible,
  onClose,
  onInsert,
  editSeed,
}: {
  visible: boolean;
  onClose: () => void;
  onInsert: (body: string) => void;
  editSeed?: { body: string } | null;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const items = usePromptLibraryStore((s) => s.items);
  const [editing, setEditing] = useState<Editing | null>(null);

  // When the modal opens with a seed, land directly in the editor. State is
  // adjusted during render instead of in an effect (project-wide pattern).
  const [prev, setPrev] = useState({ visible, editSeed });
  if (prev.visible !== visible || prev.editSeed !== editSeed) {
    setPrev({ visible, editSeed });
    if (visible && editSeed) setEditing({ id: null, title: '', body: editSeed.body });
  }

  const openRowActions = (item: PromptItem) => {
    haptic.light();
    showDialog({
      title: item.title,
      actions: [
        {
          label: t('prompts.edit'),
          icon: dialogIcons.pencil,
          tone: 'primary',
          onPress: () => setEditing({ id: item.id, title: item.title, body: item.body }),
        },
        {
          label: t('common.delete'),
          icon: dialogIcons.trash,
          destructive: true,
          onPress: () =>
            void confirmDialog({
              title: t('prompts.deleteTitle'),
              message: t('prompts.deleteBody', { name: item.title }),
              confirmLabel: t('common.delete'),
              cancelLabel: t('common.cancel'),
              destructive: true,
            }).then((ok) => {
              if (ok) usePromptLibraryStore.getState().remove(item.id);
            }),
        },
        { label: t('common.cancel'), cancel: true },
      ],
    });
  };

  const save = () => {
    if (!editing || !editing.body.trim()) return;
    const store = usePromptLibraryStore.getState();
    if (editing.id) {
      store.update(editing.id, { title: editing.title, body: editing.body });
    } else {
      const added = store.add(editing.body, editing.title);
      if (!added) {
        notify(t('prompts.full'), t('prompts.fullBody', { max: MAX_PROMPTS }), t('common.ok'));
        return;
      }
    }
    haptic.success();
    setEditing(null);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceStrong, borderColor: colors.border }]}>
          {editing ? (
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                {editing.id ? t('prompts.editTitle') : t('prompts.newTitle')}
              </Text>
              <Text style={[type.caption, styles.fieldLabel, { color: colors.textMuted }]}>{t('prompts.name')}</Text>
              <TextInput
                value={editing.title}
                onChangeText={(v) => setEditing({ ...editing, title: v })}
                placeholder={t('prompts.namePlaceholder')}
                placeholderTextColor={colors.textFaint}
                maxLength={PROMPT_TITLE_MAX}
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.input },
                ]}
              />
              <Text style={[type.caption, styles.fieldLabel, { color: colors.textMuted }]}>{t('prompts.body')}</Text>
              <TextInput
                value={editing.body}
                onChangeText={(v) => setEditing({ ...editing, body: v })}
                placeholder={t('prompts.bodyPlaceholder')}
                placeholderTextColor={colors.textFaint}
                maxLength={PROMPT_BODY_MAX}
                multiline
                textAlignVertical="top"
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.input },
                ]}
              />
              <View style={styles.rowEnd}>
                <Button title={t('common.cancel')} onPress={() => setEditing(null)} compact />
                <Button
                  title={t('common.save')}
                  onPress={save}
                  variant="primary"
                  compact
                  disabled={!editing.body.trim()}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.text }]}>{t('prompts.open')}</Text>
              {items.length === 0 ? (
                <Text style={[type.callout, styles.empty, { color: colors.textMuted }]}>{t('prompts.empty')}</Text>
              ) : (
                <>
                  <ScrollView
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    {items.map((item) => (
                      <PressableScale
                        key={item.id}
                        onPress={() => {
                          haptic.light();
                          onInsert(item.body);
                        }}
                        onLongPress={() => openRowActions(item)}
                        accessibilityRole="button"
                        accessibilityLabel={item.title}
                        style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surface }]}
                      >
                        <Text style={[type.label, { color: colors.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[type.caption, { color: colors.textMuted }]} numberOfLines={1}>
                          {item.body}
                        </Text>
                      </PressableScale>
                    ))}
                  </ScrollView>
                  <Text style={[type.caption, styles.hint, { color: colors.textFaint }]}>
                    {t('prompts.insertHint')}
                  </Text>
                </>
              )}
              <View style={styles.rowSpread}>
                <Button
                  title={t('prompts.new')}
                  onPress={() => setEditing({ id: null, title: '', body: '' })}
                  variant="primary"
                  compact
                />
                <Button title={t('common.close')} onPress={onClose} compact />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    maxHeight: '78%',
    gap: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700' },
  fieldLabel: { marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 120, paddingTop: 10, textAlignVertical: 'top' },
  rowEnd: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  rowSpread: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  empty: { textAlign: 'center', paddingVertical: spacing.xl },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.sm },
  item: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  hint: { textAlign: 'center' },
});
