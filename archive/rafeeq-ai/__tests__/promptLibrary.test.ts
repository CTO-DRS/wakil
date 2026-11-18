// Copyright (c) 2026 DRS AI. All rights reserved.
import { Storage } from 'expo-sqlite/kv-store';

import { insertPromptIntoDraft, usePromptLibraryStore } from '../src/store/promptLibraryStore';
import { MAX_PROMPTS, PROMPT_BODY_MAX, PROMPT_TITLE_MAX } from '../src/utils/promptLimits';

describe('insertPromptIntoDraft', () => {
  it('replaces an empty or whitespace-only draft outright', () => {
    expect(insertPromptIntoDraft('', 'hello')).toBe('hello');
    expect(insertPromptIntoDraft('   \n  ', 'hello')).toBe('hello');
  });

  it('appends the prompt on its own line below the current draft', () => {
    expect(insertPromptIntoDraft('hi', 'hello')).toBe('hi\nhello');
    expect(insertPromptIntoDraft('hi  \n', 'hello')).toBe('hi\nhello');
  });

  it('keeps the draft untouched when the prompt body is blank', () => {
    expect(insertPromptIntoDraft('hi', '   ')).toBe('hi');
    expect(insertPromptIntoDraft('', '   ')).toBe('');
  });
});

describe('promptLibraryStore', () => {
  beforeEach(() => {
    Storage.clear();
    usePromptLibraryStore.setState({ items: [] });
  });

  it('saves a prompt and derives the title from the body when none is given', () => {
    const item = usePromptLibraryStore.getState().add('  لخّص هذا المقال باختصار  ');
    expect(item).not.toBeNull();
    expect(item!.body).toBe('لخّص هذا المقال باختصار');
    expect(item!.title).toBe('لخّص هذا المقال باختصار');
    expect(item!.id).toBeTruthy();
  });

  it('uses the given title after trimming it', () => {
    const item = usePromptLibraryStore.getState().add('body text', '  my title  ');
    expect(item!.title).toBe('my title');
  });

  it('rejects empty bodies without touching the library', () => {
    expect(usePromptLibraryStore.getState().add('   ')).toBeNull();
    expect(usePromptLibraryStore.getState().items).toHaveLength(0);
  });

  it('keeps the newest prompt first', () => {
    const store = usePromptLibraryStore.getState();
    store.add('first');
    store.add('second');
    expect(usePromptLibraryStore.getState().items.map((i) => i.body)).toEqual(['second', 'first']);
  });

  it('enforces the library cap', () => {
    const store = usePromptLibraryStore.getState();
    for (let i = 0; i < MAX_PROMPTS; i += 1) {
      expect(store.add(`prompt ${i}`)).not.toBeNull();
    }
    expect(store.add('one more')).toBeNull();
    expect(usePromptLibraryStore.getState().items).toHaveLength(MAX_PROMPTS);
  });

  it('clamps oversized titles and bodies', () => {
    const long = 'x'.repeat(200);
    const veryLongBody = `${'y'.repeat(PROMPT_BODY_MAX + 500)}`;
    const item = usePromptLibraryStore.getState().add(veryLongBody, long)!;
    expect(item.title).toHaveLength(PROMPT_TITLE_MAX);
    expect(item.body).toHaveLength(PROMPT_BODY_MAX);
  });

  it('edits in place without reshuffling the order', () => {
    const store = usePromptLibraryStore.getState();
    const a = store.add('first')!;
    const b = store.add('second')!;
    expect(store.update(b.id, { title: '  ', body: 'renewed' })).toBe(true);
    const items = usePromptLibraryStore.getState().items;
    expect(items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(items[0].body).toBe('renewed');
    // A cleared name falls back to the derived title.
    expect(items[0].title).toBe('renewed');
  });

  it('refuses to set an empty body and rejects unknown ids', () => {
    const item = usePromptLibraryStore.getState().add('keep')!;
    expect(usePromptLibraryStore.getState().update(item.id, { body: '   ' })).toBe(false);
    expect(usePromptLibraryStore.getState().update('p_missing', { body: 'x' })).toBe(false);
    expect(usePromptLibraryStore.getState().update('p_missing', { title: 'x' })).toBe(false);
    expect(usePromptLibraryStore.getState().items[0].body).toBe('keep');
  });

  it('removes prompts; unknown ids are a no-op', () => {
    const item = usePromptLibraryStore.getState().add('bye')!;
    usePromptLibraryStore.getState().remove(item.id);
    expect(usePromptLibraryStore.getState().items).toHaveLength(0);
    expect(() => usePromptLibraryStore.getState().remove('p_missing')).not.toThrow();
  });

  it('importItems inserts a planned batch on top and returns the count added', () => {
    usePromptLibraryStore.getState().add('existing');
    const added = usePromptLibraryStore.getState().importItems([
      { id: 'p_x1', title: 'a', body: 'first', createdAt: 1 },
      { id: 'p_x2', title: 'b', body: 'second', createdAt: 2 },
    ]);
    expect(added).toBe(2);
    const items = usePromptLibraryStore.getState().items;
    expect(items.map((i) => i.id)).toEqual(['p_x1', 'p_x2', items[2].id]);
    expect(items[2].body).toBe('existing');
  });

  it('importItems is a no-op for an empty batch', () => {
    usePromptLibraryStore.getState().add('kept');
    expect(usePromptLibraryStore.getState().importItems([])).toBe(0);
    expect(usePromptLibraryStore.getState().items).toHaveLength(1);
  });

  it('persists only the item list and restores it on a fresh launch', async () => {
    usePromptLibraryStore.getState().add('persisted body', 'persisted');
    const raw = Storage.getItemSync('rafeeq.prompts.v1');
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(Object.keys(parsed.state).sort()).toEqual(['items']);

    // Simulate a fresh app launch: wipe the context, restore the disk snapshot.
    usePromptLibraryStore.setState({ items: [] });
    Storage.setItemSync('rafeeq.prompts.v1', raw!);
    await usePromptLibraryStore.persist.rehydrate();
    const items = usePromptLibraryStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('persisted');
    expect(items[0].body).toBe('persisted body');
  });
});
