import type { Db } from './db';
import { FlowError } from './task-flow';
import { notify } from './team';
import { addDaysKey, atISTKey, dayEndOfKey, dayStartOfKey, istDateKey, istMinutes, isWorkingDayKey } from './workcalendar';

// Say/Do: commit to today's tasks by 9:30 AM, the list locks at 11:00 AM, the day closes itself at 6:00 PM.
// A task counts as done if it was handed in (or delivered) that day before 6:00 PM.
// A working day where someone clocked in but made no plan counts as one missed commitment.
// Missed items need a reason before the next plan can be committed.

export const PLAN_LATE_AFTER = 9 * 60 + 30;
export const PLAN_LOCKS_AT = 11 * 60;
export const DAY_CLOSES_AT = 18 * 60;
export const MAX_ITEMS = 12;

const DONE_EVENTS = ['HANDED_IN', 'SENT_TO_CLIENT', 'RELEASED'];

export function planWindow(now = new Date()) {
  const dateKey = istDateKey(now);
  const minutes = istMinutes(now);
  return {
    dateKey,
    working: isWorkingDayKey(dateKey),
    minutes,
    open: minutes < PLAN_LOCKS_AT,
    late: minutes > PLAN_LATE_AFTER,
    closed: minutes >= DAY_CLOSES_AT,
  };
}

export async function clockedInOn(db: Db, userId: string, dateKey: string) {
  const log = await db.attendanceLog.findFirst({ where: { userId, type: 'CLOCK_IN', at: { gte: dayStartOfKey(dateKey), lte: dayEndOfKey(dateKey) } }, select: { id: true } });
  return !!log;
}

export async function pendingReasons(db: Db, userId: string, beforeKey: string) {
  return db.dailyPlanItem.findMany({
    where: { outcome: 'MISSED', reason: null, plan: { userId, dateKey: { lt: beforeKey, gte: addDaysKey(beforeKey, -14) }, closedAt: { not: null } } },
    include: { plan: { select: { dateKey: true } } },
    orderBy: { plan: { dateKey: 'asc' } },
  });
}

/** Tasks that were handed in or delivered between two moments. */
async function doneTaskIds(db: Db, taskIds: string[], from: Date, to: Date) {
  if (!taskIds.length) return new Set<string>();
  const events = await db.taskEvent.findMany({ where: { taskId: { in: taskIds }, type: { in: DONE_EVENTS }, createdAt: { gte: from, lte: to } }, select: { taskId: true } });
  return new Set(events.map((e) => e.taskId));
}

/** Live progress of a plan, for today's screen. */
export async function planProgress(db: Db, plan: { dateKey: string; items: { id: string; taskId: string | null; outcome: string }[] }, now = new Date()) {
  const ids = plan.items.map((i) => i.taskId).filter((x): x is string => !!x);
  const to = new Date(Math.min(now.getTime(), atISTKey(plan.dateKey, 18).getTime()));
  const done = await doneTaskIds(db, ids, dayStartOfKey(plan.dateKey), to);
  return plan.items.map((i) => ({ id: i.id, done: i.outcome === 'DONE' || (i.outcome === 'PENDING' && !!i.taskId && done.has(i.taskId)) }));
}

export async function commitPlan(db: Db, user: { id: string; name: string }, taskIds: string[], now = new Date()) {
  const w = planWindow(now);
  if (!w.working) throw new FlowError('Today is a weekly off. No plan needed.');
  if (!w.open) throw new FlowError('Plans lock at 11:00 AM. Today counts as a day without a plan.');
  if (!(await clockedInOn(db, user.id, w.dateKey))) throw new FlowError('Clock in first, then commit your plan.');
  const reasons = await pendingReasons(db, user.id, w.dateKey);
  if (reasons.length) throw new FlowError(`Give a reason for ${reasons.length} unfinished item${reasons.length === 1 ? '' : 's'} from your last plan first.`);

  const ids = Array.from(new Set(taskIds.filter(Boolean)));
  if (!ids.length) throw new FlowError('Pick at least one task you will hand in today.', 400);
  const existing = await db.dailyPlan.findUnique({ where: { userId_dateKey: { userId: user.id, dateKey: w.dateKey } }, include: { items: true } });
  if (existing?.closedAt || existing?.noPlan) throw new FlowError('Today’s plan is already closed.');
  const already = new Set(existing?.items.map((i) => i.taskId) ?? []);
  const fresh = ids.filter((id) => !already.has(id));
  if ((existing?.items.length ?? 0) + fresh.length > MAX_ITEMS) throw new FlowError(`Keep the plan to ${MAX_ITEMS} tasks or fewer. A plan you can’t finish isn’t a plan.`, 400);

  const tasks = await db.task.findMany({ where: { id: { in: fresh }, ownerId: user.id }, select: { id: true, desc: true, status: true } });
  if (tasks.length !== fresh.length) throw new FlowError('You can only commit to your own tasks.', 403);
  const handed = tasks.filter((t) => !['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(t.status));
  if (handed.length) throw new FlowError(`"${handed[0].desc}" is already handed in. Commit to work that is still open.`, 400);

  const plan = existing ?? await db.dailyPlan.create({ data: { userId: user.id, dateKey: w.dateKey, committedAt: now, late: w.late } });
  if (tasks.length) await db.dailyPlanItem.createMany({ data: tasks.map((t) => ({ planId: plan.id, taskId: t.id, title: t.desc })) });
  return db.dailyPlan.findUnique({ where: { id: plan.id }, include: { items: true } });
}

export async function giveReasons(db: Db, userId: string, reasons: { itemId: string; reason: string }[]) {
  let saved = 0;
  for (const r of reasons) {
    const text = String(r.reason ?? '').trim();
    if (text.length < 3) continue;
    const item = await db.dailyPlanItem.findFirst({ where: { id: r.itemId, outcome: 'MISSED', plan: { userId } } });
    if (!item) continue;
    await db.dailyPlanItem.update({ where: { id: item.id }, data: { reason: text.slice(0, 500), reasonAt: new Date() } });
    saved++;
  }
  return saved;
}

/** Closes every open plan for a day and records no-plan days. Safe to run more than once. */
export async function closeDay(db: Db, dateKey: string, now = new Date()) {
  const closeAt = atISTKey(dateKey, 18);
  const plans = await db.dailyPlan.findMany({ where: { dateKey, closedAt: null }, include: { items: true } });
  let missedTotal = 0;
  for (const plan of plans) {
    const ids = plan.items.map((i) => i.taskId).filter((x): x is string => !!x);
    const done = await doneTaskIds(db, ids, dayStartOfKey(dateKey), closeAt);
    let missed = 0;
    for (const item of plan.items) {
      const ok = !!item.taskId && done.has(item.taskId);
      if (!ok) missed++;
      await db.dailyPlanItem.update({ where: { id: item.id }, data: { outcome: ok ? 'DONE' : 'MISSED' } });
    }
    await db.dailyPlan.update({ where: { id: plan.id }, data: { closedAt: now } });
    missedTotal += missed;
    if (missed) await notify(db, [plan.userId], 'Plan closed', `You finished ${plan.items.length - missed} of ${plan.items.length} committed task${plan.items.length === 1 ? '' : 's'}. Give a reason for the rest before your next plan.`);
  }

  // No-plan days: clocked in, carries a Say/Do target, but committed nothing.
  let noPlan = 0;
  if (isWorkingDayKey(dateKey)) {
    const people = await db.kpiTarget.findMany({ where: { metric: 'say_do', active: true, user: { active: true } }, select: { userId: true } });
    for (const { userId } of people) {
      const has = await db.dailyPlan.findUnique({ where: { userId_dateKey: { userId, dateKey } }, select: { id: true } });
      if (has) continue;
      if (!(await clockedInOn(db, userId, dateKey))) continue;
      await db.dailyPlan.create({ data: { userId, dateKey, noPlan: true, committedAt: closeAt, closedAt: now } });
      noPlan++;
    }
  }
  return { plans: plans.length, missed: missedTotal, noPlan };
}

/** Say/Do between two date keys (inclusive), counting only closed days. */
export async function sayDoStats(db: Db, userId: string, fromKey: string, toKey: string) {
  const plans = await db.dailyPlan.findMany({ where: { userId, dateKey: { gte: fromKey, lte: toKey }, closedAt: { not: null } }, include: { items: { select: { outcome: true } } }, orderBy: { dateKey: 'asc' } });
  let committed = 0; let done = 0; let noPlanDays = 0;
  for (const p of plans) {
    if (p.noPlan) { noPlanDays++; continue; }
    committed += p.items.length;
    done += p.items.filter((i) => i.outcome === 'DONE').length;
  }
  const denominator = committed + noPlanDays;
  return { committed, done, noPlanDays, days: plans.length, ratio: denominator ? Math.round((done / denominator) * 1000) / 10 : null, plans };
}
