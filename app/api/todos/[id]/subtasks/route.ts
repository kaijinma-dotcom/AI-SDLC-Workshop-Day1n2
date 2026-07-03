// app/api/todos/[id]/subtasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todoId = Number(id);
  if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const todo = todoDB.getById(todoId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ subtasks: subtaskDB.getByTodoId(todoId) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todoId = Number(id);
  if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const todo = todoDB.getById(todoId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const title = (body?.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (title.length > 255) return NextResponse.json({ error: 'Title must be 255 characters or fewer' }, { status: 400 });

  const subtask = subtaskDB.create({ todo_id: todoId, title });
  return NextResponse.json(subtask, { status: 201 });
}
