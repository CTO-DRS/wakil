// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The profile store: goals, follow-up answers and the recommendation stamp,
 * persisted locally (`rafeeq.profile.v1`) like every other store. It only
 * holds ids and small enums — never content — and re-derives the
 * recommendation whenever its inputs change so Settings and onboarding read
 * one source of truth.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';
import { normalizeGoals, type GoalId } from '../onboarding/goals';
import {
  DEFAULT_PROFILE,
  normalizeProfile,
  type AnswerStyle,
  type ExperienceLevel,
  type ModelWeight,
  type TaskPreference,
} from '../onboarding/profile';
import { recommend, type Recommendation } from '../onboarding/recommendation';

export const PROFILE_STORAGE_KEY = 'rafeeq.profile.v1';

export type ProfileState = {
  goals: GoalId[];
  experience: ExperienceLevel | null;
  preference: TaskPreference | null;
  modelWeight: ModelWeight;
  answerStyle: AnswerStyle;
  /** True once the follow-up stage finished (or was skipped). */
  profileComplete: boolean;
  /** Latest engine verdict, kept so screens share one computation. */
  recommendation: Recommendation | null;
  /** Epoch ms the profile was last confirmed; null while unset. */
  confirmedAt: number | null;

  setGoals: (goals: GoalId[]) => void;
  setExperience: (level: ExperienceLevel | null) => void;
  setPreference: (pref: TaskPreference | null) => void;
  setModelWeight: (weight: ModelWeight) => void;
  setAnswerStyle: (style: AnswerStyle) => void;
  /** Re-runs the engine with the given device facts and stores the verdict. */
  refreshRecommendation: (device: { ramBytes: number | null; diskBytes: number | null; nCtx: number }) => void;
  markProfileComplete: () => void;
  resetProfile: () => void;
};

/** Device facts recomputed by the caller (the engine stays pure). */
export function computeRecommendation(
  state: Pick<ProfileState, 'goals' | 'preference' | 'modelWeight' | 'experience'>,
  device: { ramBytes: number | null; diskBytes: number | null; nCtx: number },
): Recommendation {
  return recommend({
    profile: {
      goals: state.goals,
      preference: state.preference,
      modelWeight: state.modelWeight,
      experience: state.experience,
    },
    ramBytes: device.ramBytes,
    diskBytes: device.diskBytes,
    nCtx: device.nCtx,
  });
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PROFILE,
      recommendation: null,
      confirmedAt: null,

      setGoals: (goals) => {
        const clean = normalizeGoals(goals);
        set({ goals: clean });
        // New goals invalidate any stale verdict the screens might show.
        set({ recommendation: null });
      },
      setExperience: (experience) => set({ experience, recommendation: null }),
      setPreference: (preference) => set({ preference, recommendation: null }),
      setModelWeight: (modelWeight) => set({ modelWeight, recommendation: null }),
      setAnswerStyle: (answerStyle) => set({ answerStyle }),
      refreshRecommendation: (device) => set({ recommendation: computeRecommendation(get(), device) }),
      markProfileComplete: () => set({ profileComplete: true, confirmedAt: Date.now() }),
      resetProfile: () => set({ ...DEFAULT_PROFILE, recommendation: null, confirmedAt: null }),
    }),
    {
      name: PROFILE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      // The verdict is derived, not data: recomputed on demand after rehydrate.
      partialize: (s) => ({
        goals: s.goals,
        experience: s.experience,
        preference: s.preference,
        modelWeight: s.modelWeight,
        answerStyle: s.answerStyle,
        profileComplete: s.profileComplete,
        confirmedAt: s.confirmedAt,
      }),
      merge: (persisted, current) => {
        const base = normalizeProfile(persisted);
        return { ...current, ...base };
      },
    },
  ),
);
