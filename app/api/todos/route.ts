// app/api/todos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB } from '@/lib/db';
import type { Priority, RecurrencePattern } from '@/lib/db';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const VALID_RECURRENCE: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const todos = todoDB.getByUserId(session.userId);
  const todoIds = todos.map((t) => t.id);

  const allSubtasks = subtaskDB.getByTodoIds(todoIds);
  const allTags = tagDB.getByTodoIds(todoIds);

  const todosWithExtras = todos.map((todo) => ({
    ...todo,
    subtasks: allSubtasks.filter((s) => s.todo_id === todo.id),
    tags: allTags.filter((t) => t.todo_id === todo.id).map(({ todo_id: _ignored, ...tag }) => tag),
  }));

  return NextResponse.json({ todos: todosWithExtras });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();

  // Validate title
  const title = (body?.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (title.length > 255) {
    return NextResponse.json(
      { error: 'Title must be 255 characters or fewer' },
      { status: 400 }
    );
  }

  // Validate priority
  const priority: Priority = body?.priority ?? 'medium';
  if (!VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
  }

  // Validate due_date
  const due_date: string | null = body?.due_date ?? null;
  if (due_date !== null && isNaN(Date.parse(due_date))) {
    return NextResponse.json({ error: 'Invalid due_date' }, { status: 400 });
  }

  // Validate recurrence
  const is_recurring: boolean = body?.is_recurring === true;
  const recurrence_pattern: RecurrencePattern | null = body?.recurrence_pattern ?? null;
  if (is_recurring && !due_date) {
    return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
  }
  if (recurrence_pattern !== null && !VALID_RECURRENCE.includes(recurrence_pattern)) {
    return NextResponse.json({ error: 'Invalid recurrence_pattern' }, { status: 400 });
  }

  const todo = todoDB.create({
    user_id: session.userId,
    title,
    due_date,
    priority,
    is_recurring,
    recurrence_pattern: is_recurring ? recurrence_pattern : null,
    reminder_minutes: due_date
      ? (typeof body?.reminder_minutes === 'number' ? body.reminder_minutes : null)
      : null,
  });

  // Apply tags
  const tagIds: number[] = Array.isArray(body?.tagIds) ? body.tagIds : [];
  if (tagIds.length > 0) {
    tagDB.setTodoTags(todo.id, tagIds);
  }

  const tags = tagDB.getByTodoId(todo.id);
  return NextResponse.json({ ...todo, subtasks: [], tags }, { status: 201 });
}
