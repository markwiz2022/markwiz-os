import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { runAiProofCheck } from '@/lib/proof-ai';
import { canView, FlowError } from '@/lib/task-flow';

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('tasks'); if (g.error) return g.error;
  const { id } = await params;
  try {
    const t = await db.task.findUnique({ where: { id } });
    if (!t) throw new FlowError('Task not found.', 404);
    if (!canView(t, g.user!)) throw new FlowError('Forbidden', 403);
    const check = await runAiProofCheck(db, id);
    return NextResponse.json(check);
  } catch (e) { return errorResponse(e); }
}
