// Copyright (c) 2026 DRS AI. All rights reserved.
import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export type NativeProbe = { finalUrl: string; totalBytes: number; acceptRanges: boolean };
export type NativeSegmentArgs = {
  taskId: string;
  segmentId: number;
  url: string;
  path: string;
  start: number;
  pos: number;
  end: number;
  maxRetries: number;
};
export type NativeProgressEvent = { taskId: string; positions: { id: number; pos: number }[] };

export type RafeeqFastDlNative = {
  probe(url: string): Promise<NativeProbe>;
  preallocate(path: string, size: number): Promise<void>;
  runSegment(args: NativeSegmentArgs): Promise<{ completed: boolean; pos: number }>;
  setSegmentEnd(taskId: string, segmentId: number, newEnd: number): boolean;
  stopTask(taskId: string): void;
  startKeepAlive(key: string, title: string): boolean;
  updateKeepAlive(key: string, title: string, percent: number): void;
  stopKeepAlive(key: string): void;
  requestNotificationPermission(): Promise<boolean>;
  addListener(event: 'onProgress', listener: (e: NativeProgressEvent) => void): EventSubscription;
};

/** The native fast-download module, or null where it is not linked (Expo Go, iOS, tests). */
export const RafeeqFastDl: RafeeqFastDlNative | null = requireOptionalNativeModule<RafeeqFastDlNative>('RafeeqFastDl');
