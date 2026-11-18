// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage } from '../src/types';
import type { CompletionOptions, CompletionResult, EngineMessage, LlmEngine } from '../src/llm/engine';
import { MemoryChatRepository } from '../src/db/repository';
import { setChatRepository, useChatStore } from '../src/store/chatStore';
import { setEngine } from '../src/store/llmStore';
import {
  buildSuggestionMessages,
  parseSuggestions,
  SUGGESTION_INSTRUCTION,
  SUGGESTION_MAX_TOKENS,
  SUGGESTION_SYSTEM_PROMPT,
  SUGGESTION_TEMPERATURE,
  suggestionsUiState,
  type SuggestionsUiInput,
} from '../src/utils/suggestions';

// ---------------------------------------------------------------------------
// parseSuggestions — the contract that keeps the chips clean
// ---------------------------------------------------------------------------

describe('parseSuggestions', () => {
  const cases: { name: string; raw: string; expected: string[] }[] = [
    { name: 'clean three lines pass through', raw: 'أول\nثانٍ\nثالث', expected: ['أول', 'ثانٍ', 'ثالث'] },
    { name: 'latin numbering stripped', raw: '1. أول\n2. ثانٍ\n3. ثالث', expected: ['أول', 'ثانٍ', 'ثالث'] },
    { name: 'arabic-indic numbering stripped', raw: '١. أول\n٢- ثانٍ\n٣) ثالث', expected: ['أول', 'ثانٍ', 'ثالث'] },
    { name: 'bullets and dashes stripped', raw: '- أول\n• ثانٍ\n* ثالث', expected: ['أول', 'ثانٍ', 'ثالث'] },
    { name: 'wrapping quotes stripped', raw: '«أول»\n"ثانٍ"\n“ثالث”', expected: ['أول', 'ثانٍ', 'ثالث'] },
    { name: 'preamble line ending in colon dropped', raw: 'اقتراحات:\nأول\nثانٍ', expected: ['أول', 'ثانٍ'] },
    { name: 'over-long prose dropped', raw: `قصير\n${'ط'.repeat(121)}`, expected: ['قصير'] },
    { name: 'duplicates removed', raw: 'أول\nأول\nأول', expected: ['أول'] },
    { name: 'capped at three', raw: 'أ\nب\nج\nد', expected: ['أ', 'ب', 'ج'] },
    { name: 'blank and whitespace lines skipped', raw: '\n  \nأول\n\nثانٍ', expected: ['أول', 'ثانٍ'] },
    { name: 'windows line endings', raw: 'أول\r\nثانٍ', expected: ['أول', 'ثانٍ'] },
    { name: 'empty output', raw: '', expected: [] },
    { name: 'markers only', raw: ':\n-\n1.\n', expected: [] },
  ];
  it.each(cases)('$name', ({ raw, expected }) => {
    expect(parseSuggestions(raw)).toEqual(expected);
  });
  it('respects a custom cap', () => {
    expect(parseSuggestions('أ\nب\nج', 2)).toEqual(['أ', 'ب']);
  });
});

// ---------------------------------------------------------------------------
// buildSuggestionMessages — fixed instructions, history, trigger turn
// ---------------------------------------------------------------------------

describe('buildSuggestionMessages', () => {
  const history: ChatMessage[] = [
    msg('m1', 'user', 'مرحبا'),
    msg('m2', 'assistant', 'أهلًا بك'),
  ];

  it('opens with the suggestion system prompt and ends with the trigger turn', () => {
    const built = buildSuggestionMessages(history, 2048);
    expect(built[0]).toEqual({ role: 'system', content: SUGGESTION_SYSTEM_PROMPT });
    expect(built[built.length - 1]).toEqual({ role: 'user', content: SUGGESTION_INSTRUCTION });
    expect(built.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });

  it('keeps the latest reply inside the context', () => {
    const built = buildSuggestionMessages(history, 2048);
    expect(built.some((m) => m.content === 'أهلًا بك')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// suggestionsUiState — what the composer row shows
// ---------------------------------------------------------------------------

describe('suggestionsUiState', () => {
  const base: SuggestionsUiInput = {
    engineReady: true,
    generating: false,
    editing: false,
    suggesting: false,
    suggestions: { forMessageId: 'a1', items: ['أ', 'ب', 'ج'] },
    newestId: 'a1',
    newestRole: 'assistant',
    newestContent: 'رد كامل',
  };
  const cases: { name: string; over: Partial<SuggestionsUiInput>; expected: string }[] = [
    { name: 'matching chips are ready', over: {}, expected: 'ready' },
    { name: 'chips for an older reply stay hidden', over: { newestId: 'a9' }, expected: 'hidden' },
    { name: 'a running pass shows the loader', over: { suggesting: true }, expected: 'loading' },
    { name: 'the loader wins over stale chips', over: { suggesting: true, suggestions: null }, expected: 'loading' },
    { name: 'streaming a new turn hides everything', over: { generating: true }, expected: 'hidden' },
    { name: 'an open inline edit hides the row', over: { editing: true }, expected: 'hidden' },
    { name: 'no loaded engine hides the row', over: { engineReady: false }, expected: 'hidden' },
    { name: 'a user message as newest hides the row', over: { newestRole: 'user', newestId: 'u1' }, expected: 'hidden' },
    { name: 'an empty newest reply hides the row', over: { newestContent: '  ' }, expected: 'hidden' },
    { name: 'no chips while idle hides the row', over: { suggestions: null }, expected: 'hidden' },
    { name: 'empty chip list hides the row', over: { suggestions: { forMessageId: 'a1', items: [] } }, expected: 'hidden' },
  ];
  it.each(cases)('$name', ({ over, expected }) => {
    expect(suggestionsUiState({ ...base, ...over })).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// chatStore integration — engine serialization and chip lifecycle
// ---------------------------------------------------------------------------

class ScriptedEngine implements LlmEngine {
  loaded = false;
  calls: { messages: EngineMessage[]; opts: CompletionOptions }[] = [];
  private results: string[];
  constructor(results: string[]) {
    this.results = [...results];
  }
  async load() {
    this.loaded = true;
  }
  isLoaded() {
    return this.loaded;
  }
  async complete(messages: EngineMessage[], opts: CompletionOptions): Promise<CompletionResult> {
    this.calls.push({ messages, opts });
    const text = this.results.shift() ?? '';
    return { text, tokensPerSecond: null, tokenCount: null, stoppedByUser: false };
  }
  async stop() {}
  async release() {
    this.loaded = false;
  }
}

/** Completes only when told (or stopped), so a pass can hang like on a real device. */
class GatedEngine implements LlmEngine {
  loaded = false;
  stopCount = 0;
  calls: { messages: EngineMessage[]; resolve: (r: CompletionResult) => void; pending: boolean }[] = [];
  async load() {
    this.loaded = true;
  }
  isLoaded() {
    return this.loaded;
  }
  async complete(messages: EngineMessage[]): Promise<CompletionResult> {
    return new Promise((resolve) => {
      this.calls.push({ messages, resolve, pending: true });
    });
  }
  async stop() {
    this.stopCount += 1;
    for (const c of this.calls) {
      if (c.pending) {
        c.pending = false;
        c.resolve({ text: '', tokensPerSecond: null, tokenCount: null, stoppedByUser: true });
      }
    }
  }
  async release() {
    this.loaded = false;
  }
  settle(index: number, text: string) {
    const c = this.calls[index];
    if (c && c.pending) {
      c.pending = false;
      c.resolve({ text, tokensPerSecond: null, tokenCount: null, stoppedByUser: false });
    }
  }
}

const sendOpts = {
  systemPrompt: 'SYS',
  temperature: 0.5,
  contextSize: 2048,
  maxTokens: 128,
  modelId: 'qwen',
  fallbackTitle: 'New',
};

function msg(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  return { id, conversationId: 'c1', role, content, createdAt: 1, tokensPerSecond: null, tokenCount: null };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
async function settle(times = 4) {
  for (let i = 0; i < times; i++) await flush();
}

describe('chatStore suggestions', () => {
  beforeEach(() => {
    setChatRepository(new MemoryChatRepository());
    useChatStore.setState({
      conversations: [],
      trash: [],
      currentId: null,
      messages: [],
      generating: false,
      streamingMessageId: null,
      error: null,
      ready: false,
      suggesting: false,
      suggestions: null,
    });
    return useChatStore.getState().init();
  });

  it('turns a finished reply into three clean chips', async () => {
    const engine = new ScriptedEngine(['رد كامل من رفيق', '١. اقتراح أول\n٢- اقتراح ثانٍ\n٣) اقتراح ثالث']);
    setEngine(engine);
    await engine.load();
    await useChatStore.getState().sendMessage('مرحبا', sendOpts);
    // The pass is UI-triggered, so a bare send never starts it.
    expect(useChatStore.getState().suggestions).toBeNull();

    await useChatStore.getState().refreshSuggestions();
    const s = useChatStore.getState();
    expect(s.suggesting).toBe(false);
    expect(s.suggestions?.forMessageId).toBe(s.messages[1].id);
    expect(s.suggestions?.items).toEqual(['اقتراح أول', 'اقتراح ثانٍ', 'اقتراح ثالث']);

    // The second engine call is the suggestions pass: fixed system prompt,
    // conversation history, trigger turn — and the small fast budget.
    expect(engine.calls).toHaveLength(2);
    expect(engine.calls[1].messages[0]).toEqual({ role: 'system', content: SUGGESTION_SYSTEM_PROMPT });
    expect(engine.calls[1].messages[engine.calls[1].messages.length - 1]).toEqual({
      role: 'user',
      content: SUGGESTION_INSTRUCTION,
    });
    expect(engine.calls[1].opts).toEqual({ temperature: SUGGESTION_TEMPERATURE, maxTokens: SUGGESTION_MAX_TOKENS });
    expect(engine.calls[1].messages.some((m) => m.content === 'رد كامل من رفيق')).toBe(true);
  });

  it('clears and skips the engine when the newest message is not an assistant reply', async () => {
    const engine = new ScriptedEngine([]);
    setEngine(engine);
    await engine.load();
    useChatStore.setState({ currentId: 'c1', messages: [msg('u1', 'user', 'hi')], suggestions: { forMessageId: 'old', items: ['أ'] } });
    await useChatStore.getState().refreshSuggestions();
    const s = useChatStore.getState();
    expect(s.suggestions).toBeNull();
    expect(s.suggesting).toBe(false);
    expect(engine.calls).toHaveLength(0);
  });

  it('clearSuggestions drops the chips without touching the engine', () => {
    const engine = new ScriptedEngine([]);
    setEngine(engine);
    useChatStore.setState({ suggestions: { forMessageId: 'm', items: ['أ'] } });
    useChatStore.getState().clearSuggestions();
    expect(useChatStore.getState().suggestions).toBeNull();
    expect(engine.calls).toHaveLength(0);
  });

  it('refreshSuggestions is a no-op while a pass is already running', async () => {
    const engine = new GatedEngine();
    setEngine(engine);
    await engine.load();
    useChatStore.setState({ currentId: 'c1', messages: [msg('u1', 'user', 'hi'), msg('a1', 'assistant', 'reply')] });
    const pass = useChatStore.getState().refreshSuggestions();
    await settle();
    expect(useChatStore.getState().suggesting).toBe(true);

    await useChatStore.getState().refreshSuggestions();
    expect(engine.calls).toHaveLength(1);

    await useChatStore.getState().cancelSuggestions();
    expect(useChatStore.getState().suggesting).toBe(false);
    expect(useChatStore.getState().suggestions).toBeNull();
    await pass;
  });

  it('sending while a pass runs cancels it first and its late result never commits', async () => {
    const engine = new GatedEngine();
    setEngine(engine);
    await engine.load();

    const first = useChatStore.getState().sendMessage('hi', sendOpts);
    await settle();
    expect(useChatStore.getState().generating).toBe(true);
    engine.settle(0, 'reply one');
    await first;

    const refresh = useChatStore.getState().refreshSuggestions();
    await settle();
    expect(useChatStore.getState().suggesting).toBe(true);

    const second = useChatStore.getState().sendMessage('second', sendOpts);
    await settle();
    engine.settle(2, 'reply two');
    await second;
    const s = useChatStore.getState();
    expect(engine.stopCount).toBeGreaterThanOrEqual(1);
    expect(s.suggesting).toBe(false);
    expect(s.suggestions).toBeNull();
    expect(s.generating).toBe(false);
    expect(s.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'reply one'],
      ['user', 'second'],
      ['assistant', 'reply two'],
    ]);

    // The abandoned pass resolves after the cancel; its empty result must stay discarded.
    await refresh;
    await settle();
    expect(useChatStore.getState().suggestions).toBeNull();
    expect(useChatStore.getState().suggesting).toBe(false);
  });
});
