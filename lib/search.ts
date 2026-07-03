// lib/search.ts
// Real-time search across todo titles and subtask titles.

import type { Todo, Subtask, Tag } from './db';

export interface TodoWithSubtasksAndTags extends Todo {
  subtasks: Subtask[];
  tags: Tag[];
}

/**
 * Filter todos whose title OR any subtask title contains the query (case-insensitive, partial match).
 */
export function searchTodos<T extends TodoWithSubtasksAndTags>(
  todos: T[],
  query: string
): T[] {
  if (!query.trim()) return todos;
  const q = query.toLowerCase().trim();
  return todos.filter((todo) => {
    const titleMatch = todo.title.toLowerCase().includes(q);
    const subtaskMatch = todo.subtasks.some((s) => s.title.toLowerCase().includes(q));
    return titleMatch || subtaskMatch;
  });
}
