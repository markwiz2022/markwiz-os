import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { canView } from '@/lib/task-flow';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('tasks'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  const b = await req.json();
  const body = String(b.body || '').trim();
  if (!body) return NextResponse.json({ error: 'Write a comment first.' }, { status: 400 });
  const task = await db.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  if (!canView(task, u)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json(await db.comment.create({ data: { taskId: id, authorId: u.id, body: body.slice(0, 2000) } }));
}
