// Copyright (c) 2026 DRS AI. All rights reserved.

/**
 * Local to-do items — the agent's second mutating shelf, riding the same
 * on-device KV store as the notes. Pure helpers (normalize / cap / summarize)
 * carry every rule, so the whole feature is table-driven testable without a
 * device, exactly like notes.ts.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '../storage/kv';

export interface TodoRecord {
  id: string;
  title: string;
  /** Optional due timestamp (ms). */
  dueMs: number | null;
  done: boolean;
  createdAt: number;
}

export const TODOS_STORAGE_KEY = 'rafeeq.agent.todos.v1';
/** Oldest completed/uncompleted items fall off beyond this cap. */
export const TODOS_CAP = 200;
export const TODO_TITLE_MAX = 160;

export type TodoInput = { ok: true; title: string } | { ok: false; error: string };

export function normalizeTodoInput(title: unknown): TodoInput {
  if (typeof title !== 'string' || title.trim().length === 0) return { ok: false, error: 'TODO_TITLE_REQUIRED' };
  return { ok: true, title: title.trim().slice(0, TODO_TITLE_MAX) };
}

/** Newest first, capped. Pure so the tools and tests share one rule. */
export function capTodos(todos: readonly TodoRecord[]): TodoRecord[] {
  return [...todos].sort((a, b) => b.createdAt - a.createdAt).slice(0, TODOS_CAP);
}

export function makeTodo(id: string, title: string, dueMs: number | null, createdAt: number): TodoRecord {
  return { id, title, dueMs, done: false, createdAt };
}

/** Renders the open list as the tool's observation (done items excluded). */
export function summarizeTodos(todos: readonly TodoRecord[], locale: 'ar' | 'en', max = 10): string {
  const open = todos.filter((t) => !t.done);
  if (open.length === 0) {
    return locale === 'ar' ? 'لا مهام مفتوحة.' : 'No open tasks.';
  }
  return open
    .slice(0, max)
    .map((t, i) => {
      const due = t.dueMs
        ? ` (${new Date(t.dueMs).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })})`
        : '';
      return `${i + 1}. [${t.id}] ${t.title}${due}`;
    })
    .join('\n');
}

type TodosState = {
  todos: TodoRecord[];
  addTodo: (todo: TodoRecord) => void;
  getTodos: () => TodoRecord[];
  completeTodo: (id: string) => boolean;
  deleteTodo: (id: string) => void;
};

/** KV-backed todo shelf; the todo tools read and write through it. */
export const useTodosStore = create<TodosState>()(
  persist(
    (set, get) => ({
      todos: [],
      addTodo: (todo) => set((s) => ({ todos: capTodos([todo, ...s.todos]) })),
      getTodos: () => get().todos,
      completeTodo: (id) => {
        const found = get().todos.some((t) => t.id === id && !t.done);
        if (found) set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, done: true } : t)) }));
        return found;
      },
      deleteTodo: (id) => set((s) => ({ todos: s.todos.filter((t) => t.id !== id) })),
    }),
    { name: TODOS_STORAGE_KEY, storage: createJSONStorage(() => kvStorage), version: 1 },
  ),
);
