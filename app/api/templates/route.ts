// app/api/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';
import type { Priority, RecurrencePattern } from '@/lib/db';

const VALID_PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const VALID_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const templates = templateDB.getByUserId(session.userId);
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();

  const name = (body?.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: 'Name must be 100 characters or fewer' }, { status: 400 });
  }

  const title_template = (body?.title_template ?? '').trim();
  if (!title_template) {
    return NextResponse.json({ error: 'Title template is required' }, { status: 400 });
  }
  if (title_template.length > 255) {
    return NextResponse.json({ error: 'Title template must be 255 characters or fewer' }, { status: 400 });
  }

  const priority: Priority = body?.priority ?? 'medium';
  if (!VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority value' }, { status: 400 });
  }

  const recurrence_pattern: RecurrencePattern | null = body?.recurrence_pattern ?? null;
  if (recurrence_pattern !== null && !VALID_PATTERNS.includes(recurrence_pattern)) {
    return NextResponse.json({ error: 'Invalid recurrence_pattern value' }, { status: 400 });
  }

  const template = templateDB.create({
    user_id: session.userId,
    name,
    title_template,
    description: body?.description ?? null,
    category: body?.category ?? null,
    priority,
    is_recurring: Boolean(body?.is_recurring),
    recurrence_pattern,
    reminder_minutes:
      typeof body?.reminder_minutes === 'number' ? body.reminder_minutes : null,
  });

  return NextResponse.json(template, { status: 201 });
}
