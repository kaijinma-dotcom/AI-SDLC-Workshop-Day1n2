// lib/recurrence.ts
// Due date calculation for recurring todos.

import type { RecurrencePattern } from './db';

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Handle month-end overflow (e.g., Jan 31 + 1 month → Feb 28/29)
  if (d.getDate() !== day) {
    d.setDate(0); // rewind to last day of the correct month
  }
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setFullYear(d.getFullYear() + years);
  // Handle Feb 29 overflow on non-leap years
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  const date = new Date(currentDueDate);
  switch (pattern) {
    case 'daily':
      return addDays(date, 1).toISOString();
    case 'weekly':
      return addDays(date, 7).toISOString();
    case 'monthly':
      return addMonths(date, 1).toISOString();
    case 'yearly':
      return addYears(date, 1).toISOString();
    default:
      throw new Error(`Unknown recurrence pattern: ${pattern}`);
  }
}
