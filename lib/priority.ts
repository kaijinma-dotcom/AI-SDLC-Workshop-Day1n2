// lib/priority.ts
// Utilities for the priority system (PRP 02).

import type { Todo, Priority } from './db';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PriorityConfig {
  label: string;
  color: string;       // Tailwind text color class
  bgColor: string;     // Tailwind background color class
  borderColor: string; // Tailwind border color class
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  high: {
    label: 'High',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300 dark:border-red-700',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-700 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-700',
  },
  low: {
    label: 'Low',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-700',
  },
};

// ─── Sorting ────────────────────────────────────────────────────────────────

/**
 * Sort todos: High → Medium → Low.
 * Tie-break: earlier due_date first, then newer created_at first.
 */
export function sortByPriority<T extends Todo>(todos: T[]): T[] {
  return [...todos].sort((a, b) => {
    const priorityDiff =
      (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
    if (priorityDiff !== 0) return priorityDiff;
    // Secondary: earlier due date first
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    // Tertiary: newer created_at first
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ─── Filtering ──────────────────────────────────────────────────────────────

export function filterByPriority<T extends Todo>(
  todos: T[],
  priority: Priority | 'all'
): T[] {
  if (priority === 'all') return todos;
  return todos.filter((t) => t.priority === priority);
}
