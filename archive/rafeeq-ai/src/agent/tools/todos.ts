// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Todo tools — add, list and complete local tasks. The store and its pure
 * helpers live in todos.ts; these definitions only wire arguments into it.
 */

import { ToolRegistry } from '../registry';
import type { ToolDefinition, ToolResult } from '../types';
import {
  makeTodo,
  normalizeTodoInput,
  summarizeTodos,
  useTodosStore,
} from '../todos';
import { parseWhenIso, sanitizeGrammarText } from './normalize';

export interface TodoToolDeps {
  now?: () => Date;
}

const todosAdd = (deps: TodoToolDeps): ToolDefinition => ({
  name: 'todos.add',
  descriptionAr: 'يضيف مهمة إلى قائمة مهامك على الجهاز (بعد موافقتك).',
  descriptionEn: 'Adds a task to your on-device todo list (after your approval).',
  category: 'notes',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      due_iso: { type: 'string', description: 'Optional due time, e.g. 2026-11-09T16:00' },
    },
    required: ['title'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const input = normalizeTodoInput(args.title);
    if (!input.ok) return { ok: false, error: ctx.locale === 'ar' ? 'عنوان المهمة فارغ.' : 'The task title is empty.' };
    let dueMs: number | null = null;
    if (args.due_iso !== undefined && args.due_iso !== null && String(args.due_iso).trim() !== '') {
      const due = parseWhenIso(args.due_iso);
      if (!due.ok) return { ok: false, error: due.error };
      dueMs = due.when.getTime();
    }
    const now = (deps.now ?? (() => new Date()))();
    const id = `t_${now.getTime().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    useTodosStore.getState().addTodo(makeTodo(id, input.title, dueMs, now.getTime()));
    return {
      ok: true,
      data: ctx.locale === 'ar'
        ? `أضفت المهمة [${id}]: «${input.title}».`
        : `Added task [${id}]: “${input.title}”.`,
    };
  },
});

const todosList: ToolDefinition = {
  name: 'todos.list',
  descriptionAr: 'يعرض مهامك المفتوحة على الجهاز.',
  descriptionEn: 'Shows your open tasks on the device.',
  category: 'notes',
  mutating: false,
  parameters: { type: 'object', properties: {}, required: [] },
  async run(_args, ctx): Promise<ToolResult> {
    const todos = useTodosStore.getState().getTodos();
    return { ok: true, data: summarizeTodos(todos, ctx.locale) };
  },
};

const todosComplete = (): ToolDefinition => ({
  name: 'todos.complete',
  descriptionAr: 'يعلّم مهمة كمكتملة حسب رقمها من todos.list (بعد موافقتك).',
  descriptionEn: 'Marks a task done by its id from todos.list (after your approval).',
  category: 'notes',
  mutating: true,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task id from todos.list, e.g. t_abc1' },
    },
    required: ['id'],
  },
  async run(args, ctx): Promise<ToolResult> {
    const id = sanitizeGrammarText(String(args.id ?? ''));
    if (!id) return { ok: false, error: ctx.locale === 'ar' ? 'رقم المهمة ناقص — اعرض المهام أولًا.' : 'The task id is missing — list the tasks first.' };
    const ok = useTodosStore.getState().completeTodo(id);
    if (!ok) return { ok: false, error: ctx.locale === 'ar' ? `لم أجد مهمة مفتوحة برقم ${id}.` : `No open task with id ${id}.` };
    return { ok: true, data: ctx.locale === 'ar' ? `أكملت المهمة ${id}. أحسنت!` : `Completed task ${id}. Nice!` };
  },
});

/** Registers the todo tool family on a registry. */
export function registerTodoTools(registry: ToolRegistry, deps: TodoToolDeps = {}): ToolRegistry {
  registry.register(todosAdd(deps));
  registry.register(todosList);
  registry.register(todosComplete());
  return registry;
}
