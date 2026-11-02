import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { csvResponse, parseMonthKey, toCsv } from '@/lib/csv';
import { CONTENT_STATUS_LABEL, effectiveStatus } from '@/lib/content';
import { lastDayOfMonth } from '@/lib/workcalendar';

/** GET /api/content/export?client=ID&month=YYYY-MM — the month's plan, e.g. to share with the client for approval. */
export async function GET(req: Request) {
  const g = await guard('clients'); if (g.error) return g.error;
  const p = new URL(req.url).searchParams;
  const month = parseMonthKey(p.get('month'));
  const client = await db.client.findUnique({ where: { id: p.get('client') || '' }, select: { id: true, name: true } });
  if (!month || !client) return NextResponse.json({ error: 'Choose a client and month' }, { status: 400 });
  const posts = await db.contentPost.findMany({
    where: { clientId: client.id, date: { gte: new Date(`${month}-01T00:00:00Z`), lte: new Date(`${month}-${String(lastDayOfMonth(month)).padStart(2, '0')}T23:59:59Z`) } },
    include: { task: { select: { status: true } } }, orderBy: { date: 'asc' },
  });
  return csvResponse(`content-plan-${client.name}-${month}.csv`, toCsv(
    ['Date', 'Platform', 'Format', 'Topic', 'Caption', 'Status', 'Live link'],
    posts.map((x) => [x.date.toISOString().slice(0, 10), x.platform, x.format, x.title, x.caption, CONTENT_STATUS_LABEL[effectiveStatus(x, x.task?.status)], x.postedUrl]),
  ));
}
