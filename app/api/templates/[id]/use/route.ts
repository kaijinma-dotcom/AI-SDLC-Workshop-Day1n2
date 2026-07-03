// app/api/templates/[id]/use/route.ts
// Creates a new todo from a saved template.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const templateId = Number(id);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const template = templateDB.getById(templateId, session.userId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  let body: { due_date?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body is optional — ignore parse errors
  }

  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title_template,
    priority: template.priority,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern ?? null,
    reminder_minutes: template.reminder_minutes ?? null,
    due_date: body.due_date ?? null,
  });

  return NextResponse.json(todo, { status: 201 });
}
