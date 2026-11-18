// Copyright (c) 2026 DRS AI. All rights reserved.
import type { ChatMessage } from '../src/types';
import type { CompletionOptions, CompletionResult, EngineMessage, LlmEngine } from '../src/llm/engine';
import { MemoryChatRepository } from '../src/db/repository';
import { setChatRepository, useChatStore, type SendOptions } from '../src/store/chatStore';
import { setEngine } from '../src/store/llmStore';
import {
  buildVariantInstruction,
  buildVariantMessages,
  sanitizeVariant,
  variantTemperature,
  variantsUiState,
  VARIANT_COUNT,
  VARIANT_MAX_CHARS,
  VARIANT_MAX_TEMPERATURE,
  type VariantsUiInput,
} from '../src/utils/variants';

// ---------------------------------------------------------------------------
// variantTemperature — one table for the warm-up ladder
// ---------------------------------------------------------------------------

describe('variantTemperature', () => {
  const cases: { name: string; base: number; index: number; expected: number }[] = [
    { name: 'base at index 1 warms one step', base: 0.7, index: 1, expected: 0.9 },
    { name: 'index 2 warms two steps', base: 0.7, index: 2, expected: 1.1 },
    { name: 'zero base stays valid', base: 0, index: 1, expected: 0.2 },
    { name: 'clamped at the ceiling', base: 1.35, index: 2, expected: VARIANT_MAX_TEMPERATURE },
    { name: 'never negative', base: -5, index: 0, expected: 0 },
    { name: 'non-finite base falls back to 0.7', base: NaN, index: 1, expected: 0.9 },
    { name: 'rounded to two decimals', base: 0.333, index: 1, expected: 0.53 },
  ];
  it.each(cases)('$name', ({ base, index, expected }) => {
    expect(variantTemperature(base, index)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// buildVariantInstruction / buildVariantMessages — the "be different" contract
// ---------------------------------------------------------------------------

describe('buildVariantInstruction', () => {
  it('echoes the earlier variants so the model steers away from them', () => {
    const instruction = buildVariantInstruction(['الرد الأول الطويل هنا', 'الثاني'], 2);
    expect(instruction).toContain('الرد الأول الطويل');
    expect(instruction).toContain('«الثاني»');
    expect(instruction).toContain('Avoid repeating');
  });

  it('truncates long echoes to the head of each variant', () => {
    const long = 'و'.repeat(500);
    const instruction = buildVariantInstruction([long], 1);
    expect(instruction).not.toContain(long);
    expect(instruction).toContain('«' + 'و'.repeat(160));
  });

  it('has a different fixed phrasing per index', () => {
    const first = buildVariantInstruction([], 1);
    const second = buildVariantInstruction([], 2);
    expect(first).not.toBe(second);
  });
});

describe('buildVariantMessages', () => {
  const history: ChatMessage[] = [
    msg('u1', 'user', 'اشرح لي فكرة بسيطة'),
    msg('a1', 'assistant', 'فكرة الرد الأصلي'),
  ];

  it('keeps the persona system prompt and ends with the trigger turn', () => {
    const built = buildVariantMessages(history, 'شخصية رفيق', 2048, 256, ['فكرة الرد الأصلي'], 1);
    expect(built[0]).toEqual({ role: 'system', content: 'شخصية رفيق' });
    const last = built[built.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('Avoid repeating');
    expect(built.some((m) => m.content === 'فكرة الرد الأصلي')).toBe(true);
  });

  it('passes the full history through unchanged', () => {
    const built = buildVariantMessages(history, '', 2048, 256, [], 1);
    expect(built.some((m) => m.content === 'اشرح لي فكرة بسيطة')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sanitizeVariant — clean, distinct, bounded drafts only
// ---------------------------------------------------------------------------

describe('sanitizeVariant', () => {
  const cases: { name: string; raw: string; previous: string[]; expected: string | null }[] = [
    { name: 'clean text passes through', raw: 'صيغة مختلفة تمامًا', previous: [], expected: 'صيغة مختلفة تمامًا' },
    { name: 'trailing stop marker stripped', raw: 'صيغة مختلفة <|im_end|>', previous: [], expected: 'صيغة مختلفة' },
    { name: 'whitespace-only output dropped', raw: '   \n  ', previous: [], expected: null },
    { name: 'empty output dropped', raw: '', previous: [], expected: null },
    { name: 'exact repeat of an earlier variant dropped', raw: 'نفس الرد', previous: ['نفس الرد'], expected: null },
    { name: 'case and spacing do not fool the dedupe', raw: '  SAME   Reply ', previous: ['same reply'], expected: null },
    { name: 'runaway output dropped', raw: 'ط'.repeat(VARIANT_MAX_CHARS + 1), previous: [], expected: null },
    { name: 'different text survives earlier variants', raw: 'بديل جديد', previous: ['قديم'], expected: 'بديل جديد' },
  ];
  it.each(cases)('$name', ({ raw, previous, expected }) => {
    expect(sanitizeVariant(raw, previous)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// variantsUiState — what the switcher under the reply shows
// ---------------------------------------------------------------------------

describe('variantsUiState', () => {
  const base: VariantsUiInput = {
    engineReady: true,
    generating: false,
    editing: false,
    variantsBusy: false,
    variants: { forMessageId: 'a1', items: ['الأصل', 'بديل ٢', 'بديل ٣'], stats: [], activeIndex: 0 },
    newestId: 'a1',
    newestRole: 'assistant',
    newestContent: 'الأصل',
  };
  const cases: { name: string; over: Partial<VariantsUiInput>; expected: string }[] = [
    { name: 'ready drafts show the switcher', over: {}, expected: 'ready' },
    { name: 'a running pass shows the loader', over: { variantsBusy: true }, expected: 'loading' },
    { name: 'drafts for an older reply stay hidden', over: { newestId: 'a9' }, expected: 'hidden' },
    { name: 'streaming a new turn hides everything', over: { generating: true }, expected: 'hidden' },
    { name: 'an open inline edit hides the row', over: { editing: true }, expected: 'hidden' },
    { name: 'no loaded engine hides the row', over: { engineReady: false }, expected: 'hidden' },
    { name: 'a user message as newest hides the row', over: { newestRole: 'user', newestId: 'u1' }, expected: 'hidden' },
    { name: 'an empty newest reply hides the row', over: { newestContent: '  ' }, expected: 'hidden' },
    { name: 'no drafts while idle hides the row', over: { variants: null }, expected: 'hidden' },
    {
      name: 'single-item list (every extra pass rejected) stays hidden',
      over: { variants: { forMessageId: 'a1', items: ['الأصل'], stats: [], activeIndex: 0 } },
      expected: 'hidden',
    },
  ];
  it.each(cases)('$name', ({ over, expected }) => {
    expect(variantsUiState({ ...base, ...over })).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// chatStore integration — engine serialization and the keep/preview lifecycle
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

describe('chatStore variants', () => {
  let repo: MemoryChatRepository;
  /** Seeds a finished turn in both the store and the memory repository. */
  const replyOnly = async (reply: string) => {
    await repo.insertConversation({
      id: 'c1',
      title: 'T',
      modelId: null,
      createdAt: 0,
      updatedAt: 0,
      pinned: false,
      archived: false,
      systemPrompt: '',
    });
    const u = msg('u1', 'user', 'hi');
    const a = { ...msg('a1', 'assistant', reply), createdAt: 2 };
    await repo.insertMessage(u);
    await repo.insertMessage(a);
    useChatStore.setState({
      currentId: 'c1',
      messages: [u, a],
      conversations: [
        { id: 'c1', title: 'T', modelId: null, createdAt: 0, updatedAt: 0, pinned: false, archived: false, systemPrompt: '' },
      ],
    });
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
    });
    return useChatStore.getState().init();
  });

  it('prepares VARIANT_COUNT-1 extra drafts and parks them behind the switcher', async () => {
    const engine = new ScriptedEngine(['الرد الأصلي', 'صيغة ثانية مختلفة', 'صيغة ثالثة مختلفة']);
    setEngine(engine);
    await engine.load();
    await useChatStore.getState().sendMessage('مرحبا', sendOpts);
    expect(useChatStore.getState().variants).toBeNull();

    await useChatStore.getState().prepareVariants(sendOpts);
    const s = useChatStore.getState();
    expect(s.variantsBusy).toBe(false);
    expect(s.variants?.forMessageId).toBe(s.messages[1].id);
    expect(s.variants?.items).toEqual(['الرد الأصلي', 'صيغة ثانية مختلفة', 'صيغة ثالثة مختلفة']);
    expect(s.variants?.activeIndex).toBe(0);

    // Each extra pass warms the sampling and echoes the earlier drafts.
    expect(engine.calls).toHaveLength(VARIANT_COUNT - 1 + 1);
    expect(engine.calls[1].opts.temperature).toBeCloseTo(0.7);
    expect(engine.calls[2].opts.temperature).toBeCloseTo(0.9);
    const secondInstruction = engine.calls[2].messages[engine.calls[2].messages.length - 1].content;
    expect(secondInstruction).toContain('صيغة ثانية مختلفة');
  });

  it('drops duplicate or empty passes and hides the switcher when nothing usable remains', async () => {
    const engine = new ScriptedEngine(['الرد الأصلي', 'الرد الأصلي', '']);
    setEngine(engine);
    await engine.load();
    replyOnly('الرد الأصلي');
    await useChatStore.getState().prepareVariants(sendOpts);
    const s = useChatStore.getState();
    expect(s.variantsBusy).toBe(false);
    expect(s.variants).toBeNull();
  });

  it('navigates with wrap-around without touching storage', async () => {
    // The reply is seeded directly, so the engine results are the two extra drafts.
    const engine = new ScriptedEngine(['بديل ٢', 'بديل ٣']);
    setEngine(engine);
    await engine.load();
    await replyOnly('الأصل');
    await useChatStore.getState().prepareVariants(sendOpts);
    const store = useChatStore.getState();

    store.cycleVariant(1);
    expect(useChatStore.getState().variants?.activeIndex).toBe(1);
    useChatStore.getState().cycleVariant(1);
    expect(useChatStore.getState().variants?.activeIndex).toBe(2);
    useChatStore.getState().cycleVariant(1); // wraps to the start
    expect(useChatStore.getState().variants?.activeIndex).toBe(0);
    useChatStore.getState().cycleVariant(-1); // wraps backwards to the end
    expect(useChatStore.getState().variants?.activeIndex).toBe(2);

    // Preview only: the persisted message and the repository stay on the original.
    expect(useChatStore.getState().messages[1].content).toBe('الأصل');
    const persisted = (await repo.listMessages('c1')).find((m) => m.id === 'a1');
    expect(persisted?.content).toBe('الأصل');
  });

  it('keepVariant writes the previewed draft over the reply everywhere', async () => {
    const engine = new ScriptedEngine(['بديل محفوظ', 'بديل آخر']);
    setEngine(engine);
    await engine.load();
    await replyOnly('الأصل');
    await useChatStore.getState().prepareVariants(sendOpts);
    useChatStore.getState().cycleVariant(1);

    await useChatStore.getState().keepVariant();
    const s = useChatStore.getState();
    expect(s.variants).toBeNull();
    expect(s.messages[1].content).toBe('بديل محفوظ');
    expect(s.conversations[0].lastPreview).toBe('بديل محفوظ');
    const persisted = (await repo.listMessages('c1')).find((m) => m.id === 'a1');
    expect(persisted?.content).toBe('بديل محفوظ');
  });

  it('keepVariant on the original just drops the switcher', async () => {
    const engine = new ScriptedEngine(['بديل ٢', 'بديل ٣']);
    setEngine(engine);
    await engine.load();
    await replyOnly('الأصل');
    await useChatStore.getState().prepareVariants(sendOpts);
    await useChatStore.getState().keepVariant();
    const s = useChatStore.getState();
    expect(s.variants).toBeNull();
    expect(s.messages[1].content).toBe('الأصل');
    const persisted = (await repo.listMessages('c1')).find((m) => m.id === 'a1');
    expect(persisted?.content).toBe('الأصل');
  });

  it('dismissVariants while a pass runs stops the engine and the late result never commits', async () => {
    const engine = new GatedEngine();
    setEngine(engine);
    await engine.load();
    await replyOnly('الأصل');

    const run = useChatStore.getState().prepareVariants(sendOpts);
    await settle();
    expect(useChatStore.getState().variantsBusy).toBe(true);

    await useChatStore.getState().dismissVariants();
    expect(engine.stopCount).toBeGreaterThanOrEqual(1);
    expect(useChatStore.getState().variantsBusy).toBe(false);
    expect(useChatStore.getState().variants).toBeNull();

    // The hung pass resolves after the dismiss; it must stay discarded.
    engine.settle(0, 'صيغة متأخرة');
    await run;
    await settle();
    expect(useChatStore.getState().variants).toBeNull();
  });

  it('sending while drafts are prepared cancels them first', async () => {
    const engine = new GatedEngine();
    setEngine(engine);
    await engine.load();
    await replyOnly('الأصل');

    const run = useChatStore.getState().prepareVariants(sendOpts);
    await settle();
    expect(useChatStore.getState().variantsBusy).toBe(true);

    const turn = useChatStore.getState().sendMessage('رسالة جديدة', sendOpts);
    await settle();
    // The turn must own the engine now: drafts were freed before it started.
    expect(useChatStore.getState().variantsBusy).toBe(false);
    expect(useChatStore.getState().variants).toBeNull();
    expect(useChatStore.getState().generating).toBe(true);

    engine.settle(1, 'رد الدور الجديد');
    await turn;
    await run;
    const s = useChatStore.getState();
    expect(s.generating).toBe(false);
    expect(s.messages.map((m) => m.content)).toEqual(['hi', 'الأصل', 'رسالة جديدة', 'رد الدور الجديد']);
    expect(s.variants).toBeNull();
  });

  it('refuses to prepare while a real turn streams or the newest message is not a reply', async () => {
    const engine = new ScriptedEngine([]);
    setEngine(engine);
    await engine.load();
    useChatStore.setState({ currentId: 'c1', messages: [msg('u1', 'user', 'hi')], generating: true });
    await useChatStore.getState().prepareVariants(sendOpts);
    expect(engine.calls).toHaveLength(0);
    expect(useChatStore.getState().variants).toBeNull();

    useChatStore.setState({ generating: false });
    await useChatStore.getState().prepareVariants(sendOpts);
    expect(engine.calls).toHaveLength(0);
    expect(useChatStore.getState().variants).toBeNull();
  });

  it('refuses to prepare without a loaded engine and surfaces NO_MODEL', async () => {
    setEngine(new ScriptedEngine([]));
    await replyOnly('الأصل');
    await useChatStore.getState().prepareVariants(sendOpts);
    const s = useChatStore.getState();
    expect(s.variants).toBeNull();
    expect(s.error).toBe('NO_MODEL');
  });

  it('deleting the reply drops its drafts', async () => {
    const engine = new ScriptedEngine(['الأصل', 'بديل ٢', 'بديل ٣']);
    setEngine(engine);
    await engine.load();
    await replyOnly('الأصل');
    await useChatStore.getState().prepareVariants(sendOpts);
    expect(useChatStore.getState().variants).not.toBeNull();
    await useChatStore.getState().deleteMessage('a1');
    expect(useChatStore.getState().variants).toBeNull();
  });
});
