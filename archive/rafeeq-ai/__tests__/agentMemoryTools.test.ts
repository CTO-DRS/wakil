// Copyright (c) 2026 DRS AI. All rights reserved.
import { useMemoryStore } from '../src/agent/memory';
import { ToolRegistry } from '../src/agent/registry';
import { registerMemoryTools } from '../src/agent/tools/memory';
import type { ToolResult } from '../src/agent/types';

const NOW = new Date(2026, 10, 8, 9, 0, 0, 0);

function makeRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registerMemoryTools(registry, { now: () => NOW });
  return registry;
}

async function run(registry: ToolRegistry, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return registry.get(name)!.run(args, { locale: 'ar', now: () => NOW, model: null });
}

function memories() {
  return useMemoryStore.getState().getMemories();
}

describe('the memory tools', () => {
  beforeEach(() => {
    useMemoryStore.setState({ memories: [] });
  });

  describe('memory.save', () => {
    it('saves a new fact with kind and an id, and reports it in Arabic', async () => {
      const registry = makeRegistry();
      const res = await run(registry, 'memory.save', { text: 'أحب القهوة بعد الفجر', kind: 'preference' });
      expect(res.ok).toBe(true);
      expect(res.data).toContain('حفظت في الذاكرة');
      expect(res.data).toContain('(preference)');
      expect(res.data).toContain('أحب القهوة بعد الفجر');
      expect(memories()).toHaveLength(1);
      expect(memories()[0].kind).toBe('preference');
      expect(memories()[0].source).toBe('agent');
    });

    it('updates in place when the same fact is saved twice (dedupe)', async () => {
      const registry = makeRegistry();
      await run(registry, 'memory.save', { text: 'أحب القهوة بعد الفجر', kind: 'preference' });
      const second = await run(registry, 'memory.save', { text: 'أحب   القهوة بعد الفجر', kind: 'fact' });
      expect(second.ok).toBe(true);
      expect(second.data).toContain('حدّثت');
      expect(memories()).toHaveLength(1);
      expect(memories()[0].kind).toBe('fact');
    });

    it('rejects an empty text with an honest Arabic error', async () => {
      const registry = makeRegistry();
      const res = await run(registry, 'memory.save', { text: '   ' });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('فارغ');
      expect(memories()).toHaveLength(0);
    });

    it('strips grammar-breaking characters from the saved text', async () => {
      const registry = makeRegistry();
      const res = await run(registry, 'memory.save', { text: 'نص " فيه" رموز' });
      expect(res.ok).toBe(true);
      expect(memories()[0].text).not.toContain('"');
    });
  });

  describe('memory.forget', () => {
    it('forgets by the exact id from memory.search', async () => {
      const registry = makeRegistry();
      await run(registry, 'memory.save', { text: 'أبوي اسمه سعد' });
      const id = memories()[0].id;
      const res = await run(registry, 'memory.forget', { query: id });
      expect(res.ok).toBe(true);
      expect(res.data).toContain('نسيت');
      expect(memories()).toHaveLength(0);
    });

    it('forgets by close text when exactly one record matches', async () => {
      const registry = makeRegistry();
      await run(registry, 'memory.save', { text: 'أبوي اسمه سعد' });
      const res = await run(registry, 'memory.forget', { query: 'اسمه سعد' });
      expect(res.ok).toBe(true);
      expect(memories()).toHaveLength(0);
    });

    it('refuses to guess when the text matches several memories', async () => {
      const registry = makeRegistry();
      await run(registry, 'memory.save', { text: 'اجتماع العمل يوم الأحد' });
      await run(registry, 'memory.save', { text: 'اجتماع العمل الساعة عشرة' });
      const res = await run(registry, 'memory.forget', { query: 'اجتماع العمل' });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('2');
      expect(memories()).toHaveLength(2);
    });

    it('reports an honest miss when nothing matches', async () => {
      const registry = makeRegistry();
      const res = await run(registry, 'memory.forget', { query: 'طائرة' });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('memory.search');
    });
  });

  describe('memory.search', () => {
    it('ranks the matching memory first with its id', async () => {
      const registry = makeRegistry();
      await run(registry, 'memory.save', { text: 'أبوي اسمه سعد' });
      await run(registry, 'memory.save', { text: 'شغلي ينتهي الساعة خمسة' });
      const res = await run(registry, 'memory.search', { query: 'الشغل' });
      expect(res.ok).toBe(true);
      expect(res.data).toContain('شغلي');
      expect((res.data ?? '').split('\n')[0]).toContain('شغلي');
    });

    it('is honest about an empty memory and about a miss', async () => {
      const registry = makeRegistry();
      const empty = await run(registry, 'memory.search', {}); // no query → list the shelf
      expect(empty.ok).toBe(true);
      expect(empty.data).toContain('فارغة');
      await run(registry, 'memory.save', { text: 'أبوي اسمه سعد' });
      const miss = await run(registry, 'memory.search', { query: 'طائرة' });
      expect(miss.ok).toBe(true);
      expect(miss.data).toContain('ما لقيت');
    });

    it('renders English observations when the locale asks for them', async () => {
      const registry = makeRegistry();
      await run(registry, 'memory.save', { text: 'أبوي اسمه سعد' });
      const res = await registry.get('memory.search')!.run({ query: 'طائرة' }, { locale: 'en', now: () => NOW, model: null });
      expect(res.ok).toBe(true);
      expect(res.data).toContain('Nothing in memory relates');
    });
  });
});
