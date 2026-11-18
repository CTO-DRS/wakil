// Copyright (c) 2026 DRS AI. All rights reserved.
import type { BottomTabBarProps } from 'expo-router/tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { BRAND, radius, spacing, TAB_BAR_HEIGHT, TAB_BAR_MARGIN, type, useAppTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { PressableScale } from './ui';

export function TabIcon({ name, color, size = 22 }: { name: string; color: string; size?: number }) {
  const common = { stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'index' ? (
        <>
          <Path d="M4 6.5C4 5.1 5.1 4 6.5 4h11C18.9 4 20 5.1 20 6.5v7c0 1.4-1.1 2.5-2.5 2.5H10l-4.2 3.4c-.5.4-1.3 0-1.3-.6V16.6C4.2 16.2 4 15.9 4 15.5z" {...common} />
          <Circle cx={9} cy={10} r={1.1} fill={color} />
          <Circle cx={15} cy={10} r={1.1} fill={color} />
        </>
      ) : name === 'models' ? (
        <>
          <Rect x={6} y={6} width={12} height={12} rx={3} {...common} />
          <Rect x={9.5} y={9.5} width={5} height={5} rx={1.2} {...common} />
          <Path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" {...common} />
        </>
      ) : (
        <>
          <Path d="M5 7h9M18 7h1M5 17h1M10 17h9M5 12h4M13 12h6" {...common} />
          <Circle cx={16} cy={7} r={2} {...common} />
          <Circle cx={8} cy={17} r={2} {...common} />
          <Circle cx={11} cy={12} r={2} {...common} />
        </>
      )}
    </Svg>
  );
}

/** Floating glass tab bar. Positioned absolutely so screens scroll underneath it. */
export function GlassTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, dark } = useAppTheme();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_MARGIN }]}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.surfaceStrong,
            borderColor: colors.border,
            shadowColor: dark ? '#000' : BRAND.from,
          },
        ]}
        accessibilityRole="tablist"
      >
        <LinearGradient
          pointerEvents="none"
          colors={[colors.highlight, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.sheen}
        />
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const options = descriptors[route.key]?.options ?? {};
          const label = typeof options.title === 'string' ? options.title : route.name;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              haptic.tap();
              navigateToTab(route.key);
            }
          };
          const tint = focused ? '#FFFFFF' : colors.textMuted;
          return (
            <PressableScale
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.item}
            >
              {focused ? (
                <Animated.View entering={FadeIn.duration(180)} style={StyleSheet.absoluteFill}>
                  <LinearGradient colors={BRAND.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activePill} />
                </Animated.View>
              ) : null}
              <TabIcon name={route.name} color={tint} />
              <Text style={[type.micro, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: spacing.lg, end: spacing.lg },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
    elevation: 12,
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  sheen: { position: 'absolute', top: 0, start: 0, end: 0, height: 24 },
  item: { flex: 1, height: TAB_BAR_HEIGHT - 12, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.lg },
  activePill: { flex: 1, borderRadius: radius.lg },
});
