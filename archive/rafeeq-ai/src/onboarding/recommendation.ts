// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The smart recommendation engine. Pure, deterministic and jest-pinned: it maps
 * the user's goals onto the tracks Rafeeq actually serves, orders them
 * (primary = the first goal the user picked), and selects the integrated chat
 * model whose runtime estimate fits the device with headroom.
 *
 * Honesty contract (same as the model library):
 *  - Only `CATALOG` chat models are ever recommended as runnable — the voice
 *    pair and the built-in TTS are noted as companions, never as the answer.
 *  - Image/video goals cannot run on-device yet; the engine returns the honest
 *    `visualNotIntegrated` note instead of promising a download that does not
 *    exist, and pairs the goal with the best integrated text model.
 */

import { CATALOG, VOICE_MODELS } from '../models/catalog';
import { checkRam, DISK_MARGIN_BYTES, estimateRuntimeBytes } from '../models/resources';
import type { ModelInfo } from '../types';
import type { GoalId } from './goals';
import type { OnboardingProfile } from './profile';

export type TrackId = 'coding' | 'chat' | 'learning' | 'creative' | 'security' | 'assistant';

export type Track = {
  readonly id: TrackId;
  readonly icon: string;
  readonly ar: string;
  readonly en: string;
};

export const TRACKS: readonly Track[] = [
  { id: 'coding', icon: 'code', ar: 'البرمجة والتطوير', en: 'Coding & development' },
  { id: 'chat', icon: 'chat', ar: 'المحادثة الذكية', en: 'AI chat' },
  { id: 'learning', icon: 'book', ar: 'مساعد التعلم والبحث', en: 'Learning assistant' },
  { id: 'creative', icon: 'image', ar: 'الإبداع والصور', en: 'Creative & images' },
  { id: 'security', icon: 'shield', ar: 'مساعد الأمن السيبراني', en: 'Cybersecurity assistant' },
  { id: 'assistant', icon: 'bolt', ar: 'المساعد الشخصي', en: 'Personal assistant' },
];

/** Goal → track. Several goals may share a track; `free`/`multi` map to chat. */
export const GOAL_TRACKS: readonly { goal: GoalId; track: TrackId }[] = [
  { goal: 'coding', track: 'coding' },
  { goal: 'apps', track: 'coding' },
  { goal: 'chat', track: 'chat' },
  { goal: 'multi', track: 'chat' },
  { goal: 'free', track: 'chat' },
  { goal: 'learning', track: 'learning' },
  { goal: 'documents', track: 'learning' },
  { goal: 'data', track: 'learning' },
  { goal: 'image', track: 'creative' },
  { goal: 'video', track: 'creative' },
  { goal: 'writing', track: 'creative' },
  { goal: 'productivity', track: 'assistant' },
  { goal: 'security', track: 'security' },
];

/** Track suggested when the user picked nothing concrete. */
export const DEFAULT_TRACK: TrackId = 'chat';

export function trackForGoal(goal: GoalId): TrackId {
  return GOAL_TRACKS.find((g) => g.goal === goal)?.track ?? DEFAULT_TRACK;
}

/** Ordered, deduped tracks for a goal list (user order = priority order). */
export function tracksForGoals(goals: readonly GoalId[]): TrackId[] {
  const out: TrackId[] = [];
  for (const g of goals) {
    const t = trackForGoal(g);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export type RecommendInput = {
  profile: Pick<OnboardingProfile, 'goals' | 'preference' | 'modelWeight' | 'experience'>;
  /** Free RAM in bytes; null when the device refuses to report it. */
  ramBytes: number | null;
  /** Free disk in bytes; null when unknown (no downgrade without evidence). */
  diskBytes: number | null;
  /** The loaded-to-be context size (drives the RAM estimate). */
  nCtx: number;
};

export type ReasonKey =
  | 'goals'
  | 'ram'
  | 'ramDowngrade'
  | 'diskDowngrade'
  | 'speed'
  | 'accuracy'
  | 'experienceBeginner'
  | 'experiencePro'
  | 'weightLight'
  | 'weightAdvanced';

export type Recommendation = {
  trackId: TrackId;
  /** Ordered tracks beyond the primary one. */
  secondaryTracks: TrackId[];
  primaryGoal: GoalId | null;
  secondaryGoals: GoalId[];
  /** A `CATALOG` model id — always integrated, always downloadable. */
  modelId: string;
  /** Integrated alternates the user can pick instead, best first. */
  alternates: string[];
  /** Why this model, in stable i18n key + params form. */
  reasons: { key: ReasonKey; params?: Record<string, string | number> }[];
  /** Voice companion ids (integrated whisper models), when worth surfacing. */
  voiceCompanions: string[];
  /** True when a picked goal maps to a category that is documented-only today. */
  visualNotIntegrated: boolean;
};

/** Model ids the engine may ever return — the honest universe. */
export function integratedChatModels(): ModelInfo[] {
  return CATALOG.filter((m) => m.source === 'catalog');
}

function modelById(id: string): ModelInfo | undefined {
  return CATALOG.find((m) => m.id === id);
}

function fits(model: ModelInfo, ramBytes: number | null, nCtx: number): boolean {
  if (ramBytes == null || !Number.isFinite(ramBytes) || ramBytes <= 0) return false;
  // «tight» counts as fitting: mmap + OS reclaim usually makes it run, and the
  // screen still shows the honest RAM badge so the user can pick lighter.
  return checkRam(model.sizeBytes, nCtx, ramBytes).verdict !== 'insufficient';
}

/**
 * Picks the best model: strength order comes from the profile (speed → small,
 * accuracy/advanced → large, else the strongest that fits), then reality cuts
 * it down (RAM, then disk when known). Unknown RAM keeps the mid path.
 */
export function pickModel(input: {
  preference: OnboardingProfile['preference'];
  modelWeight: OnboardingProfile['modelWeight'];
  ramBytes: number | null;
  diskBytes: number | null;
  nCtx: number;
}): { modelId: string; ramDowngraded: boolean; diskDowngraded: boolean } {
  const models = integratedChatModels();
  // Preference order by id: lightest → heaviest (sizes are verified catalog data).
  const ascending = [...models].sort((a, b) => a.sizeBytes - b.sizeBytes);
  let ordered: ModelInfo[];
  if (input.preference === 'speed' || input.modelWeight === 'light') ordered = ascending;
  else if (input.preference === 'accuracy' || input.modelWeight === 'advanced') ordered = [...ascending].reverse();
  else ordered = [...ascending].reverse(); // auto: aim for the strongest that fits

  let ramDowngraded = false;
  let diskDowngraded = false;

  // RAM gate first: with known RAM, only models that fit stay candidates.
  if (input.ramBytes != null && Number.isFinite(input.ramBytes) && input.ramBytes > 0) {
    const fitting = ordered.filter((m) => fits(m, input.ramBytes, input.nCtx));
    if (fitting.length === 0) {
      // Nothing fits by the strict check: fall back to the lightest model.
      return { modelId: ascending[0]!.id, ramDowngraded: true, diskDowngraded: false };
    }
    if (fitting[0]!.id !== ordered[0]!.id) ramDowngraded = true;
    ordered = fitting;
  }

  // Disk gate next (needs the exact byte size, which every catalog model has).
  if (input.diskBytes != null && Number.isFinite(input.diskBytes) && input.diskBytes > 0) {
    const fitting = ordered.filter((m) => m.sizeBytes + DISK_MARGIN_BYTES <= input.diskBytes!);
    if (fitting.length > 0) {
      if (fitting[0]!.id !== ordered[0]!.id) diskDowngraded = true;
      ordered = fitting;
    }
  }

  return { modelId: ordered[0]!.id, ramDowngraded, diskDowngraded };
}

/** The engine entry point. */
export function recommend(input: RecommendInput): Recommendation {
  const goals = input.profile.goals;
  const tracks = tracksForGoals(goals);
  const trackId = tracks[0] ?? DEFAULT_TRACK;
  const primaryGoal = goals[0] ?? null;

  const { modelId, ramDowngraded, diskDowngraded } = pickModel({
    preference: input.profile.preference,
    modelWeight: input.profile.modelWeight,
    ramBytes: input.ramBytes,
    diskBytes: input.diskBytes,
    nCtx: input.nCtx,
  });

  const chosen = modelById(modelId)!;
  const rest = integratedChatModels().filter((m) => m.id !== modelId).sort((a, b) => a.sizeBytes - b.sizeBytes);

  const reasons: Recommendation['reasons'] = [];
  if (primaryGoal) reasons.push({ key: 'goals', params: { goal: primaryGoal } });
  if (ramDowngraded) reasons.push({ key: 'ramDowngrade' });
  else if (input.ramBytes != null && input.ramBytes > 0)
    reasons.push({ key: 'ram', params: { value: Math.round(estimateRuntimeBytes(chosen.sizeBytes, input.nCtx) / (1024 * 1024)) } });
  if (diskDowngraded) reasons.push({ key: 'diskDowngrade' });
  if (input.profile.preference === 'speed') reasons.push({ key: 'speed' });
  if (input.profile.preference === 'accuracy') reasons.push({ key: 'accuracy' });
  if (input.profile.experience === 'beginner') reasons.push({ key: 'experienceBeginner' });
  if (input.profile.experience === 'pro') reasons.push({ key: 'experiencePro' });
  if (input.profile.modelWeight === 'light') reasons.push({ key: 'weightLight' });
  if (input.profile.modelWeight === 'advanced') reasons.push({ key: 'weightAdvanced' });

  const visualNotIntegrated = goals.some((g) => g === 'image' || g === 'video');

  return {
    trackId,
    secondaryTracks: tracks.slice(1),
    primaryGoal,
    secondaryGoals: goals.slice(1),
    modelId,
    alternates: rest.map((m) => m.id),
    reasons,
    voiceCompanions: VOICE_MODELS.map((m) => m.id),
    visualNotIntegrated,
  };
}
