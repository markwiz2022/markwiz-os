import { after, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { recalculateClientHealth } from '@/lib/client-health';
import { notifyClientHealthChange } from '@/lib/health-notifications';
import { aiProofEnabled, runAiProofCheck } from '@/lib/proof-ai';
import { applyAction, canManage, canView, editTask, FlowError, overrideStatus, setCopy, setDeliverableLink, toggleChecklist } from '@/lib/task-flow';

// One endpoint for everything that changes a task. Every change goes through lib/task-flow.ts,
// so the gates (copy, proof check, release) can't be skipped by calling the API directly.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('tasks'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  try {
    const b = await req.json();
    const task = await db.task.findUnique({ where: { id } });
    if (!task) throw new FlowError('Task not found.', 404);
    if (!canView(task, u)) throw new FlowError('You don’t have access to this task.', 403);

    let updated;
    let statusChanged = false;
    if (b.action) {
      updated = await applyAction(db, id, u, String(b.action), b);
      statusChanged = updated.status !== task.status;
      if ((b.action === 'hand_in' || b.action === 'finish') && updated.status === 'REVIEW' && aiProofEnabled()) {
        const hasImage = await db.taskFile.findFirst({ where: { taskId: id, mime: { startsWith: 'image/' } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        if (hasImage) {
          const already = await db.proofCheck.findFirst({ where: { taskId: id, fileId: hasImage.id, status: { in: ['CLEAR', 'ISSUES'] } } });
          if (!already) after(async () => { try { await runAiProofCheck(db, id, hasImage.id); } catch (e) { console.error('[ai-proof]', e); } });
        }
      }
    } else if (b.copy !== undefined) {
      updated = await setCopy(db, id, u, String(b.copy));
    } else if (b.check !== undefined) {
      updated = await toggleChecklist(db, id, u, Number(b.check), Boolean(b.done));
    } else if (b.link !== undefined) {
      updated = await setDeliverableLink(db, id, u, String(b.link));
    } else if (b.override) {
      updated = await overrideStatus(db, id, u, String(b.override), String(b.note || ''));
      statusChanged = true;
    } else if (b.status) {
      throw new FlowError('Status changes go through the task actions (hand in, proof check, release). The MD can override from the task page.', 400);
    } else {
      if (!canManage(task, u) && task.ownerId !== u.id) throw new FlowError('Only the owner, the person who assigned it, the DMM or the MD can edit this task.', 403);
      updated = await editTask(db, id, u, b);
    }

    await recalculateClientHealth(db, task.clientId);
    if (statusChanged) await notifyClientHealthChange(db, task.clientId);
    await audit(u.id, b.action ? String(b.action).toUpperCase() : 'UPDATE', 'Task', id, { action: b.action, fields: Object.keys(b) });
    return NextResponse.json(updated);
  } catch (e) { return errorResponse(e); }
}
