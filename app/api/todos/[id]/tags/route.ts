// app/api/todos/[id]/tags/route.ts
// POST: replace all tags for a todo with the provided set
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, tagDB } from '@/lib/db';

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
  const tagIds: number[] = Array.isArray(body?.tagIds) ? body.tagIds : [];

  tagDB.setTodoTags(todoId, tagIds);
  const tags = tagDB.getByTodoId(todoId);
  return NextResponse.json({ tags });
}
