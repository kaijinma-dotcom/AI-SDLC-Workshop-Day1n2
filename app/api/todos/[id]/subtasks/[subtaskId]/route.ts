// app/api/todos/[id]/subtasks/[subtaskId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id, subtaskId } = await params;
  const todoId = Number(id);
  const sId = Number(subtaskId);
  if (isNaN(todoId) || isNaN(sId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const todo = todoDB.getById(todoId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subtask = subtaskDB.getById(sId);
  if (!subtask || subtask.todo_id !== todoId) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  const body = await request.json();
  const updated = subtaskDB.update(sId, {
    completed: body?.completed !== undefined ? Boolean(body.completed) : subtask.completed,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subtaskId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id, subtaskId } = await params;
  const todoId = Number(id);
  const sId = Number(subtaskId);
  if (isNaN(todoId) || isNaN(sId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const todo = todoDB.getById(todoId);
  if (!todo) return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subtask = subtaskDB.getById(sId);
  if (!subtask || subtask.todo_id !== todoId) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  subtaskDB.delete(sId);
  return new NextResponse(null, { status: 204 });
}
