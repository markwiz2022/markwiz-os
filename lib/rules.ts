import type { Db } from './db';
import { mdWaitingCount, redClientCount } from './kpi';
import { deliveryLeads, mdUsers, notify } from './team';
import { dayEndOfKey, istDateKey, isPastDue, nextWorkingDayKey, shortKeyLabel, workingDaysBetweenKeys } from './workcalendar';

// Overdue work goes to the owner and the DMM the moment it is late.
// Client work still open at the end of the next working day goes to the MD as well.
export async function runEscalations(db: Db, now = new Date()) {
  const late = await db.task.findMany({
    where: { status: { notIn: ['CLIENT', 'DONE'] }, due: { lt: now }, OR: [{ overdueNotifiedAt: null }, { escalatedAt: null, clientFacing: true }] },
    include: { client: { select: { name: true } }, owner: { select: { id: true, name: true } } },
  });
  if (!late.length) return { notified: 0, escalated: 0 };
  const leads = (await deliveryLeads(db)).map((u) => u.id);
  const mds = (await mdUsers(db)).map((u) => u.id);
  let notified = 0; let escalated = 0;
  for (const t of late) {
    if (!isPastDue(t.due, now)) continue;
    const dueKey = istDateKey(t.due);
    if (!t.overdueNotifiedAt) {
      await notify(db, [t.ownerId, ...leads.filter((id) => id !== t.ownerId)], 'Overdue', `"${t.desc}" (${t.client.name}) was due ${shortKeyLabel(dueKey)}. Owner: ${t.owner.name}.`);
      await db.task.update({ where: { id: t.id }, data: { overdueNotifiedAt: now } });
      await db.taskEvent.create({ data: { taskId: t.id, type: 'OVERDUE', note: 'Owner and DMM notified' } });
      notified++;
    }
    if (t.clientFacing && !t.escalatedAt && now > dayEndOfKey(nextWorkingDayKey(dueKey))) {
      await notify(db, mds, 'Escalated: client work still late', `"${t.desc}" (${t.client.name}) was due ${shortKeyLabel(dueKey)} and is still open. Owner: ${t.owner.name}.`);
      await db.task.update({ where: { id: t.id }, data: { escalatedAt: now } });
      await db.taskEvent.create({ data: { taskId: t.id, type: 'ESCALATED', note: 'Escalated to the MD after one working day' } });
      escalated++;
    }
  }
  return { notified, escalated };
}

export const AUTO_CLOSE_WORKING_DAYS = 3;

/** Work sent to a client with no changes requested within 3 working days is closed as approved. */
export async function autoCloseClientWork(db: Db, now = new Date()) {
  const today = istDateKey(now);
  const waiting = await db.task.findMany({ where: { status: 'CLIENT' }, select: { id: true, lastSentAt: true, deliveredAt: true } });
  let closed = 0;
  for (const t of waiting) {
    const sent = t.lastSentAt ?? t.deliveredAt;
    if (!sent || workingDaysBetweenKeys(istDateKey(sent), today) < AUTO_CLOSE_WORKING_DAYS) continue;
    await db.task.update({ where: { id: t.id }, data: { status: 'DONE', completedAt: now } });
    await db.taskEvent.create({ data: { taskId: t.id, type: 'AUTO_CLOSED', note: `No changes requested within ${AUTO_CLOSE_WORKING_DAYS} working days` } });
    closed++;
  }
  return { closed };
}

/** Evening numbers that can only be measured at a point in time. */
export async function takeSnapshots(db: Db, dateKey: string, now = new Date()) {
  const values: Record<string, number> = { md_waiting: await mdWaitingCount(db), red_clients: await redClientCount(db, now) };
  for (const [metric, value] of Object.entries(values)) {
    await db.metricSnapshot.upsert({ where: { metric_dateKey: { metric, dateKey } }, update: { value }, create: { metric, dateKey, value } });
  }
  return values;
}
