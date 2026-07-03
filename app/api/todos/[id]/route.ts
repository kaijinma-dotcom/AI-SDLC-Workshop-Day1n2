// app/api/todos/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import type { Priority } from '@/lib/db';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  if (isNaN(todoId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const existing = todoDB.getById(todoId);
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  if (existing.user_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Validate title if provided
  if (body?.title !== undefined) {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (title.length > 255) {
      return NextResponse.json(
        { error: 'Title must be 255 characters or fewer' },
        { status: 400 }
      );
    }
  }

  // Validate priority if provided
  if (body?.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
    }
  }

  // Validate due_date if provided
  if (body?.due_date !== undefined && body.due_date !== null) {
    if (isNaN(Date.parse(body.due_date))) {
      return NextResponse.json({ error: 'Invalid due_date' }, { status: 400 });
    }
  }

  const updated = todoDB.update(todoId, {
    title: body?.title,
    completed: body?.completed,
    due_date: body?.due_date,
    priority: body?.priority,
    is_recurring: body?.is_recurring,
    recurrence_pattern: body?.recurrence_pattern,
    reminder_minutes: body?.reminder_minutes,
    last_notification_sent: body?.last_notification_sent,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = Number(id);
  if (isNaN(todoId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const existing = todoDB.getById(todoId);
  if (!existing) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  if (existing.user_id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  todoDB.delete(todoId);
  return new NextResponse(null, { status: 204 });
}
