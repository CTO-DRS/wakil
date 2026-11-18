// Copyright (c) 2026 DRS AI. All rights reserved.
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  I18nManager,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type AccessibilityState,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';

import { BRAND, motion, radius, spacing, type, useAppTheme } from '../theme';
import { haptic } from '../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* -------------------------------------------------------------------------- */
/* Pressable with a spring scale                                               */
/* -------------------------------------------------------------------------- */

export function PressableScale({
  children,
  style,
  scaleTo = motion.pressScale,
  hapticOnPress,
  disabled,
  onPress,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  hapticOnPress?: boolean;
}) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <AnimatedPressable
      {...rest}
      style={[style, aStyle]}
      disabled={disabled}
      onPress={(e) => {
        if (hapticOnPress) haptic.tap();
        onPress?.(e);
      }}
      onPressIn={(e) => {
        if (!reduce) s.set(withSpring(scaleTo, motion.spring));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, motion.spring));
        rest.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Glass                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Glass surface: real blur on iOS; on Android a translucent fill (a live blur of an animated
 * background is too costly on mid-range phones). Both get a hairline border and a top sheen.
 */
export function GlassSurface({
  children,
  style,
  strong,
  radiusSize = radius.lg,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
  radiusSize?: number;
}) {
  const { colors, dark } = useAppTheme();
  const fill = strong ? colors.surfaceStrong : colors.surface;
  return (
    <View
      style={[
        {
          borderRadius: radiusSize,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : fill,
        },
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView tint={dark ? 'dark' : 'light'} intensity={strong ? 60 : 35} style={StyleSheet.absoluteFill} />
      ) : null}
      {Platform.OS === 'ios' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} /> : null}
      <LinearGradient
        pointerEvents="none"
        colors={[colors.highlight, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.sheen}
      />
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <GlassSurface style={[styles.card, style]}>{children}</GlassSurface>;
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'secondary',
  disabled,
  loading,
  compact,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Spoken after the label by screen readers (what this button does). */
  accessibilityHint?: string;
  /** Merged over the built-in disabled state (checked / selected / busy). */
  accessibilityState?: AccessibilityState;
  icon?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const pad = compact ? { paddingVertical: 8, paddingHorizontal: 14, minHeight: 36 } : { paddingVertical: 13, paddingHorizontal: 22, minHeight: 50 };
  const textColor =
    variant === 'primary' ? colors.primaryText : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.primary : colors.text;
  const content = loading ? (
    <ActivityIndicator color={textColor} size="small" />
  ) : (
    <>
      {icon}
      <Text style={[compact ? type.label : type.bodyStrong, { color: textColor }]} numberOfLines={1}>
        {title}
      </Text>
    </>
  );
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), ...accessibilityState }}
      onPress={onPress}
      disabled={disabled || loading}
      hapticOnPress
      style={[{ opacity: disabled ? 0.45 : 1, borderRadius: radius.pill }, variant === 'primary' && !disabled && [styles.glow, { shadowColor: colors.shadow, backgroundColor: BRAND.to }], style]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.button, pad]}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.button,
            pad,
            variant === 'ghost'
              ? null
              : {
                  backgroundColor: variant === 'danger' ? 'transparent' : colors.surfaceAlt,
                  borderColor: variant === 'danger' ? colors.danger : colors.border,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                },
          ]}
        >
          {content}
        </View>
      )}
    </PressableScale>
  );
}

/* -------------------------------------------------------------------------- */
/* Chips, badges                                                               */
/* -------------------------------------------------------------------------- */

export function Chip({ label, onPress, selected, style }: { label: string; onPress?: () => void; selected?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      hapticOnPress
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.surfaceAlt : colors.surface, borderColor: selected ? colors.primary : colors.border },
        style,
      ]}
    >
      <Text style={[type.callout, { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'primary';

export function StatusChip({ label, tone = 'neutral', dot = true }: { label: string; tone?: StatusTone; dot?: boolean }) {
  const { colors } = useAppTheme();
  const c =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : tone === 'primary' ? colors.primary : colors.textMuted;
  return (
    <View style={[styles.status, { borderColor: c + '55', backgroundColor: c + '1A' }]}>
      {dot ? <View style={[styles.statusDot, { backgroundColor: c }]} /> : null}
      <Text style={[type.micro, { color: c }]}>{label}</Text>
    </View>
  );
}

export function Badge({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.badge, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
      <Text style={[type.micro, { color: colors.textMuted, writingDirection: 'ltr' }]}>{label}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

export function ProgressBar({ value }: { value: number }) {
  const { colors } = useAppTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
      <LinearGradient
        colors={[BRAND.from, BRAND.to, BRAND.cyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.progressFill, { width: `${pct}%` }]}
      />
    </View>
  );
}

/** Circular gradient progress ring. `children` render in the middle. */
export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  children,
  indeterminate,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  indeterminate?: boolean;
}) {
  const { colors } = useAppTheme();
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const shown = indeterminate ? 0.25 : pct;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BRAND.cyan} />
            <Stop offset="0.5" stopColor={BRAND.to} />
            <Stop offset="1" stopColor={BRAND.from} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        {shown > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#ring)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${len} ${len}`}
            strokeDashoffset={len * (1 - shown)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.tap();
              onChange(o.value);
            }}
            style={styles.segment}
          >
            {active ? (
              <Animated.View style={StyleSheet.absoluteFill}>
                <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} />
              </Animated.View>
            ) : null}
            <Text style={[type.label, { color: active ? colors.primaryText : colors.text }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
}) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 100) / 100));
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 100) / 100));
  return (
    <View style={styles.stepper}>
      <Button title="−" compact onPress={dec} disabled={value <= min} accessibilityLabel={t('common.decrease')} />
      <Text style={[type.headline, styles.stepperValue, { color: colors.text }]}>{format ? format(value) : String(value)}</Text>
      <Button title="+" compact onPress={inc} disabled={value >= max} accessibilityLabel={t('common.increase')} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Headings & headers                                                          */
/* -------------------------------------------------------------------------- */

export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useAppTheme();
  return <Text style={[type.label, styles.sectionTitle, { color: colors.textMuted }, style]}>{children}</Text>;
}

/** Chevron that points "back" in the current layout direction. */
export function BackChevron({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}>
      <Path d="M15 5 L8 12 L15 19" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Large in-content screen title used on the tab screens (they have no native header). */
export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screenHeader, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.flex}>
        <Text style={[type.display, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={[type.callout, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  glow: {
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  sheen: { position: 'absolute', top: 0, start: 0, end: 0, height: 36 },
  card: { padding: spacing.lg, marginBottom: spacing.md },
  button: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  chip: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  badge: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: 8, paddingVertical: 2 },
  progressTrack: { height: 6, borderRadius: radius.pill, overflow: 'hidden', marginTop: spacing.sm },
  progressFill: { height: 6, borderRadius: radius.pill },
  segmented: { flexDirection: 'row', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, padding: 4 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center', overflow: 'hidden' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepperValue: { minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  sectionTitle: { marginBottom: spacing.sm, marginTop: spacing.xl, textAlign: 'auto' },
  screenHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
});
