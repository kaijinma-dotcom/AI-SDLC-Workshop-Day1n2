import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { convertTodosToCSV } from '@/lib/export';
import { getSingaporeNow, toSingaporeISO } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'json';
  const todos = todoDB.getByUserId(session.userId);
  const sgtDate = toSingaporeISO(getSingaporeNow()).slice(0, 10);

  if (format === 'csv') {
    return new Response(convertTodosToCSV(todos), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${sgtDate}.csv"`,
      },
    });
  }

  return new Response(JSON.stringify(todos, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${sgtDate}.json"`,
    },
  });
}
