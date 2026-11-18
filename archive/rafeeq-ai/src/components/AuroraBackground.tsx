// Copyright (c) 2026 DRS AI. All rights reserved.
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useAppTheme } from '../theme';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Deep-space backdrop: a near-black (or pearl) base with three soft aurora blobs drifting
 * slowly. The blobs are SVG radial gradients (soft by construction, no blur pass), moved
 * with UI-thread transforms only, so it costs almost nothing per frame.
 */
function Blob({ color, size, x, y, duration, dx, dy, opacity, animate, id }: {
  color: string;
  size: number;
  x: number;
  y: number;
  duration: number;
  dx: number;
  dy: number;
  opacity: number;
  animate: boolean;
  id: string;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (animate) p.set(withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
    else {
      cancelAnimation(p);
      p.set(0.5);
    }
    return () => cancelAnimation(p);
  }, [animate, duration, p]);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: (p.get() - 0.5) * dx },
      { translateY: (p.get() - 0.5) * dy },
      { scale: 0.9 + p.get() * 0.2 },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.blob, { width: size, height: size, start: x - size / 2, top: y - size / 2 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

export function AuroraBackground() {
  const { colors, dark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  // The user's decorative-motion switch (onboarding › personalize) joins the
  // OS-level reduced-motion preference: either one stops the blobs.
  const animatedSetting = useSettingsStore((s) => s.animated);
  const animate = !reduceMotion && animatedSetting;
  const o = colors.auroraOpacity;
  const big = Math.max(width, height) * 0.95;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, overflow: 'hidden' }]}>
      <Blob id="a1" color={colors.aurora[0]} size={big} x={width * 0.15} y={height * 0.12} duration={11000} dx={width * 0.35} dy={height * 0.12} opacity={o} animate={animate} />
      <Blob id="a2" color={colors.aurora[1]} size={big * 0.9} x={width * 0.95} y={height * 0.45} duration={14000} dx={-width * 0.3} dy={height * 0.18} opacity={o * 0.85} animate={animate} />
      <Blob id="a3" color={colors.aurora[2]} size={big * 0.7} x={width * 0.3} y={height * 0.92} duration={17000} dx={width * 0.4} dy={-height * 0.1} opacity={o * (dark ? 0.45 : 0.6)} animate={animate} />
      {/* Fine veil so text keeps contrast over the brightest part of the aurora. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(5,6,10,0.28)' : 'rgba(243,242,249,0.25)' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute' },
});
