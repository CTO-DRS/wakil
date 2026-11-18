// Copyright (c) 2026 DRS AI. All rights reserved.
import { CATALOG, VOICE_MODELS } from '../src/models/catalog';
import { REASONING_GOALS } from '../src/onboarding/goals';
import { DEFAULT_PROFILE } from '../src/onboarding/profile';
import { resources } from '../src/i18n';
import {
  DEFAULT_TRACK,
  GOAL_TRACKS,
  integratedChatModels,
  pickModel,
  recommend,
  tracksForGoals,
  type RecommendInput,
} from '../src/onboarding/recommendation';

const GB = 1024 * 1024 * 1024;
const LIGHT = 'qwen2.5-0.5b-instruct-q4_k_m';
const STRONG = 'qwen2.5-1.5b-instruct-q4_k_m';
const MID_1 = 'llama-3.2-1b-instruct-q4_k_m';
const MID_2 = 'gemma-3-1b-it-q4_k_m';

function input(over: Partial<RecommendInput> = {}): RecommendInput {
  return {
    profile: { ...DEFAULT_PROFILE, goals: ['chat'] },
    ramBytes: 8 * GB,
    diskBytes: 64 * GB,
    nCtx: 2048,
    ...over,
  };
}

describe('goal → track mapping', () => {
  it('covers all thirteen goals exactly once each', () => {
    const mapped = GOAL_TRACKS.map((g) => g.goal).sort();
    expect(mapped).toEqual([
      'apps',
      'chat',
      'coding',
      'data',
      'documents',
      'free',
      'image',
      'learning',
      'multi',
      'productivity',
      'security',
      'video',
      'writing',
    ]);
  });

  it('orders tracks by user goal order (first pick wins)', () => {
    expect(tracksForGoals(['security', 'coding'])).toEqual(['security', 'coding']);
    expect(tracksForGoals(['image', 'productivity'])).toEqual(['creative', 'assistant']);
  });

  it('falls back to the chat track when nothing was picked', () => {
    expect(tracksForGoals([])).toEqual([]);
    expect(DEFAULT_TRACK).toBe('chat');
    expect(recommend(input({ profile: { ...DEFAULT_PROFILE, goals: [] } })).trackId).toBe('chat');
  });
});

describe('pickModel (the honest device fit)', () => {
  it('auto aims for the strongest model that fits generous RAM', () => {
    expect(pickModel({ preference: null, modelWeight: 'auto', ramBytes: 8 * GB, diskBytes: null, nCtx: 2048 }).modelId).toBe(STRONG);
  });

  it('speed prefers the lightest model even on big phones', () => {
    expect(pickModel({ preference: 'speed', modelWeight: 'auto', ramBytes: 8 * GB, diskBytes: null, nCtx: 2048 }).modelId).toBe(LIGHT);
  });

  it('downgrades when RAM cannot hold the strongest model', () => {
    // The strong model needs ~1.41 GB at nCtx 2048; 800 MB fails it outright
    // (below the tight threshold) while the light one (~754 MB) still fits.
    const res = pickModel({ preference: null, modelWeight: 'auto', ramBytes: 800 * 1024 * 1024, diskBytes: null, nCtx: 2048 });
    expect(res.ramDowngraded).toBe(true);
    expect(res.modelId).not.toBe(STRONG);
  });

  it('falls back to the lightest model when nothing strictly fits', () => {
    const res = pickModel({ preference: null, modelWeight: 'auto', ramBytes: 300 * 1024 * 1024, diskBytes: null, nCtx: 4096 });
    expect(res.modelId).toBe(LIGHT);
    expect(res.ramDowngraded).toBe(true);
  });

  it('respects the disk gate when free space is known', () => {
    const res = pickModel({ preference: null, modelWeight: 'auto', ramBytes: 8 * GB, diskBytes: 900 * 1024 * 1024, nCtx: 2048 });
    expect(res.diskDowngraded).toBe(true);
    expect(res.modelId).not.toBe(STRONG);
  });

  it('never invents a model outside the catalog', () => {
    const ids = new Set(integratedChatModels().map((m) => m.id));
    for (const ram of [1 * GB, 2 * GB, 4 * GB, 8 * GB, 16 * GB]) {
      expect(ids.has(pickModel({ preference: null, modelWeight: 'auto', ramBytes: ram, diskBytes: 128 * GB, nCtx: 2048 }).modelId)).toBe(true);
    }
  });
});

describe('recommend (the full engine)', () => {
  it('maps a coding goal to the coding track with a reason naming the goal', () => {
    const rec = recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['coding'] } }));
    expect(rec.trackId).toBe('coding');
    expect(rec.primaryGoal).toBe('coding');
    expect(rec.reasons[0]).toEqual({ key: 'goals', params: { goal: 'coding' } });
  });

  it('flags the visual honesty note only for image/video goals', () => {
    expect(recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['image'] } })).visualNotIntegrated).toBe(true);
    expect(recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['video', 'chat'] } })).visualNotIntegrated).toBe(true);
    expect(recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['chat'] } })).visualNotIntegrated).toBe(false);
  });

  it('still returns an integrated model even for visual goals (no fake promises)', () => {
    const rec = recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['image'] } }));
    expect(CATALOG.some((m) => m.id === rec.modelId)).toBe(true);
  });

  it('reports voice companions from the integrated whisper pair only', () => {
    const rec = recommend(input());
    expect(rec.voiceCompanions).toEqual(VOICE_MODELS.map((m) => m.id));
  });

  it('stacks reasons for the profile answers', () => {
    const rec = recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['learning'], experience: 'beginner', preference: 'speed' } }));
    const keys = rec.reasons.map((r) => r.key);
    expect(keys).toContain('goals');
    expect(keys).toContain('speed');
    expect(keys).toContain('experienceBeginner');
  });

  it('downgrade reasons appear when the device forced a lighter model', () => {
    const rec = recommend(input({ ramBytes: 800 * 1024 * 1024 }));
    expect(rec.reasons.map((r) => r.key)).toContain('ramDowngrade');
  });

  it('keeps secondary goals and tracks behind the primary one', () => {
    const rec = recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['productivity', 'chat', 'data'] } }));
    expect(rec.secondaryGoals).toEqual(['chat', 'data']);
    expect(rec.secondaryTracks).toEqual(['chat', 'learning']);
  });

  it('lists the remaining catalog models as ordered alternates', () => {
    const rec = recommend(input({ profile: { ...DEFAULT_PROFILE, goals: ['chat'], preference: 'speed' } }));
    expect(rec.modelId).toBe(LIGHT);
    expect(rec.alternates).toEqual([MID_2, MID_1, STRONG]);
  });

  it('reasoning goals match the registry used by the follow-up questions', () => {
    // The engine and the question engine must agree on what counts as heavy.
    for (const goal of REASONING_GOALS) {
      expect(GOAL_TRACKS.some((g) => g.goal === goal)).toBe(true);
    }
  });

  it('every ReasonKey resolves in both languages (the screen interpolates by key)', () => {
    const keys: string[] = [
      'goals',
      'ram',
      'ramDowngrade',
      'diskDowngrade',
      'speed',
      'accuracy',
      'experienceBeginner',
      'experiencePro',
      'weightLight',
      'weightAdvanced',
    ];
    for (const lang of ['ar', 'en'] as const) {
      const dict = resources[lang].translation as unknown as Record<string, any>;
      for (const key of keys) {
        expect(typeof dict.onboarding.reason[key]).toBe('string');
        expect(dict.onboarding.reason[key].length).toBeGreaterThan(3);
      }
    }
  });
});
