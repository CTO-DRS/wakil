// Copyright (c) 2026 DRS AI. All rights reserved.
import { Storage } from 'expo-sqlite/kv-store';

import { MemoryChatRepository } from '../src/db/repository';
import { setChatRepository, useChatStore } from '../src/store/chatStore';
import { useModelStore } from '../src/store/modelStore';
import { usePromptLibraryStore } from '../src/store/promptLibraryStore';
import { useSettingsStore } from '../src/store/settingsStore';
import type { BackupPayload, BackupSettings } from '../src/utils/backup';
import type { ModelInfo } from '../src/types';
import {
  BACKUP_FORMAT_VERSION,
  FULL_BACKUP_FORMAT_VERSION,
  parseBackup,
  planImport,
  planModelImport,
  planPromptImport,
  serializeBackup,
  serializeFullBackup,
} from '../src/utils/backup';
import { MAX_PROMPTS, PROMPT_BODY_MAX, PROMPT_TITLE_MAX } from '../src/utils/promptLimits';

const conv = (id: string, updatedAt: number, pinned = false) => ({
  id,
  title: `conv ${id}`,
  modelId: null,
  createdAt: updatedAt - 100,
  updatedAt,
  pinned,
  archived: false,
  systemPrompt: '',
});

const msg = (id: string, conversationId: string, content = `text ${id}`) => ({
  id,
  conversationId,
  role: 'user' as const,
  content,
  createdAt: 5,
  tokensPerSecond: null,
  tokenCount: null,
});

const prompt = (id: string, body = `body ${id}`, title = `title ${id}`) => ({
  id,
  title,
  body,
  createdAt: 100,
});

const customModel = (id: string, url = `https://example.com/${id}.gguf`): ModelInfo => ({
  id,
  name: `نموذج ${id}`,
  description: 'وصف مخصص',
  url,
  fileName: `${id}.gguf`,
  sizeBytes: 2048,
  params: '1B',
  quant: 'Q4_K_M',
  license: 'apache-2.0',
  source: 'custom',
  sha256: null,
});

const fullSettings = (): BackupSettings => ({
  themeMode: 'dark',
  systemPrompt: 'أنت مساعد دقيق.',
  temperature: 1.2,
  contextSize: 4096,
  maxTokens: 1024,
  autoSpeak: true,
  autoSummary: true,
  chatFontScale: 1.15,
  selectedModelId: null,
});

describe('backup', () => {
  describe('serializeBackup / parseBackup roundtrip', () => {
    it('preserves conversations, messages and pinned flags', () => {
      const conversations = [conv('c1', 10, true), conv('c2', 20)];
      const messages = [msg('m1', 'c1', 'مرحبا بالعالم'), msg('m2', 'c2')];
      const json = serializeBackup(conversations, messages, { exportedAt: 12345 });
      const parsed = parseBackup(json);
      expect(parsed).not.toBeNull();
      expect(parsed!.app).toBe('rafeeq-ai');
      expect(parsed!.formatVersion).toBe(BACKUP_FORMAT_VERSION);
      expect(parsed!.exportedAt).toBe(12345);
      expect(parsed!.conversations).toEqual(
        conversations.map((c) => ({ ...c, pinnedMessageId: null, folder: null, remindAt: null, deletedAt: null, summary: null, summaryCovers: 0 })),
      );
      // parseMessage normalizes the quote reference to null when absent.
      expect(parsed!.messages).toEqual(messages.map((m) => ({ ...m, replyToId: null })));
      expect(parsed!.prompts).toEqual([]);
    });

    it('carries the prompt library through a roundtrip', () => {
      const json = serializeBackup([], [], { prompts: [prompt('p1', 'نص الأمر', 'اسم الأمر')], exportedAt: 5 });
      const parsed = parseBackup(json)!;
      expect(parsed.prompts).toEqual([prompt('p1', 'نص الأمر', 'اسم الأمر')]);
    });

    it('returns null for non-JSON text', () => {
      expect(parseBackup('not json {')).toBeNull();
      expect(parseBackup('')).toBeNull();
    });

    it('returns null when the app tag is missing or wrong', () => {
      const wrong = JSON.stringify({ ...JSON.parse(serializeBackup([], [])), app: 'other-app' });
      const missing = JSON.stringify({ formatVersion: 1, conversations: [], messages: [] });
      expect(parseBackup(wrong)).toBeNull();
      expect(parseBackup(missing)).toBeNull();
    });

    it('rejects backups from a newer format version', () => {
      const future = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: FULL_BACKUP_FORMAT_VERSION + 1,
        conversations: [],
        messages: [],
      });
      expect(parseBackup(future)).toBeNull();
    });

    it('rejects non-array conversations or messages', () => {
      expect(
        parseBackup(JSON.stringify({ app: 'rafeeq-ai', formatVersion: 1, conversations: {}, messages: [] })),
      ).toBeNull();
      expect(
        parseBackup(JSON.stringify({ app: 'rafeeq-ai', formatVersion: 1, conversations: [], messages: 'x' })),
      ).toBeNull();
    });

    it('drops malformed entries but keeps valid ones (lenient on field types)', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        exportedAt: 7,
        conversations: [conv('c1', 10), { id: '' }, null, 'nope', { id: 123 }, { id: 'c2', title: 42 }],
        messages: [
          msg('m1', 'c1'),
          { id: 'm2', conversationId: 'c1', role: 'alien', content: 'x' },
          { content: 'no ids' },
        ],
      });
      const parsed = parseBackup(json)!;
      expect(parsed).not.toBeNull();
      // c2 is kept (lenient title) but malformed shapes and unknown roles are dropped.
      expect(parsed.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(parsed.conversations[1].title).toBe('');
      expect(parsed.messages.map((m) => m.id)).toEqual(['m1']);
    });

    it('defaults missing optional fields to safe values', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [{ id: 'c1' }],
        messages: [{ id: 'm1', conversationId: 'c1', role: 'assistant', content: 'hi' }],
      });
      const parsed = parseBackup(json)!;
      expect(parsed.conversations[0]).toEqual({
        id: 'c1',
        title: '',
        modelId: null,
        createdAt: 0,
        updatedAt: 0,
        pinned: false,
        archived: false,
        systemPrompt: '',
        pinnedMessageId: null,
        folder: null,
        remindAt: null,
        deletedAt: null,
        summary: null,
        summaryCovers: 0,
      });
      expect(parsed.messages[0]).toMatchObject({ tokensPerSecond: null, createdAt: 0 });
    });

    it('carries the quote reference through a roundtrip and defaults it to null', () => {
      const quoted = { ...msg('m2', 'c1'), replyToId: 'm1' };
      const parsed = parseBackup(serializeBackup([conv('c1', 10)], [msg('m1', 'c1'), quoted], { exportedAt: 7 }))!;
      expect(parsed.messages.find((m) => m.id === 'm2')!.replyToId).toBe('m1');
      expect(parsed.messages.find((m) => m.id === 'm1')!.replyToId).toBeNull();

      // Legacy backups carry no field at all: lenient null, never a rejection.
      const legacy = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [conv('c1', 10)],
        messages: [{ id: 'm1', conversationId: 'c1', role: 'user', content: 'hi' }],
      });
      expect(parseBackup(legacy)!.messages[0].replyToId).toBeNull();
    });

    it('carries the rolling summary and its coverage through a roundtrip', () => {
      const withSummary = { ...conv('c1', 10), summary: 'ملخص متجدد', summaryCovers: 12 };
      const parsed = parseBackup(serializeBackup([withSummary], [msg('m1', 'c1')], { exportedAt: 9 }))!;
      expect(parsed.conversations[0].summary).toBe('ملخص متجدد');
      expect(parsed.conversations[0].summaryCovers).toBe(12);

      // Broken values collapse to the safe "no summary" defaults.
      const junk = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [{ id: 'c1', summary: 42, summaryCovers: -3 }],
        messages: [],
      });
      const repaired = parseBackup(junk)!;
      expect(repaired.conversations[0].summary).toBeNull();
      expect(repaired.conversations[0].summaryCovers).toBe(0);
    });

    it('carries the generated token count through a roundtrip and rejects junk', () => {
      const assistant = { ...msg('m1', 'c1'), role: 'assistant' as const, tokenCount: 512 };
      const parsed = parseBackup(serializeBackup([conv('c1', 10)], [assistant], { exportedAt: 7 }))!;
      expect(parsed.messages[0].tokenCount).toBe(512);

      const junk = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [],
        messages: [{ id: 'm1', conversationId: 'c1', role: 'assistant', content: 'hi', tokenCount: 'many' }],
      });
      expect(parseBackup(junk)!.messages[0].tokenCount).toBeNull();
    });

    it('carries per-conversation instructions and the archive flag through a roundtrip, defaulting legacy backups', () => {
      const withPersona = { ...conv('c1', 10), systemPrompt: 'أنت مترجم محترف.', archived: true };
      const parsed = parseBackup(serializeBackup([withPersona], [msg('m1', 'c1')], { exportedAt: 7 }))!;
      expect(parsed.conversations[0].systemPrompt).toBe('أنت مترجم محترف.');
      expect(parsed.conversations[0].archived).toBe(true);

      // A v1 backup written before personas and archiving existed: no fields at all.
      const legacy = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        exportedAt: 7,
        conversations: [{ id: 'c1', title: 'old', modelId: null, createdAt: 1, updatedAt: 2, pinned: false }],
        messages: [],
      });
      const legacyParsed = parseBackup(legacy)!.conversations[0];
      expect(legacyParsed.systemPrompt).toBe('');
      expect(legacyParsed.archived).toBe(false);
      // Same rule for the library: a legacy file without prompts restores none.
      expect(parseBackup(legacy)!.prompts).toEqual([]);
    });

    it('parses prompts leniently: malformed entries dropped, titles derived, values clamped', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [],
        messages: [],
        prompts: [
          prompt('p1', 'keep me'),
          { id: '', body: 'no id' },
          { id: 'p2', body: '   ' },
          null,
          'nope',
          { id: 'p3', body: 'no title given' },
          { id: 'p4', body: `x`.repeat(PROMPT_BODY_MAX + 99), title: 'y'.repeat(PROMPT_TITLE_MAX + 9) },
          { id: 'p5', body: '  padded body  ' },
        ],
      });
      const parsed = parseBackup(json)!;
      expect(parsed.prompts.map((p) => p.id)).toEqual(['p1', 'p3', 'p4', 'p5']);
      expect(parsed.prompts[1].title).toBe('no title given'); // derived from body
      expect(parsed.prompts[1].createdAt).toBe(0); // missing timestamp defaults
      expect(parsed.prompts[2].body).toHaveLength(PROMPT_BODY_MAX);
      expect(parsed.prompts[2].title).toHaveLength(PROMPT_TITLE_MAX);
      expect(parsed.prompts[3].body).toBe('padded body'); // trimmed
      expect(parsed.prompts[0].createdAt).toBe(100);
    });

    it('treats a broken prompts field as an empty library, not a rejected file', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [conv('c1', 10)],
        messages: [],
        prompts: 'garbage',
      });
      const parsed = parseBackup(json)!;
      expect(parsed.conversations.map((c) => c.id)).toEqual(['c1']);
      expect(parsed.prompts).toEqual([]);
    });

    it('deduplicates prompts with repeated ids (last wins)', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [],
        messages: [],
        prompts: [prompt('p1', 'first'), prompt('p1', 'second')],
      });
      const parsed = parseBackup(json)!;
      expect(parsed.prompts).toHaveLength(1);
      expect(parsed.prompts[0].body).toBe('second');
    });

    it('deduplicates entries with repeated ids (last wins)', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [conv('c1', 1, false), conv('c1', 2, true)],
        messages: [msg('m1', 'c1', 'first'), msg('m1', 'c1', 'second')],
      });
      const parsed = parseBackup(json)!;
      expect(parsed.conversations).toHaveLength(1);
      expect(parsed.conversations[0]).toMatchObject({ updatedAt: 2, pinned: true });
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].content).toBe('second');
    });

    it('carries the pinned message id through the roundtrip and defaults legacy files to no pin', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [{ ...conv('c1', 1), pinnedMessageId: 'm1' }, conv('c2', 2)],
        messages: [msg('m1', 'c1'), msg('m2', 'c2')],
      });
      const parsed = parseBackup(json)!;
      expect(parsed.conversations.find((c) => c.id === 'c1')!.pinnedMessageId).toBe('m1');
      // Legacy conversations without the field are treated as unpinned.
      expect(parsed.conversations.find((c) => c.id === 'c2')!.pinnedMessageId).toBeNull();
    });

    it('carries the folder through the roundtrip and defaults legacy files to no folder', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [{ ...conv('c1', 1), folder: '  العمل  ' }, conv('c2', 2)],
        messages: [msg('m1', 'c1'), msg('m2', 'c2')],
      });
      const parsed = parseBackup(json)!;
      // The name arrives normalized, not verbatim.
      expect(parsed.conversations.find((c) => c.id === 'c1')!.folder).toBe('العمل');
      // Legacy conversations without the field simply have no folder.
      expect(parsed.conversations.find((c) => c.id === 'c2')!.folder).toBeNull();
    });

    it('carries the reminder through the roundtrip and defaults legacy files to none', () => {
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [{ ...conv('c1', 1), remindAt: 1234567890 }, conv('c2', 2)],
        messages: [msg('m1', 'c1'), msg('m2', 'c2')],
      });
      const parsed = parseBackup(json)!;
      expect(parsed.conversations.find((c) => c.id === 'c1')!.remindAt).toBe(1234567890);
      // Legacy conversations without the field simply have no reminder, and a
      // broken stamp is dropped instead of poisoning the restored list.
      const broken = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [{ ...conv('c3', 3), remindAt: 'soon' }],
        messages: [msg('m3', 'c3')],
      });
      expect(parseBackup(broken)!.conversations[0].remindAt).toBeNull();
    });
  });

  describe('planImport', () => {
    const payload = (conversations: unknown[], messages: unknown[]): BackupPayload =>
      JSON.parse(
        JSON.stringify({
          app: 'rafeeq-ai',
          formatVersion: 1,
          exportedAt: 1,
          conversations,
          messages,
        }),
      );

    it('skips conversations that already exist together with their messages', () => {
      const plan = planImport(
        payload([conv('c1', 10), conv('c2', 20)], [msg('m1', 'c1'), msg('m2', 'c2')]),
        new Set(['c1']),
      );
      expect(plan.conversations.map((c) => c.id)).toEqual(['c2']);
      expect(plan.messages.map((m) => m.id)).toEqual(['m2']);
      expect(plan).toMatchObject({ addedConversations: 1, addedMessages: 1, skippedConversations: 1 });
    });

    it('drops messages whose conversation was skipped', () => {
      const plan = planImport(payload([conv('c1', 10)], [msg('m1', 'c1'), msg('m2', 'c1')]), new Set(['c1']));
      expect(plan.messages).toHaveLength(0);
      expect(plan.addedMessages).toBe(0);
    });

    it('imports everything when the device is empty', () => {
      const plan = planImport(payload([conv('c1', 10)], [msg('m1', 'c1')]), new Set());
      expect(plan).toMatchObject({ addedConversations: 1, addedMessages: 1, skippedConversations: 0 });
    });

    it('keeps valid pins and clears pins whose message the file does not carry', () => {
      const plan = planImport(
        payload(
          [{ ...conv('c1', 10), pinnedMessageId: 'm1' }, { ...conv('c2', 20), pinnedMessageId: 'missing' }],
          [msg('m1', 'c1'), msg('m2', 'c2')],
        ),
        new Set(),
      );
      expect(plan.conversations.find((c) => c.id === 'c1')!.pinnedMessageId).toBe('m1');
      expect(plan.conversations.find((c) => c.id === 'c2')!.pinnedMessageId).toBeNull();
    });

    it('keeps valid quotes and clears quotes whose message the file does not carry', () => {
      const plan = planImport(
        payload(
          [conv('c1', 10)],
          [msg('m1', 'c1'), { ...msg('m2', 'c1'), replyToId: 'm1' }, { ...msg('m3', 'c1'), replyToId: 'gone' }],
        ),
        new Set(),
      );
      expect(plan.messages.find((m) => m.id === 'm2')!.replyToId).toBe('m1');
      expect(plan.messages.find((m) => m.id === 'm3')!.replyToId).toBeNull();
    });
  });

  describe('planPromptImport', () => {
    it('skips ids that already exist and keeps the file order of the rest', () => {
      const plan = planPromptImport([prompt('p1'), prompt('p2'), prompt('p3')], new Set(['p2']), MAX_PROMPTS);
      expect(plan.added.map((p) => p.id)).toEqual(['p1', 'p3']);
      expect(plan.skipped).toBe(1);
    });

    it('deduplicates repeated ids inside the file itself', () => {
      const plan = planPromptImport([prompt('p1'), prompt('p1')], new Set(), MAX_PROMPTS);
      expect(plan.added).toHaveLength(1);
      expect(plan.skipped).toBe(1);
    });

    it('respects the library cap and counts the overflow as skipped', () => {
      const plan = planPromptImport([prompt('p1'), prompt('p2'), prompt('p3')], new Set(['old']), 3);
      expect(plan.added.map((p) => p.id)).toEqual(['p1', 'p2']); // room = 3 - 1
      expect(plan.skipped).toBe(1);
    });

    it('imports nothing when the library is already full', () => {
      const full = new Set(Array.from({ length: MAX_PROMPTS }, (_, i) => `p${i}`));
      const plan = planPromptImport([prompt('new')], full, MAX_PROMPTS);
      expect(plan.added).toHaveLength(0);
      expect(plan.skipped).toBe(1);
    });
  });

  describe('full backup (formatVersion 2)', () => {
    it('roundtrips trash, settings and custom models at version 2', () => {
      const trashed = { ...conv('c2', 20), deletedAt: 555 };
      const model = customModel('custom-1');
      const json = serializeFullBackup([conv('c1', 10)], [msg('m1', 'c1')], {
        trashedConversations: [trashed],
        trashedMessages: [msg('m2', 'c2')],
        settings: fullSettings(),
        customModels: [model],
        exportedAt: 7,
      });
      const parsed = parseBackup(json)!;
      expect(parsed.formatVersion).toBe(FULL_BACKUP_FORMAT_VERSION);
      expect(parsed.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(parsed.conversations[1].deletedAt).toBe(555);
      expect(parsed.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(parsed.settings).toEqual(fullSettings());
      expect(parsed.customModels).toEqual([model]);
    });

    it('normalizes a v1 file: no settings and no custom models', () => {
      const parsed = parseBackup(serializeBackup([conv('c1', 10)], [msg('m1', 'c1')], { exportedAt: 7 }))!;
      expect(parsed.formatVersion).toBe(BACKUP_FORMAT_VERSION);
      expect(parsed.settings).toBeNull();
      expect(parsed.customModels).toEqual([]);
    });

    it('defaults deletedAt to null when the stamp is missing or broken', () => {
      const parsed = parseBackup(serializeBackup([conv('c1', 10)], [], { exportedAt: 7 }))!;
      expect(parsed.conversations[0].deletedAt).toBeNull();
      const broken = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        conversations: [{ ...conv('c1', 10), deletedAt: 'yesterday' }],
        messages: [],
      });
      expect(parseBackup(broken)!.conversations[0].deletedAt).toBeNull();
    });

    it('parses the settings block leniently field by field', () => {
      const base = { app: 'rafeeq-ai', formatVersion: 2, conversations: [], messages: [] };
      const partial = parseBackup(
        JSON.stringify({ ...base, settings: { themeMode: 'nope', temperature: 'hot', contextSize: 4096, autoSpeak: 'yes' } }),
      )!;
      expect(partial.settings).toEqual({
        themeMode: 'system',
        systemPrompt: '',
        temperature: 0.7,
        contextSize: 4096,
        maxTokens: 512,
        autoSpeak: false,
        autoSummary: true,
        chatFontScale: 1,
        selectedModelId: null,
      });
      expect(parseBackup(JSON.stringify({ ...base, settings: 'junk' }))!.settings).toBeNull();
      expect(parseBackup(JSON.stringify(base))!.settings).toBeNull();
    });

    it('forces parsed custom models to source custom and drops incomplete ones', () => {
      const base = { app: 'rafeeq-ai', formatVersion: 2, conversations: [], messages: [] };
      const parsed = parseBackup(
        JSON.stringify({
          ...base,
          customModels: [{ ...customModel('custom-1'), source: 'catalog' }, { id: 'no-url', name: 'x' }, null, 'nope'],
        }),
      )!;
      expect(parsed.customModels).toHaveLength(1);
      expect(parsed.customModels![0]).toMatchObject({ id: 'custom-1', source: 'custom' });
    });

    it('deduplicates custom models with repeated ids (last wins)', () => {
      const base = { app: 'rafeeq-ai', formatVersion: 2, conversations: [], messages: [] };
      const parsed = parseBackup(
        JSON.stringify({ ...base, customModels: [customModel('custom-1'), { ...customModel('custom-1'), name: 'second' }] }),
      )!;
      expect(parsed.customModels).toHaveLength(1);
      expect(parsed.customModels![0].name).toBe('second');
    });
  });

  describe('planImport with trash', () => {
    const payload = (conversations: unknown[], messages: unknown[]): BackupPayload =>
      JSON.parse(JSON.stringify({ app: 'rafeeq-ai', formatVersion: 2, exportedAt: 1, conversations, messages }));

    it('routes trashed conversations and their messages into the trash halves', () => {
      const plan = planImport(
        payload([conv('c1', 10), { ...conv('c2', 20), deletedAt: 5 }], [msg('m1', 'c1'), msg('m2', 'c2')]),
        new Set(),
      );
      expect(plan.conversations.map((c) => c.id)).toEqual(['c1']);
      expect(plan.trashedConversations.map((c) => c.id)).toEqual(['c2']);
      expect(plan.messages.map((m) => m.id)).toEqual(['m1']);
      expect(plan.trashedMessages.map((m) => m.id)).toEqual(['m2']);
      expect(plan).toMatchObject({ addedConversations: 1, addedMessages: 1, addedTrashed: 1, skippedConversations: 0 });
    });

    it('skips existing ids whether alive or trashed', () => {
      const plan = planImport(payload([{ ...conv('c2', 20), deletedAt: 5 }], [msg('m2', 'c2')]), new Set(['c2']));
      expect(plan.trashedConversations).toHaveLength(0);
      expect(plan.trashedMessages).toHaveLength(0);
      expect(plan.skippedConversations).toBe(1);
    });

    it('clears dangling pins in both halves', () => {
      const plan = planImport(
        payload(
          [{ ...conv('c1', 10), pinnedMessageId: 'm1' }, { ...conv('c2', 20), deletedAt: 5, pinnedMessageId: 'ghost' }],
          [msg('m1', 'c1'), msg('m2', 'c2')],
        ),
        new Set(),
      );
      expect(plan.conversations[0].pinnedMessageId).toBe('m1');
      expect(plan.trashedConversations[0].pinnedMessageId).toBeNull();
    });
  });

  describe('planModelImport', () => {
    it('skips known ids and urls and collapses repeats inside the file', () => {
      const plan = planModelImport(
        [customModel('m1'), customModel('m2', 'https://example.com/m1.gguf'), customModel('m1'), customModel('m3')],
        new Set(['m3']),
        new Set(),
      );
      // m2 collides with m1's url, the repeated m1 with its id, m3 with the device.
      expect(plan.added.map((m) => m.id)).toEqual(['m1']);
      expect(plan.skipped).toBe(3);
    });

    it('accepts everything on an empty device', () => {
      const plan = planModelImport([customModel('a'), customModel('b')], new Set(), new Set());
      expect(plan.added).toHaveLength(2);
      expect(plan.skipped).toBe(0);
    });
  });

  describe('chatStore integration', () => {
    let repo: MemoryChatRepository;
    beforeEach(async () => {
      repo = new MemoryChatRepository();
      setChatRepository(repo);
      Storage.clear();
      usePromptLibraryStore.setState({ items: [] });
      useChatStore.setState({
        conversations: [],
        currentId: null,
        messages: [],
        generating: false,
        streamingMessageId: null,
        error: null,
      });
      await useChatStore.getState().init();
    });

    it('exports a valid backup of everything in the store', async () => {
      await repo.insertConversation(conv('c1', 10, true));
      await repo.insertConversation(conv('c2', 20));
      await repo.insertMessage(msg('m1', 'c1', 'نص عربي'));
      const json = await useChatStore.getState().exportBackup();
      expect(json).not.toBeNull();
      const parsed = parseBackup(json!)!;
      // Pinned conversations come first.
      expect(parsed.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
      expect(parsed.messages.map((m) => m.id)).toEqual(['m1']);
    });

    it('exports and re-imports the prompt library with the backup', async () => {
      usePromptLibraryStore.getState().add('لخّص النص التالي', 'تلخيص');
      const json = await useChatStore.getState().exportBackup();
      // Wipe the library, then restore from the exported file.
      usePromptLibraryStore.setState({ items: [] });
      const summary = await useChatStore.getState().importBackup(json!);
      expect(summary).toMatchObject({ addedConversations: 0, addedMessages: 0, promptsAdded: 1, promptsSkipped: 0 });
      const items = usePromptLibraryStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ title: 'تلخيص', body: 'لخّص النص التالي' });
    });

    it('skips the library entirely when the same backup is imported twice', async () => {
      usePromptLibraryStore.getState().add('body one', 'one');
      const json = await useChatStore.getState().exportBackup();
      const first = await useChatStore.getState().importBackup(json!);
      expect(first).toMatchObject({ promptsAdded: 0, promptsSkipped: 1 }); // ids match: duplicate
      const second = await useChatStore.getState().importBackup(json!);
      expect(second).toMatchObject({ promptsAdded: 0, promptsSkipped: 1 });
      expect(usePromptLibraryStore.getState().items).toHaveLength(1);
    });

    it('restores chats from a legacy backup that has no prompts field', async () => {
      const legacy = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 1,
        exportedAt: 1,
        conversations: [conv('c9', 30, true)],
        messages: [msg('m9', 'c9', 'محادثة مستعادة')],
      });
      const summary = await useChatStore.getState().importBackup(legacy);
      expect(summary).toEqual({
        addedConversations: 1,
        addedMessages: 1,
        skippedConversations: 0,
        addedTrashed: 0,
        promptsAdded: 0,
        promptsSkipped: 0,
        customModelsAdded: 0,
        customModelsSkipped: 0,
        settingsApplied: false,
      });
      expect(usePromptLibraryStore.getState().items).toHaveLength(0);
    });

    it('imports a backup, then skips it entirely when imported again', async () => {
      const json = serializeBackup([conv('c9', 30, true)], [msg('m9', 'c9', 'محادثة مستعادة')]);
      const first = await useChatStore.getState().importBackup(json);
      expect(first).toEqual({
        addedConversations: 1,
        addedMessages: 1,
        skippedConversations: 0,
        addedTrashed: 0,
        promptsAdded: 0,
        promptsSkipped: 0,
        customModelsAdded: 0,
        customModelsSkipped: 0,
        settingsApplied: false,
      });
      expect(useChatStore.getState().conversations.map((c) => c.id)).toEqual(['c9']);
      expect((await repo.listMessages('c9')).map((m) => m.content)).toEqual(['محادثة مستعادة']);

      const second = await useChatStore.getState().importBackup(json);
      expect(second).toEqual({
        addedConversations: 0,
        addedMessages: 0,
        skippedConversations: 1,
        addedTrashed: 0,
        promptsAdded: 0,
        promptsSkipped: 0,
        customModelsAdded: 0,
        customModelsSkipped: 0,
        settingsApplied: false,
      });
      expect(useChatStore.getState().conversations).toHaveLength(1);
    });

    it('returns null for an invalid backup file', async () => {
      await expect(useChatStore.getState().importBackup('garbage')).resolves.toBeNull();
      expect(useChatStore.getState().conversations).toHaveLength(0);
    });

    it('exports the full state and restores trash, settings and models from it', async () => {
      await repo.insertConversation(conv('c1', 10));
      await repo.insertMessage(msg('m1', 'c1', 'محادثة حية'));
      await repo.insertConversation({ ...conv('c2', 20), deletedAt: 555 });
      await repo.insertMessage(msg('m2', 'c2', 'محادثة محذوفة'));
      useSettingsStore.setState({
        themeMode: 'dark',
        systemPrompt: 'أنت مساعد دقيق.',
        temperature: 1.2,
        contextSize: 4096,
        maxTokens: 1024,
        autoSpeak: true,
        chatFontScale: 1.15,
        selectedModelId: 'custom-1',
      });
      useModelStore.setState({ customModels: [customModel('custom-1')] });
      const json = await useChatStore.getState().exportFullBackup();
      const parsed = parseBackup(json!)!;
      expect(parsed.formatVersion).toBe(FULL_BACKUP_FORMAT_VERSION);
      expect(parsed.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);

      // Wipe every surface the file touches, then restore into a fresh repo.
      useSettingsStore.setState({
        themeMode: 'system',
        systemPrompt: '',
        temperature: 0.7,
        contextSize: 2048,
        maxTokens: 512,
        autoSpeak: false,
        chatFontScale: 1,
        selectedModelId: null,
      });
      useModelStore.setState({ customModels: [] });
      useChatStore.setState({ conversations: [], trash: [] });
      const freshRepo = new MemoryChatRepository();
      setChatRepository(freshRepo);
      const summary = await useChatStore.getState().importBackup(json!);
      expect(summary).toMatchObject({
        addedConversations: 1,
        addedMessages: 1,
        addedTrashed: 1,
        settingsApplied: true,
        customModelsAdded: 1,
        customModelsSkipped: 0,
      });
      expect((await freshRepo.listDeletedConversations()).map((c) => c.id)).toEqual(['c2']);
      expect(useChatStore.getState().trash.map((c) => c.id)).toEqual(['c2']);
      const s = useSettingsStore.getState();
      expect(s.themeMode).toBe('dark');
      expect(s.systemPrompt).toBe('أنت مساعد دقيق.');
      expect(s.temperature).toBe(1.2);
      expect(s.contextSize).toBe(4096);
      expect(s.chatFontScale).toBe(1.15);
      // The selection follows the file: the custom model it names just landed.
      expect(s.selectedModelId).toBe('custom-1');
      expect(useModelStore.getState().customModels.map((m) => m.id)).toEqual(['custom-1']);
    });

    it('applies file settings through the store clamps and keeps an unresolvable selection', async () => {
      useSettingsStore.setState({ themeMode: 'system', temperature: 0.7, contextSize: 2048, chatFontScale: 1, selectedModelId: null });
      const json = JSON.stringify({
        app: 'rafeeq-ai',
        formatVersion: 2,
        conversations: [],
        messages: [],
        settings: { themeMode: 'light', temperature: 9, contextSize: 999, chatFontScale: 2, selectedModelId: 'ghost-model' },
      });
      const summary = await useChatStore.getState().importBackup(json);
      expect(summary).toMatchObject({ settingsApplied: true, addedConversations: 0, addedTrashed: 0, customModelsAdded: 0 });
      const s = useSettingsStore.getState();
      expect(s.themeMode).toBe('light');
      expect(s.temperature).toBe(2);
      expect(s.contextSize).toBe(2048);
      expect(s.chatFontScale).toBe(1);
      // A selection the device cannot resolve never hijacks the current one.
      expect(s.selectedModelId).toBeNull();
    });

    it('imports a full backup twice without duplicating anything', async () => {
      useModelStore.setState({ customModels: [] }); // state leaks between tests
      const json = serializeFullBackup([conv('c1', 10)], [msg('m1', 'c1')], {
        trashedConversations: [{ ...conv('c2', 20), deletedAt: 5 }],
        trashedMessages: [msg('m2', 'c2')],
        settings: fullSettings(),
        customModels: [customModel('custom-2')],
      });
      const first = await useChatStore.getState().importBackup(json);
      expect(first).toMatchObject({ addedConversations: 1, addedTrashed: 1, customModelsAdded: 1, settingsApplied: true });
      const second = await useChatStore.getState().importBackup(json);
      expect(second).toMatchObject({
        addedConversations: 0,
        addedTrashed: 0,
        // Both file conversations (alive + trashed) now exist on the device.
        skippedConversations: 2,
        customModelsAdded: 0,
        customModelsSkipped: 1,
        settingsApplied: true,
      });
      expect(await repo.listDeletedConversations()).toHaveLength(1);
      expect(useModelStore.getState().customModels).toHaveLength(1);
    });
  });
});
