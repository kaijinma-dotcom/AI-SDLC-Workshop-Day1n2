// app/api/todos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import type { Priority } from '@/lib/db';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const todos = todoDB.getByUserId(session.userId);
  return NextResponse.json({ todos });
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

  const todo = todoDB.create({
    user_id: session.userId,
    title,
    due_date,
    priority,
  });

  return NextResponse.json(todo, { status: 201 });
}
