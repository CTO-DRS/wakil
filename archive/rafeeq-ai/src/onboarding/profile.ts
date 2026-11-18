// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The smart-profiling contract: the follow-up questions the onboarding asks
 * depend on what the user already answered (no wall of questions), and the
 * answers normalize into a persisted profile. The pure helpers here are the
 * single source of truth for both the onboarding screen and the later
 * «my goals» editor in Settings — and they are jest-covered.
 *
 * Honesty rules baked into the design:
 *  - Rafeeq is fully on-device, so «do you want to work offline?» is a fact,
 *    not a question: the profile never pretends a cloud toggle exists.
 *  - The reply language is the app language chosen in the previous step —
 *    also a fact, not a question.
 */

import { normalizeGoals, wantsReasoning, type GoalId } from './goals';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'pro';
export type TaskPreference = 'speed' | 'accuracy' | 'balance';
export type ModelWeight = 'light' | 'advanced' | 'auto';
export type AnswerStyle = 'concise' | 'balanced' | 'detailed';

export type OnboardingProfile = {
  goals: GoalId[];
  experience: ExperienceLevel | null;
  preference: TaskPreference | null;
  /** Sampling strength the user prefers; null until the follow-ups answer it. */
  modelWeight: ModelWeight;
  answerStyle: AnswerStyle;
  /** Set once the follow-up stage is finished (or skipped). */
  profileComplete: boolean;
};

export const DEFAULT_PROFILE: OnboardingProfile = {
  goals: [],
  experience: null,
  preference: null,
  modelWeight: 'auto',
  answerStyle: 'balanced',
  profileComplete: false,
};

export type ProfileAnswers = Pick<OnboardingProfile, 'experience' | 'preference' | 'modelWeight' | 'answerStyle'>;

/** Discriminated union of the dynamic follow-up questions (id = answer slot). */
export type FollowUpQuestion =
  | { id: 'experience'; kind: 'experience' }
  | { id: 'preference'; kind: 'preference' }
  | { id: 'answerStyle'; kind: 'answerStyle' }
  | { id: 'modelWeight'; kind: 'modelWeight' };

/**
 * Which follow-ups apply. `modelWeight` only appears when the selected goals
 * actually benefit from a stronger model — chit-chat users get three
 * questions, reasoning-heavy users get four. The order is the display order.
 */
export function followUpQuestions(goals: readonly GoalId[]): FollowUpQuestion[] {
  const out: FollowUpQuestion[] = [
    { id: 'experience', kind: 'experience' },
    { id: 'preference', kind: 'preference' },
    { id: 'answerStyle', kind: 'answerStyle' },
  ];
  if (wantsReasoning(normalizeGoals(goals))) out.push({ id: 'modelWeight', kind: 'modelWeight' });
  return out;
}

function normalizeExperience(value: unknown): ExperienceLevel | null {
  return value === 'beginner' || value === 'intermediate' || value === 'pro' ? value : null;
}

function normalizePreference(value: unknown): TaskPreference | null {
  return value === 'speed' || value === 'accuracy' || value === 'balance' ? value : null;
}

function normalizeModelWeight(value: unknown): ModelWeight {
  return value === 'light' || value === 'advanced' || value === 'auto' ? value : 'auto';
}

function normalizeAnswerStyle(value: unknown): AnswerStyle {
  return value === 'concise' || value === 'balanced' || value === 'detailed' ? value : 'balanced';
}

/** Validates a partial answers object; unknown fields fall back to defaults. */
export function normalizeProfile(value: unknown): OnboardingProfile {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    goals: normalizeGoals(v.goals),
    experience: normalizeExperience(v.experience),
    preference: normalizePreference(v.preference),
    modelWeight: normalizeModelWeight(v.modelWeight),
    answerStyle: normalizeAnswerStyle(v.answerStyle),
    profileComplete: v.profileComplete === true,
  };
}

/**
 * The system-prompt directive that carries the personalization into every
 * reply. Pure and deterministic so tests can pin the exact string per style;
 * empty string when the user wants the model's default behavior (balanced
 * style with no speed/accuracy tilt), keeping prompts short on 1B models.
 */
export function styleDirective(
  profile: Pick<OnboardingProfile, 'answerStyle' | 'preference'>,
  lang: 'ar' | 'en',
): string {
  const parts: string[] = [];
  if (profile.answerStyle === 'concise') {
    parts.push(lang === 'ar' ? 'أجب باختصار شديد وبدون مقدمات.' : 'Reply very briefly with no preamble.');
  } else if (profile.answerStyle === 'detailed') {
    parts.push(
      lang === 'ar' ? 'أجب بتفصيل وافٍ مع أمثلة عند الحاجة.' : 'Reply with helpful detail and examples when useful.',
    );
  }
  if (profile.preference === 'speed') {
    parts.push(lang === 'ar' ? 'اذهب مباشرة إلى الجواب.' : 'Go straight to the answer.');
  } else if (profile.preference === 'accuracy') {
    parts.push(lang === 'ar' ? 'تحقق من دقة المعلومات قبل الإجابة.' : 'Verify facts carefully before answering.');
  }
  return parts.join(' ');
}

/** Appends the directive to a base prompt; returns the base untouched when empty. */
export function applyStyleDirective(base: string, directive: string): string {
  const trimmedBase = base.trim();
  const trimmedDir = directive.trim();
  if (!trimmedDir) return trimmedBase;
  return trimmedBase ? `${trimmedBase}\n\n${trimmedDir}` : trimmedDir;
}
