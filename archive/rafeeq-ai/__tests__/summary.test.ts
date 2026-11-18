// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage } from '../src/types';
import type { CompletionOptions, CompletionResult, EngineMessage, LlmEngine } from '../src/llm/engine';
import { MemoryChatRepository } from '../src/db/repository';
import { setChatRepository, useChatStore, type SendOptions } from '../src/store/chatStore';
import { setEngine } from '../src/store/llmStore';
import { useSettingsStore } from '../src/store/settingsStore';
import {
  buildSummaryMessages,
  countDroppedMessages,
  sanitizeSummary,
  shouldSummarize,
  withSummary,
  SUMMARY_INSTRUCTION,
  SUMMARY_INPUT_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  SUMMARY_SYSTEM_PROMPT,
} from '../src/utils/summary';
import { buildPromptMessages } from '../src/llm/prompt';

// ---------------------------------------------------------------------------
// countDroppedMessages — shares the exact budget arithmetic of the prompt
// ---------------------------------------------------------------------------

describe('countDroppedMessages', () => {
  const longHistory = (count: number, chars = 60): ChatMessage[] =>
    Array.from({ length: count }, (_, i) => msg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', 'ك'.repeat(chars)));

  it('keeps everything when the window is large', () => {
    expect(countDroppedMessages(longHistory(4), 4096, 256, 'SYS')).toBe(0);
  });

  it('reports exactly how many earliest messages fell out of a tight window', () => {
    // budget = (512-256)*3 - 3 = 765 chars; each message costs 60+16=76.
    const dropped = countDroppedMessages(longHistory(20), 512, 256, 'SYS');
    expect(dropped).toBeGreaterThan(0);
    // The prompt for the same history keeps the complement.
    const picked = buildPromptMessages(longHistory(20), 'SYS', 512, 256).length - 1; // minus system
    expect(dropped + picked).toBe(20);
  });

  it('always keeps the newest turn, so the drop never reaches the last message', () => {
    const dropped = countDroppedMessages(longHistory(20), 512, 256, 'SYS');
    expect(dropped).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// shouldSummarize — the regeneration cadence
// ---------------------------------------------------------------------------

describe('shouldSummarize', () => {
  const cases: { name: string; dropped: number; covered: number | null | undefined; expected: boolean }[] = [
    { name: 'enough new turns beyond coverage', dropped: 10, covered: 0, expected: true },
    { name: 'just under the threshold waits', dropped: 7, covered: 0, expected: false },
    { name: 'exactly the threshold fires', dropped: 8, covered: 0, expected: true },
    { name: 'no coverage yet counts from zero', dropped: 8, covered: null, expected: true },
    { name: 'already fully covered never fires', dropped: 6, covered: 6, expected: false },
    { name: 'shrunk history never fires', dropped: 4, covered: 10, expected: false },
  ];
  it.each(cases)('$name', ({ dropped, covered, expected }) => {
    expect(shouldSummarize(dropped, covered)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// withSummary — one system message total
// ---------------------------------------------------------------------------

describe('withSummary', () => {
  it('appends the summary block after the persona', () => {
    const merged = withSummary('أنت رفيق', 'ملخص سابق');
    expect(merged).toBe('أنت رفيق\n\n[Earlier in this conversation]\nملخص سابق');
  });

  it('leaves the prompt untouched when there is no summary', () => {
    expect(withSummary('أنت رفيق', null)).toBe('أنت رفيق');
    expect(withSummary('  أنت رفيق  ', undefined)).toBe('أنت رفيق');
    expect(withSummary('', '')).toBe('');
  });

  it('the summary alone can carry the system role when no persona exists', () => {
    expect(withSummary('', 'ملخص')).toBe('[Earlier in this conversation]\nملخص');
  });
});

// ---------------------------------------------------------------------------
// buildSummaryMessages — the rolling side prompt
// ---------------------------------------------------------------------------

describe('buildSummaryMessages', () => {
  const turns: EngineMessage[] = [
    { role: 'user', content: 'سؤال أول' },
    { role: 'assistant', content: 'جواب أول' },
  ];

  it('opens with the fixed system prompt and carries the turns labeled', () => {
    const built = buildSummaryMessages(null, turns);
    expect(built[0]).toEqual({ role: 'system', content: SUMMARY_SYSTEM_PROMPT });
    expect(built).toHaveLength(2);
    expect(built[1].role).toBe('user');
    expect(built[1].content).toContain('User: سؤال أول');
    expect(built[1].content).toContain('Assistant: جواب أول');
    expect(built[1].content).toContain(SUMMARY_INSTRUCTION);
  });

  it('rolls the previous summary forward', () => {
    const built = buildSummaryMessages('ملخص قديم', turns);
    expect(built[1].content).toContain('Summary so far:');
    expect(built[1].content).toContain('ملخص قديم');
    expect(built[1].content).toContain('New turns since that summary:');
  });

  it('caps the turn input from the end so old backlog cannot blow the budget', () => {
    const big: EngineMessage[] = [
      { role: 'user', content: 'ق'.repeat(SUMMARY_INPUT_MAX_CHARS) },
      { role: 'assistant', content: 'الأحدث' },
    ];
    const built = buildSummaryMessages(null, big);
    expect(built[1].content).toContain('الأحدث');
    expect(built[1].content).not.toContain('ق'.repeat(SUMMARY_INPUT_MAX_CHARS));
  });
});

// ---------------------------------------------------------------------------
// sanitizeSummary — clean, bounded, non-repeating
// ---------------------------------------------------------------------------

describe('sanitizeSummary', () => {
  const cases: { name: string; raw: string; previous: string | null; expected: string | null }[] = [
    { name: 'clean text passes trimmed', raw: '  ملخص المحادثة  ', previous: null, expected: 'ملخص المحادثة' },
    { name: 'trailing stop marker stripped', raw: 'ملخص <|im_end|>', previous: null, expected: 'ملخص' },
    { name: 'empty output dropped', raw: '', previous: null, expected: null },
    { name: 'whitespace-only output dropped', raw: ' \n ', previous: null, expected: null },
    { name: 'repeat of the previous summary is rejected', raw: 'نفس الملخص', previous: 'نفس الملخص', expected: null },
    { name: 'long output capped with an ellipsis', raw: 'ط'.repeat(SUMMARY_MAX_CHARS + 40), previous: null, expected: `${'ط'.repeat(SUMMARY_MAX_CHARS)}…` },
  ];
  it.each(cases)('$name', ({ raw, previous, expected }) => {
    expect(sanitizeSummary(raw, previous)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// chatStore integration — the summary lifecycle on the engine
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

const sendOpts: SendOptions = {
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

/** A history long enough that ~half of it falls out of a 512-token window. */
const longHistory = (): ChatMessage[] =>
  Array.from({ length: 20 }, (_, i) =>
    msg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', `رسالة رقم ${i} ` + 'ك'.repeat(60)),
  );

const longOpts: SendOptions = { ...sendOpts, contextSize: 512, maxTokens: 256 };

describe('chatStore summarizing memory', () => {
  let repo: MemoryChatRepository;

  /** A conversation whose SETTINGS window is tight (512/256), seeded in store and repo. */
  const seedLongConversation = async (summaryCovers = 0, summary: string | null = null) => {
    useSettingsStore.setState({ contextSize: 512, maxTokens: 256 });
    const conv = {
      id: 'c1',
      title: 'T',
      modelId: null,
      createdAt: 0,
      updatedAt: 0,
      pinned: false,
      archived: false,
      systemPrompt: '',
      summary,
      summaryCovers,
    };
    await repo.insertConversation(conv);
    useChatStore.setState({ currentId: 'c1', messages: longHistory(), conversations: [conv] });
    return conv;
  };

  beforeEach(() => {
    repo = new MemoryChatRepository();
    setChatRepository(repo);
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
      variantsBusy: false,
      variants: null,
      summarizing: false,
    });
    useSettingsStore.setState({ autoSummary: true, systemPrompt: '', contextSize: 2048, maxTokens: 512 });
  });

  it('a short conversation never triggers a summary pass', async () => {
    const engine = new ScriptedEngine(['ليس ملخصًا']);
    setEngine(engine);
    await engine.load();
    await seedLongConversation();
    useChatStore.setState({
      messages: [msg('u1', 'user', 'مرحبا'), msg('a1', 'assistant', 'أهلًا')],
    });
    await useChatStore.getState().runPostTurn();
    const s = useChatStore.getState();
    expect(s.summarizing).toBe(false);
    // Only the suggestions pass ran, never a summary.
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0].messages[0].content).not.toBe(SUMMARY_SYSTEM_PROMPT);
    const listed = await repo.listConversations();
    expect(listed[0].summary ?? null).toBeNull();
  });

  it('a long conversation gets a rolling summary persisted and covered', async () => {
    const engine = new ScriptedEngine(['ملخص تجريبي للأحداث السابقة']);
    setEngine(engine);
    await engine.load();
    await seedLongConversation();
    await useChatStore.getState().runPostTurn();
    const s = useChatStore.getState();
    expect(s.summarizing).toBe(false);
    expect(engine.calls).toHaveLength(2); // summary pass + suggestions pass
    expect(engine.calls[0].messages[0]).toEqual({ role: 'system', content: SUMMARY_SYSTEM_PROMPT });

    const listed = await repo.listConversations();
    expect(listed[0].summary).toBe('ملخص تجريبي للأحداث السابقة');
    expect(listed[0].summaryCovers).toBeGreaterThan(0);
    expect(s.conversations[0].summary).toBe('ملخص تجريبي للأحداث السابقة');

    // The covered prefix equals what the prompt builder drops for the same input.
    const dropped = countDroppedMessages(s.messages, 512, 256, 'SYS');
    expect(listed[0].summaryCovers).toBe(dropped);
  });

  it('the next turn reads the summary inside its system prompt', async () => {
    // results: summary pass, suggestions pass, then the real turn.
    const engine = new ScriptedEngine(['ملخص تجريبي للأحداث السابقة', 'اقتراح', 'رد جديد']);
    setEngine(engine);
    await engine.load();
    await seedLongConversation();
    await useChatStore.getState().runPostTurn();

    await useChatStore.getState().sendMessage('رسالة بعد الملخص', longOpts);
    const turnCall = engine.calls[2];
    expect(turnCall.messages[0].role).toBe('system');
    expect(turnCall.messages[0].content).toContain('ملخص تجريبي للأحداث السابقة');
    expect(turnCall.messages[0].content).toContain('SYS');
  });

  it('respects the settings toggle and never runs when disabled', async () => {
    const engine = new ScriptedEngine(['اقتراح فقط']);
    setEngine(engine);
    await engine.load();
    await seedLongConversation();
    useSettingsStore.getState().setAutoSummary(false);
    await useChatStore.getState().runPostTurn();
    expect(useChatStore.getState().summarizing).toBe(false);
    // Only the suggestions pass ran — the summary pass was skipped entirely.
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0].messages[0].content).not.toBe(SUMMARY_SYSTEM_PROMPT);
    const listed = await repo.listConversations();
    expect(listed[0].summary ?? null).toBeNull();
  });

  it('an unusable summary result leaves nothing persisted', async () => {
    const engine = new ScriptedEngine(['  ']);
    setEngine(engine);
    await engine.load();
    await seedLongConversation();
    await useChatStore.getState().runPostTurn();
    expect(useChatStore.getState().summarizing).toBe(false);
    const listed = await repo.listConversations();
    expect(listed[0].summary ?? null).toBeNull();
  });

  it('sending while a summary pass runs cancels it first and the late result never commits', async () => {
    // ScriptedEngine cannot hang; simulate a slow pass by a gate at the engine level.
    class GatedEngine implements LlmEngine {
      loaded = false;
      stopCount = 0;
      calls: { resolve: (r: CompletionResult) => void; pending: boolean }[] = [];
      async load() {
        this.loaded = true;
      }
      isLoaded() {
        return this.loaded;
      }
      async complete(_messages: EngineMessage[], _opts: CompletionOptions): Promise<CompletionResult> {
        return new Promise((resolve) => {
          this.calls.push({ resolve, pending: true });
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
    const engine = new GatedEngine();
    setEngine(engine);
    await engine.load();
    await seedLongConversation();

    const run = useChatStore.getState().runPostTurn();
    await settle();
    expect(useChatStore.getState().summarizing).toBe(true);

    const turn = useChatStore.getState().sendMessage('رسالة جديدة', longOpts);
    await settle();
    expect(useChatStore.getState().summarizing).toBe(false);
    expect(useChatStore.getState().generating).toBe(true);

    engine.settle(1, 'رد الدور الجديد');
    await turn;
    await run;

    const listed = await repo.listConversations();
    expect(listed[0].summary ?? null).toBeNull();
    const s = useChatStore.getState();
    expect(s.messages[s.messages.length - 1].content).toBe('رد الدور الجديد');
  });
});
