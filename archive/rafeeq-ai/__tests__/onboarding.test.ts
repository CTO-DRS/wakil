// Copyright (c) 2026 DRS AI. All rights reserved.
import { DEFAULT_SETTINGS, ONBOARDING_STEPS, useSettingsStore } from '../src/store/settingsStore';
import { useProfileStore } from '../src/store/profileStore';
import { GOALS, normalizeGoals, wantsReasoning } from '../src/onboarding/goals';
import { applyStyleDirective, DEFAULT_PROFILE, followUpQuestions, normalizeProfile, styleDirective } from '../src/onboarding/profile';
import { integratedChatModels } from '../src/onboarding/recommendation';
import { CATALOG } from '../src/models/catalog';

describe('onboarding flag', () => {
  beforeEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));

  it('starts not completed at the welcome step', () => {
    const s = useSettingsStore.getState();
    expect(s.onboardingCompleted).toBe(false);
    expect(s.onboardingStep).toBe('welcome');
    expect(s.openChatAfterOnboarding).toBe(false);
  });

  it('exposes the full nine-step flow in display order', () => {
    expect(ONBOARDING_STEPS).toEqual([
      'welcome',
      'language',
      'goals',
      'profile',
      'recommend',
      'path',
      'permissions',
      'personalize',
      'summary',
    ]);
  });

  it('remembers the step to resume after a reload and rejects unknown steps', () => {
    useSettingsStore.getState().setOnboardingStep('permissions');
    expect(useSettingsStore.getState().onboardingStep).toBe('permissions');
    useSettingsStore.getState().setOnboardingStep('bogus' as never);
    expect(useSettingsStore.getState().onboardingStep).toBe('welcome');
  });

  it('completes once, optionally asking home to open a chat (consumed once)', () => {
    useSettingsStore.getState().setOnboardingStep('summary');
    useSettingsStore.getState().completeOnboarding({ openChat: true });
    let s = useSettingsStore.getState();
    expect(s.onboardingCompleted).toBe(true);
    expect(s.onboardingStep).toBe('welcome');
    expect(s.consumeOpenChatAfterOnboarding()).toBe(true);
    expect(useSettingsStore.getState().consumeOpenChatAfterOnboarding()).toBe(false);

    useSettingsStore.getState().completeOnboarding();
    s = useSettingsStore.getState();
    expect(s.onboardingCompleted).toBe(true);
    expect(s.consumeOpenChatAfterOnboarding()).toBe(false);
  });

  it('replay resets the flag but keeps every setting (including animated)', () => {
    useSettingsStore.getState().completeOnboarding({ openChat: true });
    useSettingsStore.getState().setAnimated(false);
    useSettingsStore.getState().resetOnboarding();
    const s = useSettingsStore.getState();
    expect(s.onboardingCompleted).toBe(false);
    expect(s.onboardingStep).toBe('welcome');
    expect(s.openChatAfterOnboarding).toBe(false);
    expect(s.animated).toBe(false); // a user choice, never reset by the wizard
  });
});

describe('goals registry', () => {
  it('ships exactly the thirteen documented goals with unique ids', () => {
    expect(GOALS).toHaveLength(13);
    const ids = new Set(GOALS.map((g) => g.id));
    expect(ids.size).toBe(13);
  });

  it('normalizes selections: dedupe, unknown drop, free is exclusive', () => {
    expect(normalizeGoals(['chat', 'chat', 'nope'])).toEqual(['chat']);
    expect(normalizeGoals(['chat', 'free'])).toEqual(['chat']);
    expect(normalizeGoals(['free'])).toEqual(['free']);
    expect(normalizeGoals('junk')).toEqual([]);
  });

  it('knows which goals ask for the heavier follow-up question', () => {
    expect(wantsReasoning(['chat'])).toBe(false);
    expect(wantsReasoning(['chat', 'security'])).toBe(true);
  });
});

describe('follow-up questions', () => {
  it('never asks the model-weight question for chat-only goals', () => {
    const qs = followUpQuestions(['chat']);
    expect(qs.map((q) => q.id)).toEqual(['experience', 'preference', 'answerStyle']);
  });

  it('adds the model-weight question when reasoning goals are picked', () => {
    const qs = followUpQuestions(['coding', 'chat']);
    expect(qs.map((q) => q.id)).toEqual(['experience', 'preference', 'answerStyle', 'modelWeight']);
  });
});

describe('profile store', () => {
  beforeEach(() => {
    useProfileStore.setState({ ...DEFAULT_PROFILE, recommendation: null, confirmedAt: null });
  });

  it('defaults to an honest empty profile', () => {
    const s = useProfileStore.getState();
    expect(s.goals).toEqual([]);
    expect(s.profileComplete).toBe(false);
    expect(s.modelWeight).toBe('auto');
    expect(s.recommendation).toBeNull();
  });

  it('invalidates a stale recommendation whenever an input changes', () => {
    const store = useProfileStore.getState();
    store.setGoals(['chat']);
    useProfileStore.setState({
      recommendation: {
        trackId: 'chat',
        secondaryTracks: [],
        primaryGoal: 'chat',
        secondaryGoals: [],
        modelId: 'qwen2.5-0.5b-instruct-q4_k_m',
        alternates: [],
        reasons: [],
        voiceCompanions: [],
        visualNotIntegrated: false,
      },
    });
    expect(useProfileStore.getState().recommendation).not.toBeNull();
    useProfileStore.getState().setPreference('speed');
    expect(useProfileStore.getState().recommendation).toBeNull();
  });

  it('normalizes persisted data on rehydrate', () => {
    const merged = normalizeProfile({ goals: ['chat', 'chat', 'x'], answerStyle: 'loud', profileComplete: true });
    expect(merged.goals).toEqual(['chat']);
    expect(merged.answerStyle).toBe('balanced');
    expect(merged.profileComplete).toBe(true);
  });
});

describe('style directive (the chat integration)', () => {
  it('is empty for the default balanced style with no preference', () => {
    expect(styleDirective({ answerStyle: 'balanced', preference: null }, 'ar')).toBe('');
  });

  it('carries the concise style and speed tilt in Arabic', () => {
    const d = styleDirective({ answerStyle: 'concise', preference: 'speed' }, 'ar');
    expect(d).toContain('اختصار');
    expect(d).toContain('مباشرة');
  });

  it('carries the detailed style and accuracy tilt in English', () => {
    const d = styleDirective({ answerStyle: 'detailed', preference: 'accuracy' }, 'en');
    expect(d).toContain('detail');
    expect(d).toContain('Verify');
  });

  it('appends to a base prompt and replaces an empty one', () => {
    expect(applyStyleDirective('You are Rafeeq.', 'Be brief.')).toBe('You are Rafeeq.\n\nBe brief.');
    expect(applyStyleDirective('  ', 'Be brief.')).toBe('Be brief.');
    expect(applyStyleDirective('You are Rafeeq.', '   ')).toBe('You are Rafeeq.');
  });
});

describe('honesty invariants', () => {
  it('the engine can only ever recommend catalog chat models', () => {
    const ids = integratedChatModels().map((m) => m.id);
    expect(ids).toEqual(CATALOG.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
