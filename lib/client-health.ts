import { ClientHealth } from '@prisma/client';
import type { Db } from './db';
import { isPastDue } from './workcalendar';

// Client health is rated from signals, never opinion.
//
//   Overdue client work (not delivered, past its due date) ... -15 each
//   Blocked and overdue ...................................... -20 each
//   Blocked, not yet due ..................................... -5 each
//   Error that reached the client (last 30 days) ............. -30 each
//   Client complaint (last 30 days) .......................... -30 each
//   Client-reported website bug (last 30 days) ............... -15 each
//   Invoice unpaid past due (1-15 days / 16+ days) ........... -10 / -20 each
//
// Score starts at 100. GREEN 75+, AMBER 50-74, RED below 50.
// Work that is simply scheduled for later does not reduce the score.

export type HealthIssue = {
  id: string;
  kind: 'TASK' | 'INCIDENT' | 'INVOICE';
  taskId: string | null;
  task: string;
  ownerId: string | null;
  ownerName: string;
  ownerRole: string;
  status: string;
  due: Date;
  reason: string;
  deduction: number;
};

export type ClientHealthBreakdown = {
  score: number;
  health: ClientHealth;
  issues: HealthIssue[];
  byOwner: Record<string, { ownerId: string | null; ownerName: string; ownerRole: string; deduction: number; issues: HealthIssue[] }>;
};

export const INCIDENT_LABEL: Record<string, string> = {
  ERROR: 'Error reached the client',
  COMPLAINT: 'Client complaint',
  BUG: 'Client-reported bug',
};

const INCIDENT_POINTS: Record<string, number> = { ERROR: 30, COMPLAINT: 30, BUG: 15 };

export function healthFromScore(score: number) {
  return score >= 75 ? ClientHealth.GREEN : score >= 50 ? ClientHealth.AMBER : ClientHealth.RED;
}

export async function getClientHealthBreakdown(db: Db, clientId: string, now = new Date()): Promise<ClientHealthBreakdown> {
  const since = new Date(now.getTime() - 30 * 86400000);
  const [tasks, incidents, invoices] = await Promise.all([
    db.task.findMany({
      where: { clientId, status: { notIn: ['CLIENT', 'DONE'] } },
      include: { owner: { select: { id: true, name: true, role: true } } },
      orderBy: { due: 'asc' },
    }),
    db.incident.findMany({ where: { clientId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } }),
    db.invoice.findMany({ where: { clientId, status: { not: 'DRAFT' } }, select: { id: true, number: true, amount: true, paid: true, dueDate: true } }),
  ]);

  const owners = new Map<string, { name: string; role: string }>();
  const ownerIds = Array.from(new Set(incidents.map((i) => i.ownerId).filter((x): x is string => !!x)));
  if (ownerIds.length) {
    for (const u of await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, role: true } })) owners.set(u.id, { name: u.name, role: u.role });
  }

  const issues: HealthIssue[] = [];
  for (const t of tasks) {
    const late = isPastDue(t.due, now);
    let deduction = 0;
    let reason = '';
    if (t.status === 'BLOCKED') { deduction = late ? 20 : 5; reason = late ? 'Blocked and overdue' : 'Blocked by another task'; }
    else if (late) { deduction = 15; reason = 'Overdue'; }
    if (!deduction) continue;
    issues.push({ id: `task-${t.id}`, kind: 'TASK', taskId: t.id, task: t.desc, ownerId: t.owner.id, ownerName: t.owner.name, ownerRole: t.owner.role, status: String(t.status), due: t.due, reason, deduction });
  }
  for (const i of incidents) {
    const o = i.ownerId ? owners.get(i.ownerId) : undefined;
    issues.push({ id: `incident-${i.id}`, kind: 'INCIDENT', taskId: i.taskId, task: i.description, ownerId: i.ownerId, ownerName: o?.name ?? 'Account', ownerRole: o?.role ?? '—', status: i.type, due: i.createdAt, reason: INCIDENT_LABEL[i.type] ?? 'Incident', deduction: INCIDENT_POINTS[i.type] ?? 15 });
  }
  for (const inv of invoices) {
    if (inv.amount <= inv.paid || !isPastDue(inv.dueDate, now)) continue;
    const days = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000);
    issues.push({ id: `invoice-${inv.id}`, kind: 'INVOICE', taskId: null, task: `Invoice ${inv.number} unpaid`, ownerId: null, ownerName: 'Collections', ownerRole: 'MD', status: 'OVERDUE', due: inv.dueDate, reason: days > 15 ? 'Payment overdue 16+ days' : 'Payment overdue', deduction: days > 15 ? 20 : 10 });
  }

  issues.sort((a, b) => b.deduction - a.deduction);
  const score = Math.max(0, 100 - issues.reduce((sum, x) => sum + x.deduction, 0));
  const byOwner: ClientHealthBreakdown['byOwner'] = {};
  for (const issue of issues) {
    if (issue.kind === 'INVOICE') continue;
    const key = issue.ownerId ?? 'unassigned';
    byOwner[key] ??= { ownerId: issue.ownerId, ownerName: issue.ownerName, ownerRole: issue.ownerRole, deduction: 0, issues: [] };
    byOwner[key].deduction += issue.deduction;
    byOwner[key].issues.push(issue);
  }
  return { score, health: healthFromScore(score), issues, byOwner };
}

export async function recalculateClientHealth(db: Db, clientId: string) {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { internal: true } });
  if (!client || client.internal) return client;
  const breakdown = await getClientHealthBreakdown(db, clientId);
  return db.client.update({ where: { id: clientId }, data: { healthScore: breakdown.score, health: breakdown.health } });
}
