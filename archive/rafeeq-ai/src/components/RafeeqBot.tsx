// Copyright (c) 2026 DRS AI. All rights reserved.
/**
 * "Rafeeq bot": the app mascot. A glassy rounded robot head in the brand gradient with cyan
 * eyes and an antenna light, drawn with react-native-svg and animated with Reanimated.
 * Static shapes live in one SVG; the moving parts (eyes, antenna light, mouth bars) are plain
 * views animated with transforms/opacity on the UI thread, which keeps it cheap on mid-range
 * Android phones. No external assets.
 */
import { useCallback, useEffect, useId, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BRAND, FONT_FAMILY, useAppTheme } from '../theme';
import { useSettingsStore } from '../store/settingsStore';
import { haptic } from '../utils/haptics';
import { useLookTarget } from './LookArea';
import { botVisuals, eyeOffset, nextGreetingIndex, type BotState, type EyeShape } from './rafeeqBotState';

export { botVisuals, deriveBotState, type BotState } from './rafeeqBotState';

const VB = 140; // viewBox size
const EYE_W = 11;
const EYE_H = 15;
const EYE_Y = 69;
const EYE_XS = [55, 85] as const;
const ANTENNA = { x: 70, y: 18, r: 5 };
const RING_R = 66;

const ANTENNA_COLORS = { cyan: BRAND.cyan, violet: '#A78BFA', red: '#F87171' } as const;

type Props = {
  state?: BotState;
  size?: number;
  /** 0..1, drawn as a ring when state is `downloading`. */
  progress?: number;
  /** Tap for a bounce, ^ ^ eyes, a haptic and a greeting bubble. */
  interactive?: boolean;
  /** Static render (no loops at all), e.g. avatars of past messages. */
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

function EyeGlyph({ shape, k }: { shape: EyeShape; k: number }) {
  const w = EYE_W * k;
  const h = EYE_H * k;
  if (shape === 'happy' || shape === 'sad') {
    const d = shape === 'happy' ? 'M2 12 L8 4 L14 12' : 'M2 5 Q8 12 14 5';
    return (
      <Svg width={w * 1.5} height={h} viewBox="0 0 16 16">
        <Path d={d} stroke={BRAND.cyan} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    );
  }
  const eh = shape === 'narrow' ? h * 0.45 : h;
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: w * 2.1,
          height: eh * 1.7,
          borderRadius: w,
          backgroundColor: BRAND.cyan,
          opacity: 0.18,
        }}
      />
      <View style={{ width: w, height: eh, borderRadius: w / 2, backgroundColor: BRAND.cyan }} />
      <View
        style={{
          position: 'absolute',
          top: (h - eh) / 2 + eh * 0.18,
          start: w * 0.22,
          width: w * 0.3,
          height: w * 0.3,
          borderRadius: w,
          backgroundColor: 'rgba(255,255,255,0.85)',
        }}
      />
    </View>
  );
}

function WaveBar({ k, delay, active }: { k: number; delay: number; active: boolean }) {
  const s = useSharedValue(0.35);
  useEffect(() => {
    if (active) {
      s.set(
        withDelay(
          delay,
          withRepeat(
            withSequence(withTiming(1, { duration: 220 }), withTiming(0.3, { duration: 260 })),
            -1,
            true,
          ),
        ),
      );
    } else {
      cancelAnimation(s);
      s.set(withTiming(0.45, { duration: 160 }));
    }
    return () => cancelAnimation(s);
  }, [active, delay, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: s.get() }] }));
  return (
    <Animated.View
      style={[{ width: 3 * k, height: 9 * k, borderRadius: 2 * k, backgroundColor: BRAND.cyan, marginHorizontal: 1.2 * k }, style]}
    />
  );
}

export function RafeeqBot({
  state = 'idle',
  size = 160,
  progress = 0,
  interactive = false,
  animated = true,
  style,
  accessibilityLabel,
}: Props) {
  const { t } = useTranslation();
  const { dark } = useAppTheme();
  const reduceMotion = useReducedMotion();
  // The user's decorative-motion switch joins the OS reduced-motion setting.
  const animatedSetting = useSettingsStore((s) => s.animated);
  const look = useLookTarget();
  const [tapHappy, setTapHappy] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const lastGreeting = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<ComponentRef<typeof View>>(null);

  const effective: BotState = tapHappy ? 'happy' : state;
  const v = botVisuals(effective, reduceMotion || !animated || !animatedSetting);
  const k = size / VB;
  const uid = `rb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const floatY = useSharedValue(0);
  const bounce = useSharedValue(1);
  const jump = useSharedValue(0);
  const blink = useSharedValue(1);
  const scanX = useSharedValue(0);
  const antenna = useSharedValue(1);
  const cx = useSharedValue(-1);
  const cy = useSharedValue(-1);

  // Floating bob.
  useEffect(() => {
    if (v.float) {
      floatY.set(
        withRepeat(
          withSequence(
            withTiming(-4 * k, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
            withTiming(4 * k, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(floatY);
      floatY.set(withTiming(0, { duration: 300 }));
    }
    return () => cancelAnimation(floatY);
  }, [v.float, k, floatY]);

  // Eye scanning (thinking).
  useEffect(() => {
    if (v.scan) {
      scanX.set(
        withRepeat(
          withSequence(withTiming(-5 * k, { duration: 480 }), withTiming(5 * k, { duration: 480 })),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(scanX);
      scanX.set(withTiming(0, { duration: 200 }));
    }
    return () => cancelAnimation(scanX);
  }, [v.scan, k, scanX]);

  // Antenna pulse.
  useEffect(() => {
    if (v.antennaPulseMs > 0) {
      antenna.set(
        withRepeat(
          withSequence(
            withTiming(0.35, { duration: v.antennaPulseMs / 2 }),
            withTiming(1, { duration: v.antennaPulseMs / 2 }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(antenna);
      antenna.set(1);
    }
    return () => cancelAnimation(antenna);
  }, [v.antennaPulseMs, antenna]);

  // Random blinking.
  useEffect(() => {
    if (!v.blink) {
      blink.set(1);
      return;
    }
    let handle: ReturnType<typeof setTimeout>;
    const schedule = () => {
      handle = setTimeout(() => {
        blink.set(withSequence(withTiming(0.1, { duration: 70 }), withTiming(1, { duration: 110 })));
        schedule();
      }, 2200 + Math.random() * 3800);
    };
    schedule();
    return () => clearTimeout(handle);
  }, [v.blink, blink]);

  // Measure our centre in window coordinates so the eyes can look at the finger.
  const measure = useCallback(() => {
    containerRef.current?.measureInWindow((x, y, w, h) => {
      cx.set(x + w / 2);
      cy.set(y + h / 2);
    });
  }, [cx, cy]);
  useEffect(() => (look && v.followFinger ? look.subscribe(measure) : undefined), [look, v.followFinger, measure]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const lookX = look?.x;
  const lookY = look?.y;
  const lookActive = look?.active;
  const follow = v.followFinger;
  const maxEye = 6 * k;

  const eyesStyle = useAnimatedStyle(() => {
    let ox = 0;
    let oy = 0;
    const a = lookActive ? (lookActive as SharedValue<number>).get() : 0;
    if (follow && lookX && lookY && a > 0 && cx.get() >= 0) {
      const o = eyeOffset(lookX.get() - cx.get(), lookY.get() - cy.get(), maxEye);
      ox = o.x * a;
      oy = o.y * a;
    }
    return {
      transform: [
        { translateX: withSpring(ox + scanX.get(), { damping: 16, stiffness: 180 }) },
        { translateY: withSpring(oy, { damping: 16, stiffness: 180 }) },
      ],
    };
  });
  const eyeBlinkStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.get() }] }));
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.get() + jump.get() }, { scale: bounce.get() }],
  }));
  const antennaStyle = useAnimatedStyle(() => ({ opacity: antenna.get() }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: antenna.get() * 0.45, transform: [{ scale: 0.8 + antenna.get() * 0.5 }] }));

  const greetings = t('bot.greetings', { returnObjects: true }) as unknown;
  const onTap = () => {
    haptic.light();
    if (!reduceMotion) {
      bounce.set(withSequence(withSpring(1.12, { damping: 6, stiffness: 320 }), withSpring(1, { damping: 10, stiffness: 200 })));
      jump.set(withSequence(withTiming(-14 * k, { duration: 160 }), withSpring(0, { damping: 7, stiffness: 220 })));
    }
    const list = Array.isArray(greetings) ? (greetings as string[]) : [];
    if (list.length) {
      const idx = nextGreetingIndex(list.length, lastGreeting.current);
      lastGreeting.current = idx;
      setGreeting(list[idx]);
    }
    setTapHappy(true);
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(() => setTapHappy(false), 1300), setTimeout(() => setGreeting(null), 2600)];
  };

  const ringLen = 2 * Math.PI * RING_R;
  const pct = Math.max(0, Math.min(1, progress));
  const antennaColor = ANTENNA_COLORS[v.antennaColor];
  const visor = dark ? '#070815' : '#0D1030';

  const art = (
    <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
      <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={`${uid}h`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#8B5CF6" />
            <Stop offset="0.55" stopColor="#6D4BEF" />
            <Stop offset="1" stopColor="#2563EB" />
          </SvgGradient>
          <SvgGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </SvgGradient>
          <RadialGradient id={`${uid}g`} cx="50%" cy="55%" r="50%">
            <Stop offset="0" stopColor="#7C3AED" stopOpacity={dark ? 0.55 : 0.35} />
            <Stop offset="0.6" stopColor="#2563EB" stopOpacity={dark ? 0.18 : 0.12} />
            <Stop offset="1" stopColor="#22D3EE" stopOpacity="0" />
          </RadialGradient>
          <SvgGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#22D3EE" />
            <Stop offset="1" stopColor="#7C3AED" />
          </SvgGradient>
        </Defs>
        <Ellipse cx={70} cy={76} rx={68} ry={62} fill={`url(#${uid}g)`} />
        {v.ring ? (
          <>
            <Circle cx={70} cy={73} r={RING_R} stroke={dark ? 'rgba(255,255,255,0.12)' : 'rgba(30,24,80,0.12)'} strokeWidth={3} fill="none" />
            <Circle
              cx={70}
              cy={73}
              r={RING_R}
              stroke={`url(#${uid}r)`}
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${ringLen} ${ringLen}`}
              strokeDashoffset={ringLen * (1 - pct)}
              transform="rotate(-90 70 73)"
            />
          </>
        ) : null}
        <Rect x={68.5} y={21} width={3} height={14} rx={1.5} fill="#A78BFA" />
        <Rect x={15} y={58} width={10} height={30} rx={5} fill="#5B45E0" />
        <Rect x={115} y={58} width={10} height={30} rx={5} fill="#3157E6" />
        <Rect x={24} y={34} width={92} height={78} rx={30} fill={`url(#${uid}h)`} />
        <Rect x={24.5} y={34.5} width={91} height={77} rx={29.5} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
        <Rect x={34} y={38} width={72} height={18} rx={9} fill={`url(#${uid}s)`} />
        <Rect x={34} y={50} width={72} height={46} rx={20} fill={visor} opacity={0.92} />
        <Rect x={34.5} y={50.5} width={71} height={45} rx={19.5} fill="none" stroke="rgba(34,211,238,0.28)" strokeWidth={1} />
        {v.mouth === 'smile' ? (
          <Path d="M63 86 Q70 91 77 86" stroke={BRAND.cyan} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.9} />
        ) : v.mouth === 'frown' ? (
          <Path d="M63 89 Q70 84 77 89" stroke={BRAND.cyan} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.9} />
        ) : v.mouth === 'flat' ? (
          <Rect x={64} y={86.5} width={12} height={2.4} rx={1.2} fill={BRAND.cyan} opacity={0.8} />
        ) : null}
      </Svg>

      {/* Antenna light with halo */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            start: (ANTENNA.x - ANTENNA.r * 2.4) * k,
            top: (ANTENNA.y - ANTENNA.r * 2.4) * k,
            width: ANTENNA.r * 4.8 * k,
            height: ANTENNA.r * 4.8 * k,
            borderRadius: ANTENNA.r * 4.8 * k,
            backgroundColor: antennaColor,
          },
          haloStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            start: (ANTENNA.x - ANTENNA.r) * k,
            top: (ANTENNA.y - ANTENNA.r) * k,
            width: ANTENNA.r * 2 * k,
            height: ANTENNA.r * 2 * k,
            borderRadius: ANTENNA.r * 2 * k,
            backgroundColor: antennaColor,
          },
          antennaStyle,
        ]}
      />

      {/* Eyes: the face is symmetric, so RTL mirroring is harmless; look offsets are physical. */}
      <Animated.View pointerEvents="none" style={[styles.abs, { start: 0, top: 0, width: size, height: size }, eyesStyle]}>
        {EYE_XS.map((ex) => {
          const glyphW = v.eyes === 'happy' || v.eyes === 'sad' ? EYE_W * 1.5 : EYE_W;
          return (
            <Animated.View
              key={ex}
              style={[
                styles.abs,
                { start: (ex - glyphW / 2) * k, top: (EYE_Y - EYE_H / 2) * k, alignItems: 'center', justifyContent: 'center' },
                v.eyes === 'open' || v.eyes === 'narrow' ? eyeBlinkStyle : null,
              ]}
            >
              <EyeGlyph shape={v.eyes} k={k} />
            </Animated.View>
          );
        })}
      </Animated.View>

      {v.mouth === 'wave' ? (
        <View pointerEvents="none" style={[styles.abs, styles.wave, { start: 0, width: size, top: 82 * k, height: 10 * k }]}>
          {[0, 90, 180, 60, 150].map((d, i) => (
            <WaveBar key={i} k={k} delay={d} active={!reduceMotion && animated} />
          ))}
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <View
      ref={containerRef}
      onLayout={measure}
      style={[{ width: size, height: size }, style]}
      accessible={!interactive}
      accessibilityLabel={accessibilityLabel ?? t('bot.label')}
    >
      {interactive ? (
        <Pressable onPress={onTap} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? t('bot.tapHint')}>
          {art}
        </Pressable>
      ) : (
        art
      )}
      {greeting ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(220)}
          pointerEvents="none"
          style={[styles.bubble, { bottom: size * 0.98, backgroundColor: dark ? 'rgba(20,22,40,0.92)' : 'rgba(255,255,255,0.95)' }]}
        >
          <Text style={[styles.bubbleText, { color: dark ? '#F4F3FF' : '#14122B' }]} numberOfLines={2}>
            {greeting}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  wave: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  bubble: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 240,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34,211,238,0.45)',
  },
  bubbleText: { fontFamily: FONT_FAMILY, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
});
