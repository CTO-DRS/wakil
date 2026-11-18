// Copyright (c) 2026 DRS AI. All rights reserved.
import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export type NativeMemoryInfo = {
  availMem: number;
  totalMem: number;
  threshold: number;
  lowMemory: boolean;
};

type RafeeqMemoryNative = {
  getMemoryInfo(): NativeMemoryInfo;
  addListener(event: 'onTrimMemory', listener: (e: { level: number }) => void): EventSubscription;
};

const native = requireOptionalNativeModule<RafeeqMemoryNative>('RafeeqMemory');

/** Returns live RAM info on Android, or null when the native module is unavailable. */
export function getMemoryInfo(): NativeMemoryInfo | null {
  if (!native) return null;
  try {
    return native.getMemoryInfo();
  } catch {
    return null;
  }
}

/** Subscribes to Android onTrimMemory levels. No-op where unsupported. */
export function addTrimMemoryListener(listener: (level: number) => void): { remove(): void } {
  if (!native) return { remove() {} };
  const sub = native.addListener('onTrimMemory', (e) => listener(e.level));
  return { remove: () => sub.remove() };
}
