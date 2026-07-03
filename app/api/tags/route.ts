// app/api/tags/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const tags = tagDB.getByUserId(session.userId);
  return NextResponse.json({ tags });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const name = (body?.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (name.length > 50) return NextResponse.json({ error: 'Name must be 50 characters or fewer' }, { status: 400 });

  const color: string = body?.color ?? '#3B82F6';
  if (!HEX_COLOR_RE.test(color)) {
    return NextResponse.json({ error: 'Invalid color — must be a 6-digit hex code (e.g. #3B82F6)' }, { status: 400 });
  }

  try {
    const tag = tagDB.create({ user_id: session.userId, name, color });
    return NextResponse.json(tag, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
  }
}
