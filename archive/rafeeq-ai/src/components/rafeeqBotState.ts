// Copyright (c) 2026 DRS AI. All rights reserved.
/** Pure state logic for the Rafeeq bot mascot (kept free of native imports so it is unit-testable). */

export type BotState = 'idle' | 'happy' | 'thinking' | 'speaking' | 'error' | 'downloading';

export type EyeShape = 'open' | 'happy' | 'sad' | 'narrow';

export type BotVisuals = {
  eyes: EyeShape;
  /** Eyes sweep side to side (scanning). */
  scan: boolean;
  /** Eyes follow the user's finger. */
  followFinger: boolean;
  /** Random blinking. */
  blink: boolean;
  /** Gentle floating bob. */
  float: boolean;
  /** Antenna light pulse period in ms, 0 = steady. */
  antennaPulseMs: number;
  antennaColor: 'cyan' | 'violet' | 'red';
  mouth: 'smile' | 'wave' | 'frown' | 'flat';
  /** Progress ring around the head. */
  ring: boolean;
};

const VISUALS: Record<BotState, BotVisuals> = {
  idle: { eyes: 'open', scan: false, followFinger: true, blink: true, float: true, antennaPulseMs: 2400, antennaColor: 'cyan', mouth: 'smile', ring: false },
  happy: { eyes: 'happy', scan: false, followFinger: false, blink: false, float: true, antennaPulseMs: 600, antennaColor: 'cyan', mouth: 'smile', ring: false },
  thinking: { eyes: 'narrow', scan: true, followFinger: false, blink: false, float: true, antennaPulseMs: 700, antennaColor: 'violet', mouth: 'flat', ring: false },
  speaking: { eyes: 'open', scan: false, followFinger: false, blink: true, float: true, antennaPulseMs: 1200, antennaColor: 'cyan', mouth: 'wave', ring: false },
  error: { eyes: 'sad', scan: false, followFinger: false, blink: false, float: false, antennaPulseMs: 0, antennaColor: 'red', mouth: 'frown', ring: false },
  downloading: { eyes: 'open', scan: false, followFinger: true, blink: true, float: true, antennaPulseMs: 1000, antennaColor: 'cyan', mouth: 'flat', ring: true },
};

/** Visual recipe for a state. With reduce-motion on, every looping motion is switched off. */
export function botVisuals(state: BotState, reduceMotion = false): BotVisuals {
  const v = VISUALS[state] ?? VISUALS.idle;
  if (!reduceMotion) return v;
  return { ...v, scan: false, float: false, blink: false, antennaPulseMs: 0, followFinger: false };
}

export type BotInputs = {
  /** Chat engine is generating a reply. */
  generating?: boolean;
  /** The streaming reply already has visible text. */
  streamHasText?: boolean;
  /** Model is being loaded into memory. */
  modelLoading?: boolean;
  /** Any chat / engine error is showing. */
  error?: boolean;
  /** Active download progress 0..1, or null/undefined when nothing downloads. */
  downloadProgress?: number | null;
};

/** Maps app/engine state to a mascot state. Priority: error > generating > loading > downloading > idle. */
export function deriveBotState(i: BotInputs): BotState {
  if (i.error) return 'error';
  if (i.generating) return i.streamHasText ? 'speaking' : 'thinking';
  if (i.modelLoading) return 'thinking';
  if (i.downloadProgress != null && Number.isFinite(i.downloadProgress)) return 'downloading';
  return 'idle';
}

/** Clamped eye offset (in px) toward a target point, so the eyes look at the user's finger. */
export function eyeOffset(dx: number, dy: number, max: number): { x: number; y: number } {
  'worklet';
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(dist) || dist < 1) return { x: 0, y: 0 };
  const k = Math.min(1, dist / 160);
  return { x: (dx / dist) * max * k, y: (dy / dist) * max * k };
}

/** Picks a greeting index different from the last one when possible. */
export function nextGreetingIndex(count: number, last: number | null, rand: number = Math.random()): number {
  if (count <= 1) return 0;
  const idx = Math.floor(rand * (count - 1));
  return last == null ? Math.floor(rand * count) : idx >= last ? idx + 1 : idx;
}
