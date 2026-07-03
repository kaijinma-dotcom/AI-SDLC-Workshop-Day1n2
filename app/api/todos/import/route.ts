import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import type { Priority, RecurrencePattern } from '@/lib/db';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const VALID_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

type ImportTodo = {
  title?: unknown;
  completed?: unknown;
  due_date?: unknown;
  priority?: unknown;
  is_recurring?: unknown;
  recurrence_pattern?: unknown;
  reminder_minutes?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  completed_at?: unknown;
  last_notification_sent?: unknown;
};

const MAX_IMPORT_ITEMS = 500;
const MAX_TITLE_LENGTH = 255;
const MAX_REMINDER_MINUTES = 7 * 24 * 60;

function isImportTodo(value: unknown): value is ImportTodo {
  return typeof value === 'object' && value !== null;
}

function parseOptionalISOString(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of todos' }, { status: 400 });
  }

  if (body.length > MAX_IMPORT_ITEMS) {
    return NextResponse.json(
      { error: `Cannot import more than ${MAX_IMPORT_ITEMS} todos at once` },
      { status: 400 }
    );
  }

  let count = 0;

  for (const item of body) {
    if (!isImportTodo(item) || typeof item.title !== 'string') {
      continue;
    }

    const title = item.title.trim();
    if (!title || title.length > MAX_TITLE_LENGTH) {
      continue;
    }

    const priority = VALID_PRIORITIES.includes(item.priority as Priority)
      ? (item.priority as Priority)
      : 'medium';
    const recurrencePattern = VALID_PATTERNS.includes(
      item.recurrence_pattern as RecurrencePattern
    )
      ? (item.recurrence_pattern as RecurrencePattern)
      : null;
    const dueDate = parseOptionalISOString(item.due_date);
    const reminderMinutes =
      typeof item.reminder_minutes === 'number' &&
      Number.isInteger(item.reminder_minutes) &&
      item.reminder_minutes >= 0 &&
      item.reminder_minutes <= MAX_REMINDER_MINUTES
        ? item.reminder_minutes
        : null;
    const createdAt = parseOptionalISOString(item.created_at);
    const updatedAt = parseOptionalISOString(item.updated_at) ?? createdAt;
    const completed = item.completed === true;
    const completedAt = completed
      ? parseOptionalISOString(item.completed_at) ?? updatedAt
      : null;
    const lastNotificationSent = parseOptionalISOString(item.last_notification_sent);

    todoDB.createFromImport({
      user_id: session.userId,
      title,
      completed,
      due_date: dueDate,
      priority,
      is_recurring: Boolean(item.is_recurring),
      recurrence_pattern: recurrencePattern,
      reminder_minutes: reminderMinutes,
      created_at: createdAt ?? undefined,
      updated_at: updatedAt ?? undefined,
      completed_at: completedAt,
      last_notification_sent: lastNotificationSent,
    });
    count += 1;
  }

  return NextResponse.json({
    message: `Successfully imported ${count} todos`,
    count,
  });
}
