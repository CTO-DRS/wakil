// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  capMemories,
  collapseSpaces,
  findMemoryByText,
  makeMemory,
  MEMORY_CAP,
  MEMORY_KINDS,
  MEMORY_TEXT_MAX,
  memoryKindLabel,
  normalizeMemoryInput,
  normalizeMemoryKind,
  renderMemoryContext,
  summarizeMemories,
  useMemoryStore,
} from '../src/agent/memory';

function resetMemory() {
  useMemoryStore.setState({ memories: [] });
}

describe('normalizeMemoryInput', () => {
  const cases: { name: string; text: unknown; kind: unknown; ok: boolean; textOut?: string; kindOut?: string }[] = [
    { name: 'keeps a plain Arabic fact', text: 'أحب القهوة بعد الفجر', kind: 'preference', ok: true, kindOut: 'preference' },
    { name: 'defaults an unknown kind to fact', text: 'أبوي اسمه سعد', kind: 'nonsense', ok: true, kindOut: 'fact' },
    { name: 'defaults a missing kind to fact', text: 'أبوي اسمه سعد', kind: undefined, ok: true, kindOut: 'fact' },
    { name: 'rejects an empty text', text: '   ', kind: 'fact', ok: false },
    { name: 'rejects a non-string text', text: 42, kind: 'fact', ok: false },
    { name: 'caps over-long text instead of rejecting', text: 'ا'.repeat(MEMORY_TEXT_MAX + 50), kind: 'fact', ok: true, textOut: 'ا'.repeat(MEMORY_TEXT_MAX) },
    { name: 'trims surrounding whitespace', text: '  نص عادي  ', kind: 'fact', ok: true, textOut: 'نص عادي' },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const out = normalizeMemoryInput(c.text, c.kind);
      expect(out.ok).toBe(c.ok);
      if (out.ok && c.ok) {
        expect(out.text).toBe(c.textOut ?? out.text);
        if (c.kindOut !== undefined) expect(out.kind).toBe(c.kindOut);
      }
    });
  }
});

describe('normalizeMemoryKind', () => {
  it('accepts only the four kinds and defaults everything else', () => {
    expect(MEMORY_KINDS).toEqual(['preference', 'person', 'routine', 'fact']);
    for (const kind of MEMORY_KINDS) expect(normalizeMemoryKind(kind)).toBe(kind);
    expect(normalizeMemoryKind('memory')).toBe('fact');
    expect(normalizeMemoryKind(null)).toBe('fact');
    expect(normalizeMemoryKind(7)).toBe('fact');
  });
});

describe('dedupe and cap', () => {
  it('collapses whitespace runs for the dedupe key', () => {
    expect(collapseSpaces('  أحب    القهوة ')).toBe('أحب القهوة');
  });

  it('finds a duplicate regardless of internal spacing', () => {
    const a = makeMemory('m1', 'preference', 'أحب القهوة بعد الفجر', 'agent', 1000);
    expect(findMemoryByText([a], 'أحب   القهوة  بعد الفجر')).toBe(a);
    expect(findMemoryByText([a], 'شيء آخر تمامًا')).toBeNull();
    expect(findMemoryByText([a], '')).toBeNull();
  });

  it('caps by updatedAt, newest first', () => {
    const records = [
      makeMemory('m1', 'fact', 'one', 'user', 100),
      makeMemory('m2', 'fact', 'two', 'user', 300),
      makeMemory('m3', 'fact', 'three', 'user', 200),
    ];
    expect(capMemories(records).map((m) => m.id)).toEqual(['m2', 'm3', 'm1']);
  });

  it('enforces the shelf cap', () => {
    const records = Array.from({ length: MEMORY_CAP + 10 }, (_, i) => makeMemory(`m${i}`, 'fact', `text ${i}`, 'user', i));
    expect(capMemories(records)).toHaveLength(MEMORY_CAP);
  });
});

describe('rendering helpers', () => {
  const records = [
    makeMemory('m1', 'preference', 'أحب القهوة بعد الفجر', 'agent', 1000),
    makeMemory('m2', 'person', 'أبوي اسمه سعد', 'user', 2000),
  ];

  it('summarizes with kind labels and ids (ar)', () => {
    const text = summarizeMemories(records, 'ar');
    expect(text).toContain('[تفضيل]');
    expect(text).toContain('[شخص]');
    expect(text).toContain('#m1');
    expect(text).toContain('#m2');
  });

  it('renders the empty shelf honestly', () => {
    expect(summarizeMemories([], 'ar')).toContain('فارغة');
    expect(summarizeMemories([], 'en')).toContain('empty');
  });

  it('renders a bounded known-context block for the prompts', () => {
    const block = renderMemoryContext(records, 'ar', 3);
    expect(block).toContain('معلومات معروفة عن المستخدم');
    expect(block.split('\n').length).toBe(3); // header + 2 lines
    const en = renderMemoryContext(records, 'en', 1);
    expect(en).toContain('Known facts about the user');
    expect(en).toContain('[preference]');
    expect(en).not.toContain('[person]');
  });

  it('renders nothing for an empty selection', () => {
    expect(renderMemoryContext([], 'ar')).toBe('');
  });

  it('labels kinds in both locales', () => {
    expect(memoryKindLabel('routine', 'ar')).toBe('عادة');
    expect(memoryKindLabel('routine', 'en')).toBe('routine');
  });
});

describe('useMemoryStore', () => {
  beforeEach(resetMemory);

  it('upserts: saves a new record, then refreshes the same fact in place', () => {
    const store = useMemoryStore.getState();
    store.upsertMemory(makeMemory('m1', 'preference', 'أحب القهوة بعد الفجر', 'agent', 1000));
    expect(useMemoryStore.getState().memories).toHaveLength(1);
    store.upsertMemory(makeMemory('m2', 'fact', 'أحب القهوة بعد الفجر', 'user', 2000));
    const memories = useMemoryStore.getState().memories;
    expect(memories).toHaveLength(1);
    expect(memories[0].id).toBe('m1'); // original id survives
    expect(memories[0].kind).toBe('fact');
    expect(memories[0].source).toBe('user');
    expect(memories[0].updatedAt).toBe(2000);
  });

  it('updates text and kind by id and reports misses', () => {
    const store = useMemoryStore.getState();
    store.upsertMemory(makeMemory('m1', 'fact', 'old text', 'user', 1000));
    expect(store.updateMemory('m1', { text: 'new text', kind: 'routine' })).toBe(true);
    expect(store.updateMemory('nope', { text: 'x' })).toBe(false);
    const m = useMemoryStore.getState().memories[0];
    expect(m.text).toBe('new text');
    expect(m.kind).toBe('routine');
  });

  it('deletes by id and clears the shelf', () => {
    const store = useMemoryStore.getState();
    store.upsertMemory(makeMemory('m1', 'fact', 'one', 'user', 1));
    store.upsertMemory(makeMemory('m2', 'fact', 'two', 'user', 2));
    expect(store.deleteMemory('m1')).toBe(true);
    expect(store.deleteMemory('m1')).toBe(false);
    expect(useMemoryStore.getState().memories.map((m) => m.id)).toEqual(['m2']);
    store.clearMemories();
    expect(useMemoryStore.getState().memories).toHaveLength(0);
  });
});
