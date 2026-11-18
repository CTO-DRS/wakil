// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Memory tools — the agent's way to remember, recall and (with permission)
 * forget. `memory.save` and `memory.forget` change the shelf, so the loop
 * stops for a confirmation card before they run; `memory.search` is read-only
 * and runs directly, riding the same Arabic-aware lexical ranking the
 * planner-context injection uses.
 */

import {
  collapseSpaces,
  makeMemory,
  normalizeMemoryInput,
  summarizeMemories,
  useMemoryStore,
  type MemoryRecord,
} from '../memory';
import { rankLexical } from '../retrieval';
import { ToolRegistry } from '../registry';
import type { ToolDefinition, ToolResult } from '../types';
import { sanitizeGrammarText } from './normalize';

export interface MemoryToolDeps {
  now?: () => Date;
}

/** Same character class the grammar forbids — the belt under the suspenders. */
function sanitizeMemoryText(text: string): string {
  return text.replace(/["\\\x00-\x1F]/g, '').trim();
}

const KINDS: readonly string[] = ['preference', 'person', 'routine', 'fact'];

const memorySave = (deps: MemoryToolDeps): ToolDefinition => ({
  name: 'memory.save',
  descriptionAr: 'يحفظ معلومة دائمة عنك في ذاكرتك المحلية (تفضيل، شخص، عادة، معلومة) — بعد موافقتك.',
  descriptionEn: 'Saves a lasting fact about you into local memory (preference, person, routine, fact) — after your approval.',
  category: 'memory',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The fact, in the user’s own words' },
      kind: { type: 'string', enum: KINDS, description: 'What kind of fact this is' },
    },
    required: ['text'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const text = sanitizeMemoryText(String(args.text ?? ''));
    const input = normalizeMemoryInput(text, args.kind);
    if (!input.ok) {
      return { ok: false, error: ctx.locale === 'ar' ? 'النص المراد حفظه فارغ.' : 'The text to remember is empty.' };
    }
    const now = (deps.now ?? (() => new Date()))();
    const store = useMemoryStore.getState();
    const duplicate = store.getMemories().find((m) => collapseSpaces(m.text) === collapseSpaces(input.text));
    if (duplicate) {
      const changed = duplicate.kind !== input.kind;
      store.updateMemory(duplicate.id, { text: input.text, kind: input.kind });
      return {
        ok: true,
        data: ctx.locale === 'ar'
          ? `حدّثت ما يعرفه رفيق عنك بالفعل [${duplicate.id}]: «${input.text}»${changed ? ` — صار نوعه «${input.kind}»` : ''}.`
          : `Updated what Rafeeq already knows [${duplicate.id}]: “${input.text}”${changed ? ` — kind is now “${input.kind}”` : ''}.`,
      };
    }
    const id = `m_${now.getTime().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    store.upsertMemory(makeMemory(id, input.kind, input.text, 'agent', now.getTime()));
    return {
      ok: true,
      data: ctx.locale === 'ar'
        ? `حفظت في الذاكرة [${id}] (${input.kind}): «${input.text}».`
        : `Saved to memory [${id}] (${input.kind}): “${input.text}”.`,
    };
  },
});

const memoryForget = (): ToolDefinition => ({
  name: 'memory.forget',
  descriptionAr: 'ينسى معلومة من ذاكرتك المحلية بالمعرّف أو بنص قريب — بعد موافقتك.',
  descriptionEn: 'Forgets a memory by id or by close text — after your approval.',
  category: 'memory',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Memory id from memory.search (m_…) or text close to the saved fact' },
    },
    required: ['query'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const query = sanitizeGrammarText(String(args.query ?? ''));
    if (!query) {
      return { ok: false, error: ctx.locale === 'ar' ? 'حدّد ما تريد نسيانه — ابحث أولًا بـ memory.search.' : 'Say what to forget — search first with memory.search.' };
    }
    const memories = useMemoryStore.getState().getMemories();
    // 1. Exact id — the unambiguous path the model has from search results.
    const byId = memories.find((m) => m.id === query);
    if (byId) {
      useMemoryStore.getState().deleteMemory(byId.id);
      return {
        ok: true,
        data: ctx.locale === 'ar'
          ? `نسيت [${byId.id}]: «${byId.text}».`
          : `Forgot [${byId.id}]: “${byId.text}”.`,
      };
    }
    // 2. Close text: one match deletes it; many matches refuse and list (a
    //    vague forget is how agents delete the wrong thing).
    const needle = collapseSpaces(sanitizeMemoryText(query));
    const hits = memories.filter((m) => {
      const hay = collapseSpaces(m.text);
      return hay.includes(needle) || needle.includes(hay);
    });
    if (hits.length === 1) {
      useMemoryStore.getState().deleteMemory(hits[0].id);
      return {
        ok: true,
        data: ctx.locale === 'ar'
          ? `نسيت [${hits[0].id}]: «${hits[0].text}».`
          : `Forgot [${hits[0].id}]: “${hits[0].text}”.`,
      };
    }
    if (hits.length > 1) {
      const list = summarizeMemories(hits, ctx.locale, 5);
      return {
        ok: false,
        error: ctx.locale === 'ar'
          ? `النص قريب من ${hits.length} ذكريات — حدّد المعرّف بدقة:\n${list}`
          : `That text is close to ${hits.length} memories — give the exact id:\n${list}`,
      };
    }
    return {
      ok: false,
      error: ctx.locale === 'ar'
        ? 'ما لقيت شيئًا كهذا في الذاكرة. جرّب memory.search أولًا.'
        : 'Nothing like that in memory. Try memory.search first.',
    };
  },
});

const memorySearch = (): ToolDefinition => ({
  name: 'memory.search',
  descriptionAr: 'يبحث في ذاكرتك المحلية عن معلومات تتعلق بالطلب ويعرضها مع معرّفاتها.',
  descriptionEn: 'Searches local memory for facts related to the request and shows them with ids.',
  category: 'memory',
  mutating: false,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look for' },
    },
    required: ['query'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const query = sanitizeGrammarText(String(args.query ?? ''));
    const memories = useMemoryStore.getState().getMemories();
    if (!query) {
      return { ok: true, data: summarizeMemories(memories, ctx.locale) };
    }
    const ranked: MemoryRecord[] = rankLexical(query, memories, (m) => m.text, 5).map((r) => r.item);
    if (ranked.length === 0) {
      return {
        ok: true,
        data: ctx.locale === 'ar'
          ? 'ما لقيت في الذاكرة شيئًا يتعلق بهذا.'
          : 'Nothing in memory relates to that.',
      };
    }
    return { ok: true, data: summarizeMemories(ranked, ctx.locale, 5) };
  },
});

/** Registers the memory tool family on a registry. */
export function registerMemoryTools(registry: ToolRegistry, deps: MemoryToolDeps = {}): ToolRegistry {
  registry.register(memorySave(deps));
  registry.register(memoryForget());
  registry.register(memorySearch());
  return registry;
}
