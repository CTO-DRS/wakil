// Copyright (c) 2026 DRS AI. All rights reserved.
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

export type LookTarget = {
  /** Finger position in window coordinates. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 1 while a finger is down (animated toward 0 on release). */
  active: SharedValue<number>;
  /** Called on every touch start so mascots can re-measure their own position. */
  subscribe: (fn: () => void) => () => void;
};

const LookContext = createContext<LookTarget | null>(null);

export function useLookTarget(): LookTarget | null {
  return useContext(LookContext);
}

/**
 * Tracks the user's finger anywhere inside it without stealing touches (it never becomes the
 * responder), so a Rafeeq bot inside can follow it with its eyes.
 */
export function LookArea({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const active = useSharedValue(0);
  const listeners = useRef(new Set<() => void>());

  const subscribe = useCallback((fn: () => void) => {
    const set = listeners.current;
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }, []);

  const value = useMemo<LookTarget>(() => ({ x, y, active, subscribe }), [x, y, active, subscribe]);

  const onStart = (e: GestureResponderEvent) => {
    listeners.current.forEach((fn) => fn());
    x.set(e.nativeEvent.pageX);
    y.set(e.nativeEvent.pageY);
    active.set(withTiming(1, { duration: 120 }));
  };
  const onMove = (e: GestureResponderEvent) => {
    x.set(e.nativeEvent.pageX);
    y.set(e.nativeEvent.pageY);
  };
  const onEnd = () => {
    active.set(withTiming(0, { duration: 600 }));
  };

  return (
    <LookContext.Provider value={value}>
      <View style={style} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        {children}
      </View>
    </LookContext.Provider>
  );
}
