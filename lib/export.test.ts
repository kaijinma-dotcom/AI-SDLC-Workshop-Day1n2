import test from 'node:test';
import assert from 'node:assert/strict';
import { convertTodosToCSV } from './export';
import type { Todo } from './db';

function createTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 1,
    user_id: 1,
    title: 'Ship feature',
    completed: false,
    due_date: '2026-07-03T10:00:00.000Z',
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: '2026-07-03T09:00:00.000Z',
    updated_at: '2026-07-03T09:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

test('convertTodosToCSV emits header row and stable column order', () => {
  const csv = convertTodosToCSV([createTodo()]);
  const [header, row] = csv.split('\n');

  assert.equal(
    header,
    'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder (min),Created At'
  );
  assert.equal(
    row,
    '1,"Ship feature",false,2026-07-03T10:00:00.000Z,medium,false,,,2026-07-03T09:00:00.000Z'
  );
});

test('convertTodosToCSV escapes quotes and commas in title', () => {
  const csv = convertTodosToCSV([
    createTodo({ title: 'Review "Q3, roadmap"' }),
  ]);

  assert.match(csv, /"Review ""Q3, roadmap"""/);
});

test('convertTodosToCSV neutralizes spreadsheet formulas', () => {
  const csv = convertTodosToCSV([createTodo({ title: '=cmd|\' /C calc\'!A0' })]);

  assert.match(csv, /"'=cmd\|' \/C calc'!A0"/);
});

test('convertTodosToCSV leaves nullable fields blank', () => {
  const csv = convertTodosToCSV([
    createTodo({
      due_date: null,
      recurrence_pattern: null,
      reminder_minutes: null,
    }),
  ]);
  const row = csv.split('\n')[1];

  assert.equal(
    row,
    '1,"Ship feature",false,,medium,false,,,2026-07-03T09:00:00.000Z'
  );
});
