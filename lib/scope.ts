import type { ScopeItem } from '@prisma/client';
import type { Db } from './db';
import { CATEGORIES, defaultChecklist, FlowError } from './task-flow';
import { deliveryLeads, mdUsers, notify } from './team';
import {
  addDaysKey, istDateKey, isWorkingDayKey, lastDayOfMonth, mondayOfKey, monthKeyIST, monthLabel,
  nextWorkingDayKey, prevWorkingDayKey, shortKeyLabel, taskDueFromKey,
} from './workcalendar';

// Each retainer's deliverables live as scope items. On the 1st of every month (monthly items) and
// every Monday (weekly items) the system creates that period's task with owner and due date.
// A task is created at most once per item per period, so running the job twice is harmless.

export const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function describeCadence(item: Pick<ScopeItem, 'cadence' | 'dueDay'>) {
  return item.cadence === 'WEEKLY' ? `Weekly, due ${WEEKDAYS[item.dueDay] ?? 'Friday'}` : `Monthly, due on the ${ordinal(item.dueDay)}`;
}

export function periodKeyFor(item: Pick<ScopeItem, 'cadence'>, now: Date) {
  const today = istDateKey(now);
  return item.cadence === 'WEEKLY' ? mondayOfKey(today) : monthKeyIST(now);
}

/** Due date key for an item in a period. Weekly offs move the date to the previous working day in the same period. */
export function dueKeyFor(item: Pick<ScopeItem, 'cadence' | 'dueDay'>, periodKey: string) {
  if (item.cadence === 'WEEKLY') {
    const day = Math.min(6, Math.max(1, item.dueDay));
    let key = addDaysKey(periodKey, day - 1);
    if (!isWorkingDayKey(key)) {
      const prev = prevWorkingDayKey(key);
      key = prev >= periodKey ? prev : nextWorkingDayKey(key);
    }
    return key;
  }
  const day = Math.min(lastDayOfMonth(periodKey), Math.max(1, item.dueDay));
  let key = `${periodKey}-${String(day).padStart(2, '0')}`;
  if (!isWorkingDayKey(key)) {
    const prev = prevWorkingDayKey(key);
    key = prev.startsWith(periodKey) ? prev : nextWorkingDayKey(key);
  }
  return key;
}

export function periodLabel(item: Pick<ScopeItem, 'cadence'>, periodKey: string) {
  return item.cadence === 'WEEKLY' ? `week of ${shortKeyLabel(periodKey)}` : monthLabel(periodKey);
}

/** Creates any missing tasks for the current period. Returns how many were created. */
export async function generateScopeTasks(db: Db, now = new Date(), filter: { clientId?: string; itemId?: string } = {}) {
  const today = istDateKey(now);
  const items = await db.scopeItem.findMany({
    where: { active: true, ...(filter.itemId ? { id: filter.itemId } : {}), ...(filter.clientId ? { clientId: filter.clientId } : {}), client: { active: true, internal: false } },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!items.length) return { created: 0, skipped: 0 };

  const leads = await deliveryLeads(db);
  const mds = await mdUsers(db);
  const activeIds = new Set((await db.user.findMany({ where: { active: true }, select: { id: true } })).map((u) => u.id));
  const perOwner = new Map<string, string[]>();
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const periodKey = periodKeyFor(item, now);
    const dueKey = dueKeyFor(item, periodKey);
    if (dueKey < today) { skipped++; continue; }
    const exists = await db.task.findFirst({ where: { scopeItemId: item.id, periodKey }, select: { id: true } });
    if (exists) { skipped++; continue; }
    const ownerId = item.ownerId && activeIds.has(item.ownerId) ? item.ownerId : leads[0]?.id ?? mds[0]?.id;
    const assignerId = item.createdById && activeIds.has(item.createdById) ? item.createdById : leads[0]?.id ?? mds[0]?.id;
    if (!ownerId || !assignerId) { skipped++; continue; }
    const category = CATEGORIES[item.category] ? item.category : 'GENERAL';
    try {
      const task = await db.task.create({
        data: {
          clientId: item.clientId, ownerId, assignerId, desc: `${item.title} · ${periodLabel(item, periodKey)}`.slice(0, 300),
          due: taskDueFromKey(dueKey), priority: item.priority, approvalLevel: item.approvalLevel, status: 'OPEN',
          category, clientFacing: true, needsCopy: item.needsCopy, needsProof: item.needsProof,
          checklist: defaultChecklist(category), scopeItemId: item.id, periodKey,
        },
      });
      await db.taskEvent.create({ data: { taskId: task.id, userId: null, type: 'CREATED', note: 'Created automatically from the client scope' } });
      created++;
      perOwner.set(ownerId, [...(perOwner.get(ownerId) ?? []), `${item.client.name}: ${item.title} (due ${shortKeyLabel(dueKey)})`]);
    } catch (e: unknown) {
      // Unique (scopeItemId, periodKey) means another run created it first.
      if ((e as { code?: string })?.code === 'P2002') { skipped++; continue; }
      throw e;
    }
  }

  for (const [ownerId, lines] of perOwner) {
    await notify(db, [ownerId], `${lines.length} new task${lines.length === 1 ? '' : 's'} from client scopes`, lines.slice(0, 8).join('\n') + (lines.length > 8 ? `\n+ ${lines.length - 8} more` : ''));
  }
  return { created, skipped };
}

/** Validates a scope item form. */
export function scopeData(b: Record<string, unknown>) {
  const cadence = b.cadence === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY';
  const dueDay = Math.round(Number(b.dueDay));
  if (cadence === 'MONTHLY' && !(dueDay >= 1 && dueDay <= 31)) throw new FlowError('Monthly due day must be 1 to 31.', 400);
  if (cadence === 'WEEKLY' && !(dueDay >= 1 && dueDay <= 6)) throw new FlowError('Pick a weekday for weekly items.', 400);
  const category = CATEGORIES[String(b.category)] ? String(b.category) : 'GENERAL';
  return {
    cadence, dueDay, category,
    priority: (['P1', 'P2', 'P3'].includes(String(b.priority)) ? String(b.priority) : 'P2') as 'P1' | 'P2' | 'P3',
    approvalLevel: ['L0', 'L1', 'L2'].includes(String(b.approvalLevel)) ? String(b.approvalLevel) : 'L1',
    needsCopy: b.needsCopy === undefined ? CATEGORIES[category].copy : Boolean(b.needsCopy),
    needsProof: b.needsProof === undefined ? CATEGORIES[category].proof : Boolean(b.needsProof),
    ownerId: b.ownerId ? String(b.ownerId) : null,
    notes: b.notes ? String(b.notes).slice(0, 500) : null,
  };
}

