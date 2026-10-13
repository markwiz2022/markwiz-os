import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { recalculateClientHealth } from '@/lib/client-health';
import { createTask } from '@/lib/task-flow';

export async function GET() {
  const g = await guard('tasks'); if (g.error) return g.error;
  const u = g.user!;
  const where = u.role === 'MD' || u.role === 'DMM' ? {} : { OR: [{ ownerId: u.id }, { assignerId: u.id }] };
  return NextResponse.json(await db.task.findMany({
    where,
    include: { client: { select: { id: true, name: true } }, owner: { select: { id: true, name: true, role: true } }, assigner: { select: { id: true, name: true, role: true } }, comments: true, timeEntries: true },
    orderBy: { due: 'asc' },
  }));
}

export async function POST(req: Request) {
  const g = await guard('tasks'); if (g.error) return g.error;
  const u = g.user!;
  try {
    const b = await req.json();
    const t = await createTask(db, u, b);
    await recalculateClientHealth(db, t.clientId);
    await audit(u.id, 'CREATE', 'Task', t.id, { desc: t.desc, ownerId: t.ownerId, category: t.category });
    return NextResponse.json(t);
  } catch (e) { return errorResponse(e); }
}
