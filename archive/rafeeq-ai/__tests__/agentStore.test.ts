// Copyright (c) 2026 DRS AI. All rights reserved.
import { initI18n } from '../src/i18n';
import { setAgentLlm, useAgentStore } from '../src/store/agentStore';
import { useChatStore, type SendOptions } from '../src/store/chatStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTtsStore } from '../src/store/ttsStore';
import { setVoiceOutEngine, useVoiceOutStore } from '../src/store/voiceOutStore';
import type { AgentLlm } from '../src/agent/llm';

const OPTS: SendOptions = {
  systemPrompt: '',
  temperature: 0.7,
  contextSize: 4096,
  maxTokens: 700,
  modelId: 'demo',
  fallbackTitle: 'مهمة',
};

const PLAN = JSON.stringify({
  steps: [
    { title: 'سجّل مذكرة', tool: 'notes.create', detail: 'دوّن الاتصال' },
    { title: 'اكتب الجواب', tool: null, detail: 'الصياغة' },
  ],
});
const CALL_NOTE = JSON.stringify({ tool: 'notes.create', arguments: { title: 'أتصل على أبوي' } });
const ANSWER = 'حفظت المذكرة';

function scriptedLLM(responses: (string | Error)[]): AgentLlm {
  const queue = [...responses];
  return {
    async complete() {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new Error('SCRIPT_EXHAUSTED');
      return { text: next };
    },
    stop: async () => undefined,
  };
}

async function until(condition: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`TIMEOUT waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('the agent store bridge', () => {
  beforeEach(() => {
    initI18n('ar');
    useAgentStore.setState({ session: null, modeEnabled: false });
    useAgentStore.getState().dismissSession();
    useChatStore.setState({ conversations: [], messages: [], currentId: null, generating: false, streamingMessageId: null, error: null });
  });

  afterEach(() => {
    setAgentLlm(null);
  });

  it('refuses to start without a loaded model or a test LLM', async () => {
    await expect(useAgentStore.getState().startGoal('مهمة', OPTS)).rejects.toThrow('NO_MODEL');
    expect(useAgentStore.getState().session).toBeNull();
  });

  it('runs the whole flow: goal lands, plan awaits, approval runs, confirmation gates, answer persists', async () => {
    setAgentLlm(scriptedLLM([PLAN, CALL_NOTE, ANSWER]));
    const pending = useAgentStore.getState().startGoal('دوّن مذكرة أتصل على أبوي', OPTS);
    await until(() => useAgentStore.getState().session?.status === 'awaiting-plan', 'awaiting-plan');

    // The goal is a normal user message in the conversation already.
    const session = useAgentStore.getState().session!;
    expect(session.plan.map((s) => s.tool)).toEqual(['notes.create', null]);
    expect(session.includedStepIds).toEqual(['s1', 's2']);

    // Editing the plan before approval is allowed.
    useAgentStore.getState().toggleIncludedStep('s2');
    expect(useAgentStore.getState().session!.includedStepIds).toEqual(['s1']);
    useAgentStore.getState().toggleIncludedStep('s2');

    useAgentStore.getState().approvePlan();
    await until(() => useAgentStore.getState().session?.pendingConfirmation !== null, 'confirmation');
    expect(useAgentStore.getState().session!.pendingConfirmation!.tool).toBe('notes.create');

    useAgentStore.getState().confirmStep(true);
    await pending;

    const finished = useAgentStore.getState().session!;
    expect(finished.status).toBe('finished');
    expect(finished.answer).toBe(ANSWER);
    expect(finished.pendingConfirmation).toBeNull();

    const messages = useChatStore.getState().messages;
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('دوّن مذكرة أتصل على أبوي');
    expect(messages[messages.length - 1].role).toBe('assistant');
    expect(messages[messages.length - 1].content).toBe(ANSWER);
  });

  it('refuses a second goal while one is active', async () => {
    setAgentLlm(scriptedLLM([PLAN, CALL_NOTE, ANSWER]));
    const pending = useAgentStore.getState().startGoal('المهمة الأولى', OPTS);
    await until(() => useAgentStore.getState().session?.status === 'awaiting-plan', 'awaiting-plan');
    await expect(useAgentStore.getState().startGoal('المهمة الثانية', OPTS)).rejects.toThrow('AGENT_BUSY');
    useAgentStore.getState().cancelPlan();
    await pending;
    expect(useAgentStore.getState().session!.status).toBe('cancelled');
  });

  it('cancelling lands the cancellation note in the conversation', async () => {
    setAgentLlm(scriptedLLM([PLAN]));
    const pending = useAgentStore.getState().startGoal('مهمة ملغاة', OPTS);
    await until(() => useAgentStore.getState().session?.status === 'awaiting-plan', 'awaiting-plan');
    useAgentStore.getState().cancelPlan();
    await pending;
    expect(useAgentStore.getState().session!.status).toBe('cancelled');
    const messages = useChatStore.getState().messages;
    expect(messages[messages.length - 1].role).toBe('assistant');
    expect(messages[messages.length - 1].content).toContain('أُلغيت المهمة');
  });

  it('a failed run surfaces the error on the session', async () => {
    setAgentLlm(scriptedLLM(['ليس JSON', 'ليس JSON']));
    await useAgentStore.getState().startGoal('مهمة فاشلة', OPTS);
    const failed = useAgentStore.getState().session!;
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('PLAN_NOT_JSON');
    expect(failed.answer).toBeNull();
  });

  it('dismissSession clears the card', () => {
    useAgentStore.setState({
      session: {
        conversationId: 'c1',
        goal: 'goal',
        status: 'finished',
        plan: [],
        stepStatus: {},
        includedStepIds: [],
        pendingConfirmation: null,
        error: null,
        answer: 'done',
        startedAt: 0,
      },
    });
    useAgentStore.getState().dismissSession();
    expect(useAgentStore.getState().session).toBeNull();
  });
});

describe('the voice-out agent — answers are spoken, never replayed', () => {
  /** Captures what the platform TTS engine was asked to say. */
  class CapturingSpeech {
    spoken: string[] = [];
    async getVoices() {
      return [];
    }
    async speak(text: string, opts: { onDone?: () => void }) {
      this.spoken.push(text);
      opts.onDone?.();
    }
    async stop() {}
  }

  /** Streams tokens only on the answer call (plan/act are grammar-constrained JSON — never streamed). */
  function streamingAnswerLLM(tokens: string[], final: string): AgentLlm {
    let grammarCalls = 0;
    return {
      async complete(_messages, req) {
        if (req.grammar) {
          grammarCalls += 1;
          return { text: grammarCalls === 1 ? PLAN : CALL_NOTE };
        }
        for (const t of tokens) req.onToken?.(t);
        return { text: final };
      },
      stop: async () => undefined,
    };
  }

  beforeEach(() => {
    initI18n('ar');
    useSettingsStore.setState({ autoSpeak: true, language: 'ar' });
    useAgentStore.setState({ session: null, modeEnabled: true });
    useAgentStore.getState().dismissSession();
    useChatStore.setState({ conversations: [], messages: [], currentId: null, generating: false, streamingMessageId: null, error: null });
  });

  afterEach(() => {
    setAgentLlm(null);
    setVoiceOutEngine(null);
    useSettingsStore.setState({ autoSpeak: false });
    useVoiceOutStore.getState().abort();
  });

  it('the plan announcement and the streamed answer reach the speech queue', async () => {
    const speech = new CapturingSpeech();
    setVoiceOutEngine(speech as never);
    setAgentLlm(streamingAnswerLLM(['حفظت المذكرة', ' وخبّرت أبوك.'], 'حفظت المذكرة وخبّرت أبوك.'));
    const pending = useAgentStore.getState().startGoal('دوّن مذكرة أتصل على أبوي', OPTS);
    await until(() => speech.spoken.length > 0, 'plan announcement');
    expect(speech.spoken[0]).toContain('خطوات'); // the plan ack the user hears first
    expect(speech.spoken[0]).toContain('سجّل مذكرة'); // the first step in the agent's own words
    await until(() => useAgentStore.getState().session?.status === 'awaiting-plan', 'awaiting-plan');
    useAgentStore.getState().approvePlan();
    await until(() => useAgentStore.getState().session?.pendingConfirmation !== null, 'confirmation');
    useAgentStore.getState().confirmStep(true);
    await pending;
    expect(useAgentStore.getState().session!.status).toBe('finished');
    expect(speech.spoken).toContain('حفظت المذكرة وخبّرت أبوك.'); // streamed sentence by sentence
    // The completion pass must NOT replay the answer through the chat TTS.
    expect(useTtsStore.getState().status).toBe('idle');
    expect(useTtsStore.getState().messageId).toBeNull();
  });

  it('a fallback answer (the model could not compose one) is still spoken', async () => {
    const speech = new CapturingSpeech();
    setVoiceOutEngine(speech as never);
    setAgentLlm(scriptedLLM([PLAN, CALL_NOTE, new Error('ANSWER_TIMEOUT')]));
    const pending = useAgentStore.getState().startGoal('دوّن مذكرة', OPTS);
    await until(() => useAgentStore.getState().session?.status === 'awaiting-plan', 'awaiting-plan');
    useAgentStore.getState().approvePlan();
    await until(() => useAgentStore.getState().session?.pendingConfirmation !== null, 'confirmation');
    useAgentStore.getState().confirmStep(true);
    await pending;
    const finished = useAgentStore.getState().session!;
    expect(finished.status).toBe('finished');
    expect(finished.answer).toContain('أنجزت المهمة'); // the deterministic fallback
    // The answer never streamed a token, yet the user hears it.
    expect(speech.spoken.some((s) => s.includes('أنجزت المهمة'))).toBe(true);
  });
});
