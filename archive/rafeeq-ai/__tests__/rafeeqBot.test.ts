// Copyright (c) 2026 DRS AI. All rights reserved.
import { botVisuals, deriveBotState, eyeOffset, nextGreetingIndex, type BotState } from '../src/components/rafeeqBotState';
import { resources } from '../src/i18n';

describe('Rafeeq bot state mapping', () => {
  it('maps engine state with error > generating > loading > downloading > idle', () => {
    expect(deriveBotState({})).toBe('idle');
    expect(deriveBotState({ downloadProgress: 0.4 })).toBe('downloading');
    expect(deriveBotState({ downloadProgress: null })).toBe('idle');
    expect(deriveBotState({ modelLoading: true, downloadProgress: 0.4 })).toBe('thinking');
    expect(deriveBotState({ generating: true })).toBe('thinking');
    expect(deriveBotState({ generating: true, streamHasText: true })).toBe('speaking');
    expect(deriveBotState({ generating: true, streamHasText: true, error: true })).toBe('error');
    expect(deriveBotState({ error: true, downloadProgress: 0.9 })).toBe('error');
  });

  it('gives each state its visual recipe', () => {
    expect(botVisuals('idle')).toMatchObject({ eyes: 'open', blink: true, float: true, followFinger: true, mouth: 'smile', ring: false });
    expect(botVisuals('happy')).toMatchObject({ eyes: 'happy' });
    expect(botVisuals('thinking')).toMatchObject({ scan: true, followFinger: false, antennaColor: 'violet' });
    expect(botVisuals('thinking').antennaPulseMs).toBeGreaterThan(0);
    expect(botVisuals('speaking')).toMatchObject({ mouth: 'wave' });
    expect(botVisuals('error')).toMatchObject({ eyes: 'sad', mouth: 'frown', antennaColor: 'red', float: false });
    expect(botVisuals('downloading')).toMatchObject({ ring: true });
  });

  it('switches every loop off with reduce-motion but keeps the state readable', () => {
    const states: BotState[] = ['idle', 'happy', 'thinking', 'speaking', 'error', 'downloading'];
    for (const s of states) {
      const v = botVisuals(s, true);
      expect(v).toMatchObject({ scan: false, float: false, blink: false, antennaPulseMs: 0, followFinger: false });
      expect(v.eyes).toBe(botVisuals(s).eyes);
      expect(v.ring).toBe(botVisuals(s).ring);
      expect(v.mouth).toBe(botVisuals(s).mouth);
    }
  });

  it('clamps eye offsets toward the finger', () => {
    expect(eyeOffset(0, 0, 6)).toEqual({ x: 0, y: 0 });
    const far = eyeOffset(1000, 0, 6);
    expect(far.x).toBeCloseTo(6);
    expect(far.y).toBeCloseTo(0);
    const near = eyeOffset(0, -40, 6);
    expect(near.y).toBeLessThan(0);
    expect(Math.abs(near.y)).toBeLessThan(6);
  });

  it('never repeats the previous greeting', () => {
    for (let last = 0; last < 5; last++) {
      for (const r of [0, 0.2, 0.5, 0.79, 0.999]) {
        const i = nextGreetingIndex(5, last, r);
        expect(i).not.toBe(last);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(5);
      }
    }
    expect(nextGreetingIndex(1, 0)).toBe(0);
  });

  it('has the same number of greetings in Arabic and English', () => {
    expect(resources.ar.translation.bot.greetings.length).toBe(resources.en.translation.bot.greetings.length);
    expect(resources.en.translation.bot.greetings.length).toBeGreaterThanOrEqual(3);
  });
});
