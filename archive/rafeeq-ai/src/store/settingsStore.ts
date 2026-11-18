// Copyright (c) 2026 DRS AI. All rights reserved.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_LANGUAGE } from '../i18n';
import { normalizeTimeKey } from '../utils/reminderSchedule';
import { clampConnections, DEFAULT_CONNECTIONS, MAX_CONNECTIONS, MIN_CONNECTIONS } from '../models/fastdl/segments';
import { kvStorage } from '../storage/kv';
import type { Language, ThemeMode } from '../types';
import { DEFAULT_CHAT_FONT_SCALE, normalizeChatFontScale, type ChatFontScale } from '../utils/chatFont';

export const CONTEXT_SIZES = [512, 1024, 2048, 4096] as const;
export const MAX_TOKEN_OPTIONS = [256, 512, 1024, 2048] as const;
export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 2;
export const DOWNLOAD_CONNECTIONS_MIN = MIN_CONNECTIONS;
export const DOWNLOAD_CONNECTIONS_MAX = MAX_CONNECTIONS;

export type OnboardingStep =
  | 'welcome'
  | 'language'
  | 'goals'
  | 'profile'
  | 'recommend'
  | 'path'
  | 'permissions'
  | 'personalize'
  | 'summary';

export type SettingsState = {
  language: Language;
  themeMode: ThemeMode;
  /** Empty string means "use the localized default prompt". */
  systemPrompt: string;
  temperature: number;
  contextSize: number;
  maxTokens: number;
  selectedModelId: string | null;
  /** Read each completed reply aloud with the device speech engine. Persisted. */
  autoSpeak: boolean;
  /** Keep a rolling summary of long conversations inside the context budget. Persisted. */
  autoSummary: boolean;
  /** Message text scale for accessibility (one of the published steps). Persisted. */
  chatFontScale: ChatFontScale;
  /** Multi-connection model downloads (when the native module is available). Persisted. */
  fastDownload: boolean;
  /** Keep model files in the shared Download/Rafeeq folder (survives updates/reinstall). Persisted. */
  publicModels: boolean;
  /** Parallel connections per fast download, 1-8. Persisted. */
  downloadConnections: number;
  /** First-run onboarding has been finished (or skipped). Persisted. */
  onboardingCompleted: boolean;
  /** Where onboarding resumes after a reload (the language step reloads to flip RTL). Persisted. */
  onboardingStep: OnboardingStep;
  /** Decorative motion (aurora waves, bot idle loops) on/off. Persisted. */
  animated: boolean;
  /** Transient: open a new chat once the home screen mounts after onboarding. */
  openChatAfterOnboarding: boolean;
  /** Monthly full-backup reminder switch. Persisted. */
  backupReminder: boolean;
  /** Epoch ms of the last full-backup export; null before the first one. Persisted. */
  lastBackupAt: number | null;
  /** Epoch ms the monthly reminder last scheduled; null when it never did. Persisted. */
  backupRemindedAt: number | null;
  /** The scheduled reminder notification id; null when nothing is scheduled. Persisted. */
  backupReminderId: string | null;
  /** Morning briefing daily notification switch. Persisted. */
  briefingEnabled: boolean;
  /** Morning briefing wall-clock time (`HH:MM`). Persisted. */
  briefingTime: string;
  /** The scheduled briefing notification id; null when nothing is scheduled. Persisted. */
  briefingReminderId: string | null;
  /** Proactive agent suggestion chips, computed from local data only. Persisted. */
  agentSuggestions: boolean;
  /** Which voice model the microphone transcribes with; null = catalog default. Persisted. */
  selectedVoiceModelId: string | null;
  setLanguage: (lang: Language) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setSystemPrompt: (prompt: string) => void;
  setTemperature: (value: number) => void;
  setContextSize: (value: number) => void;
  setMaxTokens: (value: number) => void;
  setSelectedModelId: (id: string | null) => void;
  setAutoSpeak: (value: boolean) => void;
  setAutoSummary: (value: boolean) => void;
  setChatFontScale: (value: number) => void;
  setFastDownload: (value: boolean) => void;
  setPublicModels: (value: boolean) => void;
  setDownloadConnections: (value: number) => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  completeOnboarding: (opts?: { openChat?: boolean }) => void;
  resetOnboarding: () => void;
  setAnimated: (value: boolean) => void;
  consumeOpenChatAfterOnboarding: () => boolean;
  setBackupReminder: (value: boolean) => void;
  /** Stamps a fresh full export and retires any pending reminder. */
  markFullBackup: (at: number) => void;
  setBackupReminderSchedule: (id: string | null, remindedAt: number | null) => void;
  setBriefingEnabled: (value: boolean) => void;
  setBriefingTime: (value: string) => void;
  setBriefingSchedule: (id: string | null) => void;
  setAgentSuggestions: (value: boolean) => void;
  setSelectedVoiceModelId: (id: string | null) => void;
};

/** Falls back to the default briefing time when a saved key is unreadable. */
export function normalizeBriefingTime(value: unknown, fallback = '07:00'): string {
  return normalizeTimeKey(typeof value === 'string' ? value : '', fallback);
}

export function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  const clamped = Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, value));
  return Math.round(clamped * 10) / 10;
}

function pickAllowed(value: number, allowed: readonly number[], fallback: number): number {
  return allowed.includes(value) ? value : fallback;
}

export const DEFAULT_SETTINGS = {
  language: DEFAULT_LANGUAGE,
  themeMode: 'system' as ThemeMode,
  systemPrompt: '',
  temperature: 0.7,
  contextSize: 2048,
  maxTokens: 512,
  selectedModelId: null as string | null,
  autoSpeak: false,
  autoSummary: true,
  chatFontScale: DEFAULT_CHAT_FONT_SCALE,
  fastDownload: true,
  publicModels: true,
  downloadConnections: DEFAULT_CONNECTIONS,
  onboardingCompleted: false,
  onboardingStep: 'welcome' as OnboardingStep,
  animated: true,
  openChatAfterOnboarding: false,
  backupReminder: true,
  lastBackupAt: null,
  backupRemindedAt: null,
  backupReminderId: null,
  briefingEnabled: true,
  briefingTime: '07:00',
  briefingReminderId: null,
  agentSuggestions: true,
  selectedVoiceModelId: null,
};

/** The full onboarding flow, in display order (shared with OnboardingShell). */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'welcome',
  'language',
  'goals',
  'profile',
  'recommend',
  'path',
  'permissions',
  'personalize',
  'summary',
];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      setLanguage: (language) => set({ language }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setTemperature: (value) => set({ temperature: clampTemperature(value) }),
      setContextSize: (value) =>
        set({ contextSize: pickAllowed(value, CONTEXT_SIZES, DEFAULT_SETTINGS.contextSize) }),
      setMaxTokens: (value) =>
        set({ maxTokens: pickAllowed(value, MAX_TOKEN_OPTIONS, DEFAULT_SETTINGS.maxTokens) }),
      setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
      setAutoSpeak: (autoSpeak) => set({ autoSpeak }),
      setAutoSummary: (autoSummary) => set({ autoSummary: !!autoSummary }),
      setChatFontScale: (value) => set({ chatFontScale: normalizeChatFontScale(value) }),
      setFastDownload: (fastDownload) => set({ fastDownload: !!fastDownload }),
      setPublicModels: (publicModels) => set({ publicModels: !!publicModels }),
      setDownloadConnections: (value) => set({ downloadConnections: clampConnections(value) }),
      setOnboardingStep: (step) =>
        set({ onboardingStep: ONBOARDING_STEPS.includes(step) ? step : 'welcome' }),
      completeOnboarding: (opts) =>
        set({ onboardingCompleted: true, onboardingStep: 'welcome', openChatAfterOnboarding: !!opts?.openChat }),
      resetOnboarding: () => set({ onboardingCompleted: false, onboardingStep: 'welcome', openChatAfterOnboarding: false }),
      setAnimated: (animated) => set({ animated: !!animated }),
      consumeOpenChatAfterOnboarding: () => {
        const pending = get().openChatAfterOnboarding;
        if (pending) set({ openChatAfterOnboarding: false });
        return pending;
      },
      setBackupReminder: (value) => set({ backupReminder: !!value }),
      markFullBackup: (at) => set({ lastBackupAt: at, backupRemindedAt: null, backupReminderId: null }),
      setBackupReminderSchedule: (id, remindedAt) => set({ backupReminderId: id, backupRemindedAt: remindedAt }),
      setBriefingEnabled: (value) => set({ briefingEnabled: !!value }),
      setBriefingTime: (value) => set({ briefingTime: normalizeBriefingTime(value) }),
      setBriefingSchedule: (id) => set({ briefingReminderId: typeof id === 'string' && id.length > 0 ? id : null }),
      setAgentSuggestions: (value) => set({ agentSuggestions: !!value }),
      setSelectedVoiceModelId: (id) => set({ selectedVoiceModelId: typeof id === 'string' && id.length > 0 ? id : null }),
    }),
    {
      name: 'rafeeq.settings.v1',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({
        language: s.language,
        themeMode: s.themeMode,
        systemPrompt: s.systemPrompt,
        temperature: s.temperature,
        contextSize: s.contextSize,
        maxTokens: s.maxTokens,
        selectedModelId: s.selectedModelId,
        autoSpeak: s.autoSpeak,
        autoSummary: s.autoSummary,
        chatFontScale: s.chatFontScale,
        fastDownload: s.fastDownload,
        publicModels: s.publicModels,
        downloadConnections: s.downloadConnections,
        onboardingCompleted: s.onboardingCompleted,
        onboardingStep: s.onboardingStep,
        animated: s.animated,
        backupReminder: s.backupReminder,
        lastBackupAt: s.lastBackupAt,
        backupRemindedAt: s.backupRemindedAt,
        backupReminderId: s.backupReminderId,
        briefingEnabled: s.briefingEnabled,
        briefingTime: s.briefingTime,
        briefingReminderId: s.briefingReminderId,
        agentSuggestions: s.agentSuggestions,
        selectedVoiceModelId: s.selectedVoiceModelId,
      }),
    },
  ),
);
