// app/api/notifications/check/route.ts
// Returns all incomplete todos for the authenticated user whose reminder
// time has passed and haven't been notified yet.

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = new Date().toISOString();
  const todos = todoDB.getDueReminders(session.userId, now);
  return NextResponse.json({ todos });
}
