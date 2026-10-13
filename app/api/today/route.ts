import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { ensureInternalClient } from '@/lib/onboarding';
import { commitPlan, giveReasons } from '@/lib/saydo';
import { createTask, FlowError } from '@/lib/task-flow';
import { istDateKey } from '@/lib/workcalendar';

export async function POST(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  try {
    const b = await req.json();
    if (b.action === 'commit') return NextResponse.json(await commitPlan(db, u, Array.isArray(b.taskIds) ? b.taskIds.map(String) : []));
    if (b.action === 'reasons') return NextResponse.json({ saved: await giveReasons(db, u.id, Array.isArray(b.reasons) ? b.reasons : []) });
    if (b.action === 'quick-add') {
      const clientId = b.clientId ? String(b.clientId) : (await ensureInternalClient(db)).id;
      const t = await createTask(db, u, { clientId, ownerId: u.id, desc: String(b.desc || ''), due: istDateKey(new Date()), approvalLevel: 'L0', category: 'GENERAL', needsCopy: false, needsProof: false });
      return NextResponse.json(t);
    }
    throw new FlowError('Unknown action.', 400);
  } catch (e) { return errorResponse(e); }
}
