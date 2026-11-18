// Copyright (c) 2026 DRS AI. All rights reserved.
import { useTranslation } from 'react-i18next';
import { I18nManager, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect, useState, type ReactNode } from 'react';

import { radius, spacing, type, useAppTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { PressableScale } from './ui';

/**
 * Shared numeric pad for the app lock: collects exactly `length` digits, shows
 * them as dots, and calls `onFilled` when the last digit lands. The parent owns
 * what happens next (verify, confirm, or error) and clears the entry by bumping
 * `resetKey` — the render-time adjust below avoids effects for that reset.
 * The grid and the dots stay LTR in every locale: a PIN is a code, not text.
 */
export function PinPad({
  length,
  title,
  hint,
  error,
  resetKey = 0,
  onFilled,
  onChange,
}: {
  length: number;
  title: string;
  hint?: string;
  error?: string | null;
  /** Bump to clear the entered digits (wrong PIN, restarting a step). */
  resetKey?: number;
  onFilled: (pin: string) => void;
  /** Fires on every edit so the parent can drop a stale error message. */
  onChange?: (pin: string) => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [lastReset, setLastReset] = useState(resetKey);
  const shake = useSharedValue(0);

  if (lastReset !== resetKey) {
    setLastReset(resetKey);
    setPin('');
  }

  useEffect(() => {
    if (!error) return;
    shake.value = withSequence(
      withTiming(-9, { duration: 60 }),
      withTiming(9, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
  }, [error, shake]);

  const press = (digit: string) => {
    if (pin.length >= length) return;
    const next = pin + digit;
    setPin(next);
    onChange?.(next);
    haptic.tap();
    if (next.length === length) onFilled(next);
  };

  const backspace = () => {
    if (!pin.length) return;
    const next = pin.slice(0, -1);
    setPin(next);
    onChange?.(next);
    haptic.tap();
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const rowDirection: StyleProp<ViewStyle> = { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row' };

  return (
    <View style={styles.root}>
      {title ? <Text style={[type.headline, styles.title, { color: colors.text }]}>{title}</Text> : null}
      {hint ? <Text style={[type.callout, styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}

      <Animated.View style={[styles.dots, rowDirection, shakeStyle]}>
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: colors.border },
              i < pin.length ? { backgroundColor: colors.accent, borderColor: colors.accent } : null,
            ]}
          />
        ))}
      </Animated.View>

      {error ? <Text style={[type.label, styles.error, { color: colors.danger }]}>{error}</Text> : null}

      <View style={styles.pad}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ].map((row) => (
          <View key={row[0]} style={[styles.padRow, rowDirection]}>
            {row.map((digit) => (
              <Key key={digit} label={digit} onPress={() => press(digit)} />
            ))}
          </View>
        ))}
        <View style={[styles.padRow, rowDirection]}>
          <Key onPress={backspace} disabled={!pin.length} accessibilityLabel={t('pinSetup.deleteLast')}>
            <View style={[styles.deleteGlyph, { borderColor: colors.textMuted }]}>
              <View style={[styles.deleteTick, { backgroundColor: colors.textMuted }]} />
            </View>
          </Key>
          <Key label="0" onPress={() => press('0')} />
          <View style={styles.keySpacer} />
        </View>
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
  accessibilityLabel,
  children,
}: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hapticOnPress={false}
      style={[styles.key, { backgroundColor: colors.surfaceAlt }]}
    >
      {children ?? (
        <Text style={[type.headline, { color: colors.text }]} maxFontSizeMultiplier={1.4}>
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', width: '100%' },
  title: { textAlign: 'center' },
  hint: { textAlign: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.xl },
  dots: { flexDirection: 'row', gap: 14, marginTop: spacing.xl, marginBottom: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth * 2 },
  error: { marginTop: spacing.xs, minHeight: 20 },
  pad: { flexDirection: 'column', alignItems: 'center', marginTop: spacing.lg, gap: 14 },
  padRow: { gap: 14 },
  key: {
    width: 74,
    height: 74,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySpacer: { width: 74, height: 74 },
  deleteGlyph: {
    width: 34,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 5,
  },
  deleteTick: { width: 10, height: 2, borderRadius: 1 },
});
