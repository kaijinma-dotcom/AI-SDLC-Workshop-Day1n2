import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { holidayDB } from '@/lib/db';
import { getSingaporeNow, toSingaporeISO } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const yearParam = request.nextUrl.searchParams.get('year');
  const defaultYear = Number(toSingaporeISO(getSingaporeNow()).slice(0, 4));
  const year = yearParam ? Number.parseInt(yearParam, 10) : defaultYear;

  if (Number.isNaN(year)) {
    return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });
  }

  return NextResponse.json({ holidays: holidayDB.getByYear(year) });
}
