// lib/filters.ts
// Unified filter state, defaults, and AND-composed apply function (PRP 08).

import type { Priority, Todo, Subtask, Tag } from './db';
import { searchTodos } from './search';

// ─── Types ─────────────────────────────────────────────────────────────────

export type CompletionFilter = 'all' | 'incomplete' | 'completed';

export interface FilterState {
  search: string;
  priority: Priority | 'all';
  tagId: number | null;
  completion: CompletionFilter;
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null;   // YYYY-MM-DD
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  priority: 'all',
  tagId: null,
  completion: 'all',
  dateFrom: null,
  dateTo: null,
};

// ─── Internal interface ──────────────────────────────────────────────────────

interface TodoWithExtras extends Todo {
  subtasks: Subtask[];
  tags: Tag[];
}

// ─── Apply all filters with AND logic ───────────────────────────────────────

export function applyFilters<T extends TodoWithExtras>(
  todos: T[],
  filters: FilterState
): T[] {
  let result = todos;

  // 1. Full-text search (title + subtask titles)
  if (filters.search.trim()) {
    result = searchTodos(result, filters.search);
  }

  // 2. Priority
  if (filters.priority !== 'all') {
    result = result.filter((t) => t.priority === filters.priority);
  }

  // 3. Tag
  if (filters.tagId !== null) {
    result = result.filter((t) => t.tags.some((tag) => tag.id === filters.tagId));
  }

  // 4. Completion status
  if (filters.completion === 'incomplete') {
    result = result.filter((t) => !t.completed);
  } else if (filters.completion === 'completed') {
    result = result.filter((t) => t.completed);
  }

  // 5. Due date range (only match todos that have a due_date)
  if (filters.dateFrom) {
    result = result.filter(
      (t) => t.due_date != null && t.due_date >= filters.dateFrom!
    );
  }
  if (filters.dateTo) {
    result = result.filter(
      (t) => t.due_date != null && t.due_date <= filters.dateTo! + 'T23:59:59'
    );
  }

  return result;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

/** Returns true when at least one filter differs from the default. */
export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.priority !== 'all' ||
    filters.tagId !== null ||
    filters.completion !== 'all' ||
    filters.dateFrom !== null ||
    filters.dateTo !== null
  );
}
