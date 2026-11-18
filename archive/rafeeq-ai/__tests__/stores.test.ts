// Copyright (c) 2026 DRS AI. All rights reserved.
import { MemoryChatRepository } from '../src/db/repository';
import type { CompletionOptions, CompletionResult, EngineMessage, LlmEngine } from '../src/llm/engine';
import { CATALOG } from '../src/models/catalog';
import { effectiveSystemPrompt, setChatRepository, useChatStore } from '../src/store/chatStore';
import { setEngine, useLlmStore } from '../src/store/llmStore';
import { setDownloadTransport, useModelStore } from '../src/store/modelStore';
import { clampTemperature, DEFAULT_SETTINGS, useSettingsStore } from '../src/store/settingsStore';
import { FakeTransport, flush } from './fakeTransport';

class FakeEngine implements LlmEngine {
  loaded = false;
  lastMessages: EngineMessage[] = [];
  lastOpts: CompletionOptions | null = null;
  tokens = ['مر', 'حبا', '!'];
  fail: Error | null = null;
  async load() {
    this.loaded = true;
  }
  isLoaded() {
    return this.loaded;
  }
  async complete(
    messages: EngineMessage[],
    opts: CompletionOptions,
    onToken: (t: string) => void,
  ): Promise<CompletionResult> {
    this.lastMessages = messages;
    this.lastOpts = opts;
    for (const t of this.tokens) onToken(t);
    if (this.fail) throw this.fail;
    return { text: this.tokens.join(''), tokensPerSecond: 12.5, tokenCount: 42, stoppedByUser: false };
  }
  async stop() {}
  async release() {
    this.loaded = false;
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

describe('settingsStore', () => {
  beforeEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));
  it('defaults to Arabic', () => {
    expect(useSettingsStore.getState().language).toBe('ar');
  });
  it('clamps temperature and validates option values', () => {
    const s = useSettingsStore.getState();
    s.setTemperature(5);
    expect(useSettingsStore.getState().temperature).toBe(2);
    s.setTemperature(-1);
    expect(useSettingsStore.getState().temperature).toBe(0);
    expect(clampTemperature(0.74)).toBe(0.7);
    s.setContextSize(1234);
    expect(useSettingsStore.getState().contextSize).toBe(2048);
    s.setContextSize(4096);
    expect(useSettingsStore.getState().contextSize).toBe(4096);
    s.setMaxTokens(7);
    expect(useSettingsStore.getState().maxTokens).toBe(512);
  });
  it('persists to the KV store', () => {
    useSettingsStore.getState().setLanguage('en');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Storage } = require('expo-sqlite/kv-store');
    const saved = JSON.parse(Storage.getItemSync('rafeeq.settings.v1'));
    expect(saved.state.language).toBe('en');
  });
});

describe('chatStore', () => {
  let repo: MemoryChatRepository;
  let engine: FakeEngine;
  beforeEach(async () => {
    repo = new MemoryChatRepository();
    engine = new FakeEngine();
    setChatRepository(repo);
    setEngine(engine);
    useChatStore.setState({
      conversations: [],
      trash: [],
      currentId: null,
      messages: [],
      generating: false,
      streamingMessageId: null,
      error: null,
    });
    await useChatStore.getState().init();
  });

  it('refuses to send without a loaded model', async () => {
    await useChatStore.getState().sendMessage('hi', sendOpts);
    expect(useChatStore.getState().error).toBe('NO_MODEL');
    expect(repo.conversations.size).toBe(0);
  });

  it('creates a conversation, streams, and persists both messages', async () => {
    await engine.load();
    const id = await useChatStore.getState().sendMessage('  ما هو رفيق؟ ', sendOpts);
    const s = useChatStore.getState();
    expect(id).toBeTruthy();
    expect(s.currentId).toBe(id);
    expect(s.generating).toBe(false);
    expect(s.conversations[0].title).toBe('ما هو رفيق؟');
    expect(s.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'ما هو رفيق؟'],
      ['assistant', 'مرحبا!'],
    ]);
    expect(s.messages[1].tokensPerSecond).toBe(12.5);
    expect(engine.lastMessages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(engine.lastOpts).toEqual({ temperature: 0.5, maxTokens: 128 });
    const stored = await repo.listMessages(id!);
    expect(stored.map((m) => m.content)).toEqual(['ما هو رفيق؟', 'مرحبا!']);
  });

  it('continues an existing conversation with history', async () => {
    await engine.load();
    const id = await useChatStore.getState().sendMessage('one', sendOpts);
    await useChatStore.getState().sendMessage('two', sendOpts);
    expect(useChatStore.getState().currentId).toBe(id);
    expect(engine.lastMessages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(repo.conversations.size).toBe(1);
  });

  it('keeps partial text and surfaces the error when generation fails', async () => {
    await engine.load();
    engine.fail = new Error('boom');
    const id = await useChatStore.getState().sendMessage('hi', sendOpts);
    expect(useChatStore.getState().error).toBe('boom');
    const stored = await repo.listMessages(id!);
    expect(stored[1].content).toBe('مرحبا!');
  });

  it('drops an empty assistant reply', async () => {
    await engine.load();
    engine.tokens = [];
    engine.complete = async () => ({ text: '', tokensPerSecond: null, tokenCount: null, stoppedByUser: true });
    const id = await useChatStore.getState().sendMessage('hi', sendOpts);
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(await repo.listMessages(id!)).toHaveLength(1);
  });

  it('renames, reopens, trashes and restores conversations', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hello', sendOpts))!;
    await useChatStore.getState().renameConversation(id, '  Renamed ');
    expect(useChatStore.getState().conversations[0].title).toBe('Renamed');
    expect(repo.conversations.get(id)!.title).toBe('Renamed');
    await useChatStore.getState().openConversation(null);
    expect(useChatStore.getState().messages).toHaveLength(0);
    await useChatStore.getState().openConversation(id);
    expect(useChatStore.getState().messages).toHaveLength(2);

    // Deletion is soft: the conversation rests in the trash, messages intact.
    await useChatStore.getState().deleteConversation(id);
    expect(useChatStore.getState().conversations).toHaveLength(0);
    expect(useChatStore.getState().currentId).toBeNull();
    expect(useChatStore.getState().trash.map((c) => c.id)).toEqual([id]);
    expect(repo.messages.size).toBe(2);

    // Undo: restoring puts it back with both messages.
    await useChatStore.getState().restoreConversation(id);
    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(useChatStore.getState().trash).toHaveLength(0);
    expect(await repo.listMessages(id)).toHaveLength(2);

    // Purging from the trash removes it for good.
    await useChatStore.getState().deleteConversation(id);
    await useChatStore.getState().purgeConversation(id);
    expect(useChatStore.getState().trash).toHaveLength(0);
    expect(repo.messages.size).toBe(0);
  });

  it('pins a conversation to the top and unpins it back', async () => {
    await engine.load();
    const first = (await useChatStore.getState().sendMessage('older', sendOpts))!;
    await useChatStore.getState().openConversation(null);
    // Ensure the second conversation gets a strictly newer updatedAt (fake engines
    // finish instantly, so both could otherwise land in the same millisecond).
    await new Promise((r) => setTimeout(r, 5));
    const second = (await useChatStore.getState().sendMessage('newer', sendOpts))!;
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([second, first]);

    await useChatStore.getState().setConversationPinned(first, true);
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([first, second]);
    expect(repo.conversations.get(first)!.pinned).toBe(true);

    await useChatStore.getState().setConversationPinned(first, false);
    expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual([second, first]);
    expect(repo.conversations.get(first)!.pinned).toBe(false);
  });

  it('saves a per-conversation persona, trims it, and persists the override', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    await useChatStore.getState().setConversationSystemPrompt(id, '  أنت مترجم دقيق.  ');
    expect(useChatStore.getState().conversations[0].systemPrompt).toBe('أنت مترجم دقيق.');
    expect(repo.conversations.get(id)!.systemPrompt).toBe('أنت مترجم دقيق.');
    // New conversations start with no override.
    await useChatStore.getState().openConversation(null);
    const fresh = (await useChatStore.getState().sendMessage('second chat', sendOpts))!;
    expect(repo.conversations.get(fresh)!.systemPrompt).toBe('');
  });

  it('clears the persona with an empty value so the conversation inherits the global prompt', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    await useChatStore.getState().setConversationSystemPrompt(id, 'PER');
    await useChatStore.getState().setConversationSystemPrompt(id, '   ');
    expect(useChatStore.getState().conversations[0].systemPrompt).toBe('');
    expect(repo.conversations.get(id)!.systemPrompt).toBe('');
  });

  it('prefers the conversation persona over the global prompt when building a turn', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    await useChatStore.getState().setConversationSystemPrompt(id, 'PER');
    const conv = useChatStore.getState().conversations[0];
    expect(effectiveSystemPrompt(conv, 'GLOBAL')).toBe('PER');
    // Sending with the UI-composed options sends the persona, not the global prompt.
    await useChatStore.getState().sendMessage('من أنت؟', { ...sendOpts, systemPrompt: effectiveSystemPrompt(conv, 'GLOBAL') });
    expect(engine.lastMessages[0]).toEqual({ role: 'system', content: 'PER' });
  });

  it('falls back to the global prompt when there is no persona (helper contract)', () => {
    expect(effectiveSystemPrompt({ systemPrompt: '  P  ' }, 'GLOBAL')).toBe('P');
    expect(effectiveSystemPrompt({ systemPrompt: '   ' }, 'GLOBAL')).toBe('GLOBAL');
    expect(effectiveSystemPrompt(undefined, 'GLOBAL')).toBe('GLOBAL');
    expect(effectiveSystemPrompt(undefined, '  ')).toBe('');
  });

  it('archives and unarchives a conversation, persisting the flag without touching messages', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    expect(repo.conversations.get(id)!.archived).toBe(false);

    await useChatStore.getState().setConversationArchived(id, true);
    expect(useChatStore.getState().conversations[0].archived).toBe(true);
    expect(repo.conversations.get(id)!.archived).toBe(true);
    // Archiving is not deletion: the messages stay in the repository.
    expect((await repo.listMessages(id)).map((m) => m.content)).toEqual(['hi', 'مرحبا!']);

    await useChatStore.getState().setConversationArchived(id, false);
    expect(useChatStore.getState().conversations[0].archived).toBe(false);
    expect(repo.conversations.get(id)!.archived).toBe(false);
  });

  it('files a conversation into a folder and clears the folder with a blank name', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;

    await useChatStore.getState().setConversationFolder(id, '  العمل  ');
    // The name lands normalized both in the store and the repository.
    expect(useChatStore.getState().conversations[0].folder).toBe('العمل');
    expect(repo.conversations.get(id)!.folder).toBe('العمل');

    await useChatStore.getState().setConversationFolder(id, '   ');
    expect(useChatStore.getState().conversations[0].folder).toBeNull();
    expect(repo.conversations.get(id)!.folder).toBeNull();
  });

  it('schedules a conversation reminder, refuses a stale stamp and clears it', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;

    const at = Date.now() + 3_600_000;
    await useChatStore.getState().setConversationReminder(id, at);
    // The stamp lands both in the store and the repository.
    expect(useChatStore.getState().conversations[0].remindAt).toBe(at);
    expect(repo.conversations.get(id)!.remindAt).toBe(at);

    // A stamp in the past (or below the lead time) collapses to "no reminder".
    await useChatStore.getState().setConversationReminder(id, Date.now() - 1000);
    expect(useChatStore.getState().conversations[0].remindAt).toBeNull();
    expect(repo.conversations.get(id)!.remindAt).toBeNull();

    // Clearing explicitly works the same way.
    await useChatStore.getState().setConversationReminder(id, Date.now() + 7_200_000);
    await useChatStore.getState().setConversationReminder(id, null);
    expect(repo.conversations.get(id)!.remindAt).toBeNull();
  });

  it('keeps an archived conversation archived when the user replies to it from search', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    await useChatStore.getState().setConversationArchived(id, true);
    // Reopen the archived conversation directly (as a search hit would) and reply.
    await useChatStore.getState().openConversation(id);
    await useChatStore.getState().sendMessage('مرة أخرى', sendOpts);
    expect(repo.conversations.get(id)!.archived).toBe(true);
    expect(useChatStore.getState().conversations[0].archived).toBe(true);
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual(['hi', 'مرحبا!', 'مرة أخرى', 'مرحبا!']);
  });

  it('regenerates the last reply from the same context', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    engine.tokens = ['بديل'];
    await useChatStore.getState().regenerate(sendOpts);
    const s = useChatStore.getState();
    expect(s.error).toBeNull();
    expect(s.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'بديل'],
    ]);
    // The discarded reply must not leak back into the prompt.
    expect(engine.lastMessages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(s.generating).toBe(false);
    expect(s.streamingMessageId).toBeNull();
    expect((await repo.listMessages(id)).map((m) => m.content)).toEqual(['hi', 'بديل']);
  });

  it('regenerates only the last turn of a longer conversation', async () => {
    await engine.load();
    await useChatStore.getState().sendMessage('one', sendOpts);
    await useChatStore.getState().sendMessage('two', sendOpts);
    engine.tokens = ['ثانية'];
    await useChatStore.getState().regenerate(sendOpts);
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual(['one', 'مرحبا!', 'two', 'ثانية']);
    expect(engine.lastMessages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(engine.lastMessages[engine.lastMessages.length - 1]).toEqual({ role: 'user', content: 'two' });
  });

  it('refuses to regenerate while generating', async () => {
    await engine.load();
    let release!: (v: CompletionResult) => void;
    const spy = jest.spyOn(engine, 'complete');
    spy.mockImplementation(
      () =>
        new Promise<CompletionResult>((res) => {
          release = (v) => res(v);
        }),
    );
    const sending = useChatStore.getState().sendMessage('hi', sendOpts);
    await flush();
    expect(useChatStore.getState().generating).toBe(true);
    await useChatStore.getState().regenerate(sendOpts);
    expect(spy).toHaveBeenCalledTimes(1);
    release({ text: 'تم', tokensPerSecond: null, tokenCount: null, stoppedByUser: false });
    await sending;
    expect(useChatStore.getState().generating).toBe(false);
    spy.mockRestore();
  });

  it('refuses to regenerate without a loaded model and no-ops on an empty chat', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    setEngine(new FakeEngine());
    await useChatStore.getState().regenerate(sendOpts);
    expect(useChatStore.getState().error).toBe('NO_MODEL');
    expect(await repo.listMessages(id)).toHaveLength(2);
    await useChatStore.getState().openConversation(null);
    await useChatStore.getState().regenerate(sendOpts);
    expect(useChatStore.getState().currentId).toBeNull();
  });

  it('answers a dangling user message that never got a reply', async () => {
    await engine.load();
    engine.tokens = [];
    engine.complete = async () => ({ text: '', tokensPerSecond: null, tokenCount: null, stoppedByUser: true });
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    expect(useChatStore.getState().messages).toHaveLength(1);
    engine.tokens = ['أهلاً'];
    engine.complete = async (_messages, _opts, onToken) => {
      for (const tk of engine.tokens) onToken(tk);
      return { text: engine.tokens.join(''), tokensPerSecond: 9, tokenCount: 9, stoppedByUser: false };
    };
    await useChatStore.getState().regenerate(sendOpts);
    expect(useChatStore.getState().messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hi'],
      ['assistant', 'أهلاً'],
    ]);
    expect(await repo.listMessages(id)).toHaveLength(2);
  });

  it('edits a user message, drops the later turns and answers the new text', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('سؤال قديم', sendOpts))!;
    await new Promise((r) => setTimeout(r, 5));
    await useChatStore.getState().sendMessage('سؤال ثانٍ', sendOpts);
    expect(useChatStore.getState().messages).toHaveLength(4);

    const firstUser = (await repo.listMessages(id)).find((m) => m.role === 'user')!;
    engine.tokens = ['جواب', ' جديد'];
    await useChatStore.getState().editUserMessage(firstUser.id, '  سؤال معدَّل  ', sendOpts);
    const s = useChatStore.getState();
    expect(s.currentId).toBe(id);
    expect(s.error).toBeNull();
    expect(s.generating).toBe(false);
    expect(s.streamingMessageId).toBeNull();
    // Everything after the edited message is gone; the new text replaced the old one.
    expect(s.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'سؤال معدَّل'],
      ['assistant', 'جواب جديد'],
    ]);
    expect(engine.lastMessages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(engine.lastMessages[engine.lastMessages.length - 1]).toEqual({ role: 'user', content: 'سؤال معدَّل' });
    // Persistence agrees with the state: later turns deleted, edit written back.
    const stored = await repo.listMessages(id);
    expect(stored.map((m) => [m.role, m.content])).toEqual([
      ['user', 'سؤال معدَّل'],
      ['assistant', 'جواب جديد'],
    ]);
  });

  it('rejects invalid edits without touching the conversation', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    const assistantId = useChatStore.getState().messages[1].id;

    // No-op: editing an assistant message, empty text, or an unknown id.
    await useChatStore.getState().editUserMessage(assistantId, 'nope', sendOpts);
    await useChatStore.getState().editUserMessage('m_missing', 'nope', sendOpts);
    await useChatStore.getState().editUserMessage(useChatStore.getState().messages[0].id, '   ', sendOpts);
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual(['hi', 'مرحبا!']);
    expect(useChatStore.getState().error).toBeNull();
    expect((await repo.listMessages(id)).map((m) => m.content)).toEqual(['hi', 'مرحبا!']);
  });

  it('refuses to edit without a loaded model or while generating', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('hi', sendOpts))!;
    const userId = useChatStore.getState().messages[0].id;

    setEngine(new FakeEngine());
    await useChatStore.getState().editUserMessage(userId, 'edited', sendOpts);
    expect(useChatStore.getState().error).toBe('NO_MODEL');
    expect((await repo.listMessages(id)).map((m) => m.content)).toEqual(['hi', 'مرحبا!']);

    // While a reply is streaming, edits are refused as well.
    let release!: (v: CompletionResult) => void;
    const busy = new FakeEngine();
    setEngine(busy);
    await busy.load();
    const spy = jest.spyOn(busy, 'complete');
    spy.mockImplementation(
      () =>
        new Promise<CompletionResult>((res) => {
          release = (v) => res(v);
        }),
    );
    const sending = useChatStore.getState().sendMessage('another', sendOpts);
    await flush();
    expect(useChatStore.getState().generating).toBe(true);
    const target = useChatStore.getState().messages[0].id;
    await useChatStore.getState().editUserMessage(target, 'edited', sendOpts);
    expect(spy).toHaveBeenCalledTimes(1);
    release({ text: 'تم', tokensPerSecond: null, tokenCount: null, stoppedByUser: false });
    await sending;
    spy.mockRestore();
  });

  it('deletes a single message from state and repository, leaving the turns around it', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('سؤال', sendOpts))!;
    await new Promise((r) => setTimeout(r, 5));
    await useChatStore.getState().sendMessage('سؤال ثانٍ', sendOpts);
    expect(useChatStore.getState().messages).toHaveLength(4);

    const replyId = useChatStore.getState().messages[1].id;
    await useChatStore.getState().deleteMessage(replyId);
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual(['سؤال', 'سؤال ثانٍ', 'مرحبا!']);
    expect((await repo.listMessages(id)).map((m) => m.content)).toEqual(['سؤال', 'سؤال ثانٍ', 'مرحبا!']);

    // Unknown ids are safe no-ops.
    await useChatStore.getState().deleteMessage('m_missing');
    expect(useChatStore.getState().messages).toHaveLength(3);
  });

  it('stores the quote reference on the new user message and clears it when the quoted message is deleted', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('الرسالة الأصلية', sendOpts))!;
    const firstUser = (await repo.listMessages(id)).find((m) => m.role === 'user')!;

    await useChatStore.getState().sendMessage('وبما يخص هذه؟', { ...sendOpts, replyTo: firstUser.id });
    const quoted = useChatStore.getState().messages.find((m) => m.content === 'وبما يخص هذه؟')!;
    expect(quoted.replyToId).toBe(firstUser.id);
    expect((await repo.listMessages(id)).find((m) => m.id === quoted.id)!.replyToId).toBe(firstUser.id);
    // A send without the option carries no reference at all.
    expect(useChatStore.getState().messages.find((m) => m.role === 'assistant')!.replyToId ?? null).toBeNull();

    // Deleting the quoted message nulls the reference in state and repository.
    await useChatStore.getState().deleteMessage(firstUser.id);
    expect(useChatStore.getState().messages.find((m) => m.id === quoted.id)!.replyToId).toBeNull();
    expect((await repo.listMessages(id)).find((m) => m.id === quoted.id)!.replyToId).toBeNull();
  });

  it('keeps the conversation list preview in step with sends, deletes and edits', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('سؤال عن الطقس', sendOpts))!;
    // The awaited send has already settled: the finished reply is the preview.
    expect(useChatStore.getState().conversations[0].lastPreview).toBe('مرحبا!');
    const lastMsg = useChatStore.getState().messages[useChatStore.getState().messages.length - 1];
    expect(useChatStore.getState().conversations[0].lastMessageAt).toBe(lastMsg.createdAt);

    // Deleting the last message falls back to the previous one.
    await useChatStore.getState().deleteMessage(lastMsg.id);
    expect(useChatStore.getState().conversations[0].lastPreview).toBe('سؤال عن الطقس');
    expect(useChatStore.getState().conversations[0].lastMessageAt).toBe(
      useChatStore.getState().messages[useChatStore.getState().messages.length - 1].createdAt,
    );

    // Editing the first user message refreshes the preview with the new text.
    const firstUser = (await repo.listMessages(id)).find((m) => m.role === 'user')!;
    engine.tokens = ['رد'];
    await useChatStore.getState().editUserMessage(firstUser.id, 'سؤال معدَّل تمامًا', sendOpts);
    expect(useChatStore.getState().conversations[0].lastPreview).toBe('رد');
    // The repository recomputes the same preview on the next refresh.
    await useChatStore.getState().refreshConversations();
    expect(useChatStore.getState().conversations[0].lastPreview).toBe('رد');
  });

  it('refuses to delete while generating, then allows it afterwards', async () => {
    await engine.load();
    await useChatStore.getState().sendMessage('hi', sendOpts);
    let release!: (v: CompletionResult) => void;
    const spy = jest.spyOn(engine, 'complete');
    spy.mockImplementation(
      () =>
        new Promise<CompletionResult>((res) => {
          release = (v) => res(v);
        }),
    );
    const sending = useChatStore.getState().sendMessage('another', sendOpts);
    await flush();
    expect(useChatStore.getState().generating).toBe(true);

    const target = useChatStore.getState().messages[0].id;
    await useChatStore.getState().deleteMessage(target);
    expect(useChatStore.getState().messages).toHaveLength(4);

    release({ text: 'تم', tokensPerSecond: null, tokenCount: null, stoppedByUser: false });
    await sending;
    spy.mockRestore();
    expect(useChatStore.getState().messages).toHaveLength(4);
    await useChatStore.getState().deleteMessage(target);
    expect(useChatStore.getState().messages.map((m) => m.content)).toEqual(['مرحبا!', 'another', 'تم']);
  });

  it('pins and unpins a message, keeping exactly one pin per conversation', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('سؤال', sendOpts))!;
    const [userMsg, replyMsg] = useChatStore.getState().messages;

    await useChatStore.getState().setMessagePin(id, userMsg.id);
    expect(useChatStore.getState().conversations[0].pinnedMessageId).toBe(userMsg.id);
    expect((await repo.listConversations())[0].pinnedMessageId).toBe(userMsg.id);

    // Pinning another message moves the single pin there.
    await useChatStore.getState().setMessagePin(id, replyMsg.id);
    expect(useChatStore.getState().conversations[0].pinnedMessageId).toBe(replyMsg.id);

    // Null clears the pin on screen and in storage.
    await useChatStore.getState().setMessagePin(id, null);
    expect(useChatStore.getState().conversations[0].pinnedMessageId).toBeNull();
    expect((await repo.listConversations())[0].pinnedMessageId).toBeNull();
  });

  it('clears the pin when the pinned message is deleted, regenerated or edited away', async () => {
    await engine.load();
    const id = (await useChatStore.getState().sendMessage('سؤال', sendOpts))!;
    const firstReply = useChatStore.getState().messages[1].id;
    await useChatStore.getState().setMessagePin(id, firstReply);

    // Regenerate deletes the pinned reply and produces a new one: pin is gone.
    await useChatStore.getState().regenerate(sendOpts);
    const afterRegen = useChatStore.getState();
    expect(afterRegen.messages).toHaveLength(2);
    expect(afterRegen.conversations[0].pinnedMessageId).toBeNull();
    expect((await repo.listConversations())[0].pinnedMessageId).toBeNull();

    // Deleting the current reply that holds a pin drops it too.
    const newReply = afterRegen.messages[1].id;
    await useChatStore.getState().setMessagePin(id, newReply);
    await useChatStore.getState().deleteMessage(newReply);
    expect(useChatStore.getState().conversations[0].pinnedMessageId).toBeNull();

    // Editing the first user message rewrites every later turn: the pin clears.
    await useChatStore.getState().sendMessage('سؤال ثانٍ', sendOpts);
    const lastReply = useChatStore.getState().messages[useChatStore.getState().messages.length - 1].id;
    await useChatStore.getState().setMessagePin(id, lastReply);
    const firstUser = useChatStore.getState().messages[0].id;
    await useChatStore.getState().editUserMessage(firstUser, 'نص جديد', sendOpts);
    expect(useChatStore.getState().conversations[0].pinnedMessageId).toBeNull();
    expect((await repo.listConversations())[0].pinnedMessageId).toBeNull();
  });
});

describe('llmStore', () => {
  it('loads and releases through the engine', async () => {
    const engine = new FakeEngine();
    setEngine(engine);
    await useLlmStore.getState().loadModel('m', '/x.gguf', 2048);
    expect(useLlmStore.getState()).toMatchObject({ status: 'ready', loadedModelId: 'm', loadedContextSize: 2048 });
    await useLlmStore.getState().release();
    expect(useLlmStore.getState()).toMatchObject({ status: 'idle', loadedModelId: null });
    expect(engine.loaded).toBe(false);
  });
  it('captures load errors', async () => {
    const engine = new FakeEngine();
    engine.load = async () => {
      throw new Error('bad gguf');
    };
    setEngine(engine);
    await useLlmStore.getState().loadModel('m', '/x.gguf', 2048);
    expect(useLlmStore.getState()).toMatchObject({ status: 'error', error: 'bad gguf', loadedModelId: null });
  });
});

describe('modelStore', () => {
  let transport: FakeTransport;
  const model = CATALOG[0];
  beforeEach(() => {
    transport = new FakeTransport();
    setDownloadTransport(transport);
    useModelStore.setState({ customModels: [], files: {} });
  });

  it('downloads a catalog model and exposes its local path', async () => {
    const s = useModelStore.getState();
    s.startDownload(model.id);
    expect(useModelStore.getState().fileState(model.id).status).toBe('downloading');
    transport.last.complete(model.sizeBytes);
    await flush();
    expect(useModelStore.getState().fileState(model.id).status).toBe('downloaded');
    expect(useModelStore.getState().localPath(model.id)).toBe(`file:///models/${model.fileName}`);
    expect(useModelStore.getState().downloadedModels().map((m) => m.id)).toEqual([model.id]);
  });

  it('pauses and resumes', async () => {
    useModelStore.getState().startDownload(model.id);
    transport.last.progress(1000, model.sizeBytes);
    await useModelStore.getState().pauseDownload(model.id);
    expect(useModelStore.getState().fileState(model.id).status).toBe('paused');
    useModelStore.getState().resumeDownload(model.id);
    expect(transport.last.resumeState).toBeTruthy();
    transport.last.complete(model.sizeBytes);
    await flush();
    expect(useModelStore.getState().fileState(model.id).status).toBe('downloaded');
  });

  it('marks a download as error when disk is full', () => {
    transport.free = 1;
    useModelStore.getState().startDownload(model.id);
    expect(useModelStore.getState().fileState(model.id)).toMatchObject({ status: 'error', error: 'INSUFFICIENT_DISK' });
  });

  it('syncs persisted state with disk after a restart', () => {
    useModelStore.setState({
      files: {
        [CATALOG[0].id]: { status: 'downloading', bytesWritten: 5, totalBytes: 10, error: null, resumeState: null },
        [CATALOG[1].id]: { status: 'downloading', bytesWritten: 5, totalBytes: 10, error: null, resumeState: { r: 1 } },
        [CATALOG[2].id]: { status: 'downloaded', bytesWritten: 5, totalBytes: 10, error: null, resumeState: null },
      },
    });
    transport.files.set(`file:///models/${CATALOG[3].fileName}`, CATALOG[3].sizeBytes);
    useModelStore.getState().syncWithDisk();
    const f = useModelStore.getState().files;
    expect(f[CATALOG[0].id].status).toBe('idle');
    expect(f[CATALOG[1].id].status).toBe('paused');
    expect(f[CATALOG[2].id].status).toBe('idle');
    expect(f[CATALOG[3].id].status).toBe('downloaded');
  });

  it('marks interruption-paused downloads as auto-resumable and resumes exactly those', () => {
    // CATALOG[1]: interrupted by an app kill (downloading + saved resume state)
    // CATALOG[2]: deliberately paused by the user (no autoResume flag)
    useModelStore.setState({
      files: {
        [CATALOG[1].id]: { status: 'downloading', bytesWritten: 5, totalBytes: 10, error: null, resumeState: { r: 1 } },
        [CATALOG[2].id]: { status: 'paused', bytesWritten: 5, totalBytes: 10, error: null, resumeState: { r: 2 }, autoResume: false },
      },
    });
    useModelStore.getState().syncWithDisk();
    const f = useModelStore.getState().files;
    expect(f[CATALOG[1].id]).toMatchObject({ status: 'paused', autoResume: true });
    expect(f[CATALOG[2].id]).toMatchObject({ status: 'paused', autoResume: false });

    const created = transport.tasks.length;
    const resumed = useModelStore.getState().resumeAutoDownloads();
    expect(resumed).toBe(1); // only the interrupted one
    expect(transport.tasks.length).toBe(created + 1);
    expect(transport.last.resumeState).toEqual({ r: 1 });
  });

  it('auto-resume skips entries without a saved resume state', () => {
    useModelStore.setState({
      files: {
        [CATALOG[1].id]: { status: 'paused', bytesWritten: 0, totalBytes: 10, error: null, resumeState: null, autoResume: true },
      },
    });
    useModelStore.getState().syncWithDisk(); // a user-visible pause without state stays paused, untouched
    const created = transport.tasks.length;
    expect(useModelStore.getState().files[CATALOG[1].id].status).toBe('paused');
    expect(useModelStore.getState().resumeAutoDownloads()).toBe(0);
    expect(transport.tasks.length).toBe(created);
  });

  it('adds and removes a custom model from a Hugging Face URL', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, headers: { get: (n: string) => (n === 'x-linked-size' ? '2048' : null) } }));
    const url = 'https://huggingface.co/org/repo/blob/main/Tiny-Q4_K_M.gguf';
    const res = await useModelStore.getState().addFromUrl(url, 'custom', fetchImpl);
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('https://huggingface.co/org/repo/resolve/main/Tiny-Q4_K_M.gguf', { method: 'HEAD', redirect: 'follow' });
    expect(useModelStore.getState().customModels).toHaveLength(1);
    expect((await useModelStore.getState().addFromUrl(url, 'custom', fetchImpl)).ok).toBe(false);
    expect(await useModelStore.getState().addFromUrl('https://example.com/x.gguf', 'c', fetchImpl)).toEqual({ ok: false, reason: 'invalid' });
    const id = useModelStore.getState().customModels[0].id;
    useModelStore.getState().removeCustomModel(id);
    expect(useModelStore.getState().customModels).toHaveLength(0);
  });

  it('reports network failures when adding', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401, headers: { get: () => null } }));
    const res = await useModelStore.getState().addFromUrl('https://huggingface.co/a/b/resolve/main/c.gguf', 'c', fetchImpl);
    expect(res).toEqual({ ok: false, reason: 'network', message: 'HTTP 401' });
  });
});
