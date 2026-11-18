// Copyright (c) 2026 DRS AI. All rights reserved.
import {
  TODOS_CAP,
  capTodos,
  makeTodo,
  normalizeTodoInput,
  summarizeTodos,
  useTodosStore,
} from '../src/agent/todos';
import { registerTodoTools } from '../src/agent/tools/todos';
import { ToolRegistry } from '../src/agent/registry';
import { requiresConfirmation } from '../src/agent/confirmation';
import type { ToolContext } from '../src/agent/types';

const NOW = new Date(2026, 10, 8, 12, 0, 0);

const ctx: ToolContext = {
  locale: 'ar',
  now: () => NOW,
  model: null,
};

function resetStore() {
  useTodosStore.setState({ todos: [] });
}

beforeEach(resetStore);

describe('normalizeTodoInput', () => {
  it.each([
    { name: 'a plain title passes', title: 'أتصل على أبوي', ok: true },
    { name: 'an empty title fails', title: '   ', ok: false },
    { name: 'a non-string title fails', title: 42, ok: false },
    { name: 'an over-long title passes (capped)', title: 'x'.repeat(500), ok: true },
  ])('$name', ({ title, ok }) => {
    expect(normalizeTodoInput(title).ok).toBe(ok);
  });
});

describe('capTodos and summarizeTodos', () => {
  it('keeps the newest first and enforces the cap', () => {
    const todos = Array.from({ length: TODOS_CAP + 3 }, (_, i) => makeTodo(`t${i}`, `t${i}`, null, i));
    const capped = capTodos(todos);
    expect(capped).toHaveLength(TODOS_CAP);
    expect(capped[0].id).toBe(`t${TODOS_CAP + 2}`);
  });

  it('lists open tasks with their ids and hides done ones', () => {
    const text = summarizeTodos(
      [
        { ...makeTodo('t1', 'شراء الخبز', null, 2), done: false },
        { ...makeTodo('t2', 'المهمة المنجزة', null, 1), done: true },
      ],
      'ar',
    );
    expect(text).toContain('[t1] شراء الخبز');
    expect(text).not.toContain('المهمة المنجزة');
  });

  it('says there are no open tasks honestly', () => {
    expect(summarizeTodos([], 'ar')).toBe('لا مهام مفتوحة.');
  });
});

describe('todo tools', () => {
  it('todos.add stores the task with an id and optional due time', async () => {
    const registry = registerTodoTools(new ToolRegistry(), { now: () => NOW });
    const result = await registry.get('todos.add')!.run({ title: 'أتصل على أبوي', due_iso: '2026-11-08T18:30' }, ctx);
    expect(result.ok).toBe(true);
    const stored = useTodosStore.getState().getTodos();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('أتصل على أبوي');
    expect(stored[0].dueMs).toBe(new Date(2026, 10, 8, 18, 30).getTime());
    expect(result.data).toContain('[t_');
  });

  it('todos.add rejects an empty title', async () => {
    const registry = registerTodoTools(new ToolRegistry(), { now: () => NOW });
    const result = await registry.get('todos.add')!.run({ title: '  ' }, ctx);
    expect(result.ok).toBe(false);
    expect(useTodosStore.getState().getTodos()).toHaveLength(0);
  });

  it('todos.list renders the shelf', async () => {
    const registry = registerTodoTools(new ToolRegistry(), { now: () => NOW });
    await registry.get('todos.add')!.run({ title: 'شراء الخبز' }, ctx);
    const result = await registry.get('todos.list')!.run({}, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toContain('شراء الخبز');
  });

  it('todos.complete marks a listed task done and rejects unknown ids', async () => {
    const registry = registerTodoTools(new ToolRegistry(), { now: () => NOW });
    const added = await registry.get('todos.add')!.run({ title: 'مهمة اليوم' }, ctx);
    const id = /\[(t_[^\]]+)\]/.exec(added.data ?? '')?.[1] ?? '';
    expect(id).toBeTruthy();
    const ok = await registry.get('todos.complete')!.run({ id }, ctx);
    expect(ok.ok).toBe(true);
    expect(useTodosStore.getState().getTodos()[0].done).toBe(true);

    const missing = await registry.get('todos.complete')!.run({ id: 't_missing' }, ctx);
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain('لم أجد');
  });

  it('the mutating flags follow the confirmation policy', () => {
    const registry = registerTodoTools(new ToolRegistry());
    expect(requiresConfirmation(registry.get('todos.add')!)).toBe(true);
    expect(requiresConfirmation(registry.get('todos.list')!)).toBe(false);
    expect(requiresConfirmation(registry.get('todos.complete')!)).toBe(true);
  });
});
