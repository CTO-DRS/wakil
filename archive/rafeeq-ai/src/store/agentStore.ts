// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * The agent bridge: owns the single active AgentRunner, translates its event
 * stream into UI state (plan card, confirmation card, step statuses) and
 * lands the goal + final answer in the conversation. Exactly one session is
 * active at a time — the composer refuses new goals until it ends.
 */

import { create } from 'zustand';

import { AgentRunner } from '../agent/loop';
import { engineAsAgentLlm, type AgentLlm } from '../agent/llm';
import { useMemoryStore } from '../agent/memory';
import { rankLexical } from '../agent/retrieval';
import { useNotesStore } from '../agent/notes';
import { deviceLocation } from '../agent/locationDevice';
import { nativeAgentReminderIO } from '../agent/reminderNative';
import { makeAllTools } from '../agent/tools/all';
import type { ToolRegistry } from '../agent/registry';
import type { PlanStep, StepStatus } from '../agent/types';
import { getEngine, useLlmStore } from './llmStore';
import { useChatStore, type SendOptions } from './chatStore';
import { voiceSessionMeter, useVoiceOutStore } from './voiceOutStore';
import { voiceHandoffFresh } from './voiceStore';
import i18n from '../i18n';
import { useSettingsStore } from './settingsStore';
import type { Language } from '../types';

export type AgentSessionStatus = 'planning' | 'awaiting-plan' | 'running' | 'finished' | 'failed' | 'cancelled';

export interface AgentSession {
  conversationId: string;
  goal: string;
  status: AgentSessionStatus;
  /** Steps shown on the plan card; empty until the plan arrives. */
  plan: PlanStep[];
  /** Live status per step id. */
  stepStatus: Record<string, StepStatus>;
  /** Steps the user kept on the editable plan card (pre-approval). */
  includedStepIds: string[];
  /** Mutating step awaiting the confirmation card. */
  pendingConfirmation: { stepId: string; tool: string; args: Record<string, unknown> } | null;
  /** Failed step awaiting nothing — surfaced on the card. */
  error: string | null;
  answer: string | null;
  startedAt: number;
}

type AgentState = {
  session: AgentSession | null;
  /** The user's agent-mode toggle for the composer. */
  modeEnabled: boolean;
  setModeEnabled: (enabled: boolean) => void;
  toggleIncludedStep: (stepId: string) => void;
  approvePlan: () => void;
  cancelPlan: () => void;
  confirmStep: (approve: boolean) => void;
  dismissSession: () => void;
  /** Starts a goal from the composer; resolves when the run ends. */
  startGoal: (goal: string, opts: SendOptions) => Promise<void>;
};

/** The tool registry is a singleton: one set of capabilities per process. */
export function getAgentRegistry(): ToolRegistry {
  return makeAllTools({
    reminderIO: nativeAgentReminderIO,
    getLocation: deviceLocation,
  });
}

let runner: AgentRunner | null = null;
/** Injected by tests to drive the loop without a native engine. */
let llmOverride: AgentLlm | null = null;

/** Overrides the agent LLM (tests). */
export function setAgentLlm(llm: AgentLlm | null) {
  llmOverride = llm;
}

function agentLocale(): Language {
  return useSettingsStore.getState().language;
}

function agentModel(): { id: string; name: string } | null {
  const s = useLlmStore.getState();
  if (s.status !== 'ready' || !s.loadedModelId) return null;
  return { id: s.loadedModelId, name: s.loadedModelId };
}

/**
 * The retrieved-memories block for one goal: the top-3 local memories that
 * lexically match it, rendered as bounded lines. All on-device, all
 * user-editable — nothing here ever touches a network.
 */
export function knownContextForGoal(goal: string): readonly string[] {
  const memories = useMemoryStore.getState().getMemories();
  if (memories.length === 0) return [];
  const ranked = rankLexical(goal, memories, (m) => m.text, 3);
  return ranked.map((r) => `- [${r.item.kind}] ${r.item.text}`);
}

function tr(key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, params) as string;
}

/**
 * The plan announcement the user hears while reading the plan card: a short
 * acknowledgment, the first steps in their own words, and the honest promise
 * that anything that changes data stops for confirmation first. Kept tight —
 * this is usually the first sentence the user hears, so it is the one the
 * <3 s budget measures against.
 */
export function planAckForSpeech(
  steps: readonly { title: string }[],
  locale: Language,
): string {
  if (steps.length === 0) {
    return locale === 'ar' ? 'حاضر، شغّال على طلبك.' : 'On it.';
  }
  const first = steps[0]!.title.trim();
  if (locale === 'ar') {
    const head =
      steps.length === 1 ? `حاضر، بنتفّذ خطوة واحدة: ${first}.` : `حاضر، عندي ${steps.length} خطوات وأبدأ بها: ${first}.`;
    return `${head} أي خطوة تغيّر شي بتوقف قبلها.`;
  }
  const head =
    steps.length === 1 ? `On it — one step: ${first}.` : `On it — ${steps.length} steps, starting with: ${first}.`;
  return `${head} Anything that changes data stops for your confirmation first.`;
}

/** Auto-speak is the single voice switch: on = the agent answers out loud. */
function voiceOutEnabled(): boolean {
  return useSettingsStore.getState().autoSpeak;
}

export const useAgentStore = create<AgentState>()((set, get) => {
  /** What the answer streaming actually pushed this session (fallback-speech guard). */
  let answerStreamedText = '';
  const patchSession = (patch: Partial<AgentSession>) =>
    set((s) => (s.session ? { session: { ...s.session, ...patch } } : {}));

  const finalize = (status: AgentSessionStatus, error: string | null, answer: string | null) => {
    const conversationId = get().session?.conversationId ?? null;
    patchSession({ status, error, answer, pendingConfirmation: null });
    runner = null;
    if (conversationId && answer && answer.trim()) {
      // The voice-out session already spoke the answer sentence by sentence as
      // it generated; silentSpeak keeps the completion pass from replaying it.
      void useChatStore.getState().addAssistantMessage(conversationId, answer, { silentSpeak: voiceOutEnabled() });
    } else if (conversationId && status === 'cancelled') {
      void useChatStore.getState().addAssistantMessage(conversationId, tr('agent.cancelledNote'));
    }
    if (voiceOutEnabled()) {
      if (status === 'finished') {
        voiceSessionMeter.mark('answered');
        useVoiceOutStore.getState().flushPending();
        // The fallback path (LLM timeout/error, empty completion) composed an
        // answer that never streamed a token — speak the whole thing now so a
        // voice session never ends in silence. The exact streamed text is
        // skipped: those sentences are already queued for speech.
        const streamed = answerStreamedText.trim();
        if (answer && answer.trim() && answer.trim() !== streamed) {
          useVoiceOutStore.getState().speakAnswer(answer);
        }
      } else {
        useVoiceOutStore.getState().abort();
      }
    }
    answerStreamedText = '';
  };

  return {
    session: null,
    modeEnabled: false,
    setModeEnabled: (enabled) => set({ modeEnabled: enabled }),

    toggleIncludedStep: (stepId) =>
      set((s) => {
        if (!s.session || s.session.status !== 'awaiting-plan') return {};
        const has = s.session.includedStepIds.includes(stepId);
        const next = has ? s.session.includedStepIds.filter((id) => id !== stepId) : [...s.session.includedStepIds, stepId];
        return { session: { ...s.session, includedStepIds: next } };
      }),

    approvePlan: () => {
      const s = get().session;
      if (!s || s.status !== 'awaiting-plan' || !runner) return;
      if (s.includedStepIds.length === 0) return;
      patchSession({ status: 'running' });
      runner.decidePlan({ action: 'run', keepStepIds: s.includedStepIds });
    },

    cancelPlan: () => {
      const s = get().session;
      if (!s || !runner) return;
      runner.cancel();
    },

    confirmStep: (approve) => {
      const s = get().session;
      if (!s?.pendingConfirmation || !runner) return;
      const { stepId } = s.pendingConfirmation;
      patchSession({ pendingConfirmation: null });
      runner.decideConfirmation(stepId, approve);
    },

    dismissSession: () => set({ session: null }),

    startGoal: async (goal, opts) => {
      const text = goal.trim();
      if (!text) return;
      if (get().session && ['planning', 'awaiting-plan', 'running'].includes(get().session!.status)) {
        throw new Error('AGENT_BUSY');
      }
      const engine = llmOverride ? null : getEngine();
      if (!llmOverride && (!engine || !engine.isLoaded())) {
        set({ session: null, modeEnabled: true });
        throw new Error('NO_MODEL');
      }
      const landed = await useChatStore.getState().addUserMessageOnly(text, opts);
      if (!landed) return;

      const registry = getAgentRegistry();
      const llm = llmOverride ?? engineAsAgentLlm(engine!);
      const voice = voiceOutEnabled();
      answerStreamedText = '';
      if (voice) {
        // Mic handoff: the goal came from a fresh transcription — keep the
        // recorded/transcribed marks so the report covers the whole voice
        // pipeline. A typed goal starts its own clean latency session.
        if (!voiceHandoffFresh()) voiceSessionMeter.reset();
        voiceSessionMeter.mark('goalSent');
        useVoiceOutStore.getState().begin();
      }
      set({
        session: {
          conversationId: landed.conversationId,
          goal: text,
          status: 'planning',
          plan: [],
          stepStatus: {},
          includedStepIds: [],
          pendingConfirmation: null,
          error: null,
          answer: null,
          startedAt: Date.now(),
        },
      });

      const active = new AgentRunner({
        llm,
        tools: registry,
        locale: agentLocale(),
        model: agentModel(),
        knownContext: knownContextForGoal,
        onAnswerToken: voice
          ? (token) => {
              answerStreamedText += token;
              useVoiceOutStore.getState().pushToken(token);
            }
          : undefined,
        onEvent: (event) => {
          const s = get().session;
          if (!s) return;
          switch (event.type) {
            case 'plan-proposed':
              patchSession({
                status: 'awaiting-plan',
                plan: event.plan.steps,
                includedStepIds: event.plan.steps.map((st) => st.id),
                stepStatus: Object.fromEntries(event.plan.steps.map((st) => [st.id, 'pending' as StepStatus])),
              });
              // The user hears the plan while reading the plan card.
              if (voice) {
                voiceSessionMeter.mark('planShown');
                useVoiceOutStore.getState().speakNow(planAckForSpeech(event.plan.steps, agentLocale()));
              }
              break;
            case 'plan-approved':
              patchSession({
                status: 'running',
                plan: event.plan.steps,
                includedStepIds: event.plan.steps.map((st) => st.id),
                stepStatus: Object.fromEntries(event.plan.steps.map((st) => [st.id, 'pending' as StepStatus])),
              });
              break;
            case 'step-started':
              patchSession({ stepStatus: { ...s.stepStatus, [event.stepId]: 'running' } });
              break;
            case 'confirmation-required':
              patchSession({
                stepStatus: { ...s.stepStatus, [event.stepId]: 'confirming' },
                pendingConfirmation: { stepId: event.stepId, tool: event.tool, args: event.args },
              });
              break;
            case 'step-finished':
              patchSession({ stepStatus: { ...s.stepStatus, [event.stepId]: event.status } });
              break;
            case 'plan-finished':
              finalize('finished', null, event.answer);
              break;
            case 'agent-cancelled':
              finalize('cancelled', null, null);
              break;
            case 'agent-failed':
              finalize('failed', event.error, null);
              break;
          }
        },
      });
      runner = active;

      try {
        const outcome = await active.start(text);
        // Terminal events already finalized the session; this only catches a
        // runner that resolved without emitting a terminal event.
        const still = get().session;
        if (still && ['planning', 'awaiting-plan', 'running'].includes(still.status)) {
          if (outcome.status === 'done' && outcome.answer) finalize('finished', null, outcome.answer);
          else if (outcome.status === 'cancelled') finalize('cancelled', null, null);
          else finalize('failed', outcome.error ?? 'AGENT_FAILED', null);
        }
      } catch (e) {
        if (get().session) finalize('failed', e instanceof Error ? e.message : String(e), null);
      }
    },
  };
});

/** Live note records for the notes tools (kept beside the store for tests). */
export function currentNotes() {
  return useNotesStore.getState().getNotes();
}

export type { PlanStep, StepStatus };
