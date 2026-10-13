import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { canView } from '@/lib/task-flow';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('tasks'); if (g.error) return g.error;
  const { id } = await params;
  const f = await db.taskFile.findUnique({ where: { id }, include: { task: true } });
  if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canView(f.task, g.user!)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return new NextResponse(new Uint8Array(f.data), { headers: { 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': `inline; filename="${encodeURIComponent(f.name)}"` } });
}
