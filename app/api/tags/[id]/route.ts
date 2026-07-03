// app/api/tags/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const tagId = Number(id);
  if (isNaN(tagId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const tag = tagDB.getById(tagId);
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  if (tag.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const updates: { name?: string; color?: string } = {};

  if (body?.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (name.length > 50) return NextResponse.json({ error: 'Name must be 50 characters or fewer' }, { status: 400 });
    updates.name = name;
  }

  if (body?.color !== undefined) {
    if (!HEX_COLOR_RE.test(body.color)) {
      return NextResponse.json({ error: 'Invalid color' }, { status: 400 });
    }
    updates.color = body.color;
  }

  try {
    const updated = tagDB.update(tagId, updates);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const tagId = Number(id);
  if (isNaN(tagId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const tag = tagDB.getById(tagId);
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  if (tag.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  tagDB.delete(tagId);
  return new NextResponse(null, { status: 204 });
}
