import type { Todo } from './db';

function escapeCSVValue(value: string): string {
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function convertTodosToCSV(todos: Todo[]): string {
  const headers = [
    'ID',
    'Title',
    'Completed',
    'Due Date',
    'Priority',
    'Recurring',
    'Pattern',
    'Reminder (min)',
    'Created At',
  ];

  const rows = todos.map((todo) => [
    todo.id,
    escapeCSVValue(todo.title),
    todo.completed,
    todo.due_date ?? '',
    todo.priority,
    todo.is_recurring,
    todo.recurrence_pattern ?? '',
    todo.reminder_minutes ?? '',
    todo.created_at,
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
