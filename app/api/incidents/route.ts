import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { recalculateClientHealth } from '@/lib/client-health';
import { deliveryLeads, mdUsers, notify } from '@/lib/team';
import { FlowError } from '@/lib/task-flow';

// Errors that reached a client, complaints and client-reported bugs. Logged by the MD or DMM
// (or whoever assigned the task), never by the person whose work it was.
export async function POST(req: Request) {
  const g = await guard('tasks'); if (g.error) return g.error;
  const u = g.user!;
  try {
    const b = await req.json();
    const type = String(b.type);
    if (!['ERROR', 'COMPLAINT', 'BUG'].includes(type)) throw new FlowError('Choose error, complaint or bug.', 400);
    const description = String(b.description || '').trim();
    if (description.length < 5) throw new FlowError('Say what happened in a sentence.', 400);
    let clientId = String(b.clientId || '');
    let ownerId: string | null = null; let proofById: string | null = null; let assignerId: string | null = null;
    if (b.taskId) {
      const t = await db.task.findUnique({ where: { id: String(b.taskId) } });
      if (!t) throw new FlowError('Task not found.', 404);
      if (!['CLIENT', 'DONE'].includes(t.status) && !t.deliveredAt) throw new FlowError('This task hasn’t reached the client yet. Send it back instead.');
      clientId = t.clientId; ownerId = t.ownerId; proofById = t.proofById; assignerId = t.assignerId;
    }
    if (!(u.role === 'MD' || u.role === 'DMM' || (assignerId && assignerId === u.id))) throw new FlowError('Only the MD, the DMM or the person who assigned the work can log this.', 403);
    if (ownerId === u.id) throw new FlowError('Someone else has to log an error on your own work.', 403);
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client || client.internal) throw new FlowError('Choose a client.', 400);
    const inc = await db.incident.create({ data: { clientId, taskId: b.taskId ? String(b.taskId) : null, type, description: description.slice(0, 1000), ownerId, proofById, reportedById: u.id } });
    if (b.taskId) await db.taskEvent.create({ data: { taskId: String(b.taskId), userId: u.id, type: 'INCIDENT', note: `${type}: ${description.slice(0, 300)}` } });
    await recalculateClientHealth(db, clientId);
    const label = type === 'ERROR' ? 'Error reached the client' : type === 'BUG' ? 'Client-reported bug' : 'Client complaint';
    await notify(db, [ownerId, proofById, ...(await deliveryLeads(db)).map((x) => x.id), ...(await mdUsers(db)).map((x) => x.id)].filter((x) => x !== u.id), `${label}: ${client.name}`, description.slice(0, 300));
    await audit(u.id, 'CREATE', 'Incident', inc.id, { type, clientId });
    return NextResponse.json(inc);
  } catch (e) { return errorResponse(e); }
}
