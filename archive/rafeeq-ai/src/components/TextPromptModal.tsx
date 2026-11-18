// Copyright (c) 2026 DRS AI. All rights reserved.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, spacing, useAppTheme } from '../theme';
import { Button } from './ui';

/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function TextPromptModal({
  visible,
  title,
  initialValue,
  onCancel,
  onSubmit,
  multiline = false,
  maxLength = 120,
  allowEmpty = false,
  hint,
}: {
  visible: boolean;
  title: string;
  initialValue: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
  /** Growing input for longer texts (custom instructions) instead of one line. */
  multiline?: boolean;
  maxLength?: number;
  /** Allow submitting an empty value (clearing an override is meaningful). */
  allowEmpty?: boolean;
  hint?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [value, setValue] = useState(initialValue);
  // Reset the field whenever the modal opens or the initial value changes
  // (state adjusted during render instead of in an effect).
  const [prev, setPrev] = useState({ visible, initialValue });
  if (prev.visible !== visible || prev.initialValue !== initialValue) {
    setPrev({ visible, initialValue });
    if (visible) setValue(initialValue);
  }

  const submit = () => {
    if (!allowEmpty && !value.trim()) return;
    onSubmit(value);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={t('common.cancel')} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            maxLength={maxLength}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            style={[
              styles.input,
              multiline && styles.inputMultiline,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.input },
            ]}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={multiline ? undefined : submit}
            returnKeyType={multiline ? 'default' : 'done'}
          />
          <View style={styles.row}>
            <Button title={t('common.cancel')} onPress={onCancel} compact />
            <Button
              title={t('common.save')}
              onPress={submit}
              variant="primary"
              compact
              disabled={!allowEmpty && !value.trim()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  sheet: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  title: { fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  hint: { fontSize: 13, marginTop: -spacing.sm, marginBottom: spacing.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16 },
  inputMultiline: { minHeight: 120, paddingTop: 10, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
});
