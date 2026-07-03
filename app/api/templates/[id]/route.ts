// app/api/templates/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

export async function DELETE(
  _request: NextRequest,
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

  const existing = templateDB.getById(templateId, session.userId);
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  templateDB.delete(templateId, session.userId);
  return new NextResponse(null, { status: 204 });
}
