import type { Db } from './db';
import { countWorkingDays, monthBoundsIST } from './workcalendar';

/** Hours in a working day, used to turn a monthly salary into an hourly cost. Change here if your day is longer. */
export const HOURS_PER_DAY = 8;

export type ProfitInput = {
  clients: { id: string; name: string; retainer: number; internal: boolean }[];
  people: { id: string; name: string; monthlySalary: number }[];
  entries: { userId: string; clientId: string; seconds: number }[];
  expenses: { clientId: string | null; amount: number }[];
  workingDays: number;
  workingDaysSoFar: number;
};

export type ClientProfit = { id: string; name: string; revenue: number; hours: number; labour: number; expenses: number; profit: number; margin: number | null; people: { name: string; hours: number }[] };

/** Pure calculation, so it can be tested without a database. */
export function computeProfitability(input: ProfitInput) {
  const hourlyCost = new Map(input.people.map((p) => [p.id, input.workingDays > 0 ? p.monthlySalary / (input.workingDays * HOURS_PER_DAY) : 0]));
  const nameOf = new Map(input.people.map((p) => [p.id, p.name]));
  const byClient = new Map<string, ClientProfit>();
  for (const c of input.clients) byClient.set(c.id, { id: c.id, name: c.name, revenue: c.internal ? 0 : c.retainer, hours: 0, labour: 0, expenses: 0, profit: 0, margin: null, people: [] });

  const personHours = new Map<string, number>();
  const clientPersonHours = new Map<string, Map<string, number>>();
  for (const e of input.entries) {
    const hours = e.seconds / 3600;
    personHours.set(e.userId, (personHours.get(e.userId) ?? 0) + hours);
    const row = byClient.get(e.clientId);
    if (!row) continue;
    row.hours += hours;
    row.labour += hours * (hourlyCost.get(e.userId) ?? 0);
    const m = clientPersonHours.get(e.clientId) ?? new Map<string, number>();
    m.set(e.userId, (m.get(e.userId) ?? 0) + hours);
    clientPersonHours.set(e.clientId, m);
  }
  for (const x of input.expenses) { const row = x.clientId ? byClient.get(x.clientId) : undefined; if (row) row.expenses += x.amount; }

  const internalIds = new Set(input.clients.filter((c) => c.internal).map((c) => c.id));
  const rows = [...byClient.values()].map((r) => {
    const profit = r.revenue - r.labour - r.expenses;
    const people = [...(clientPersonHours.get(r.id)?.entries() ?? [])].map(([id, h]) => ({ name: nameOf.get(id) ?? 'Former member', hours: h })).sort((a, b) => b.hours - a.hours);
    return { ...r, profit, margin: r.revenue > 0 ? (profit / r.revenue) * 100 : null, people };
  });
  const clientRows = rows.filter((r) => !internalIds.has(r.id)).sort((a, b) => (a.margin ?? -Infinity) - (b.margin ?? -Infinity));
  const internal = rows.filter((r) => internalIds.has(r.id));

  const salaryTotal = input.people.reduce((s, p) => s + p.monthlySalary, 0);
  const allocated = rows.reduce((s, r) => s + r.labour, 0);
  const expectedHours = input.workingDaysSoFar * HOURS_PER_DAY;
  const coverage = input.people.filter((p) => p.monthlySalary > 0).map((p) => {
    const logged = personHours.get(p.id) ?? 0;
    return { id: p.id, name: p.name, logged, expected: expectedHours, pct: expectedHours > 0 ? Math.min(100, (logged / expectedHours) * 100) : null, hourlyCost: hourlyCost.get(p.id) ?? 0 };
  }).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));

  const revenue = clientRows.reduce((s, r) => s + r.revenue, 0);
  const clientCosts = clientRows.reduce((s, r) => s + r.labour + r.expenses, 0);
  return {
    clients: clientRows, internal, coverage,
    totals: { revenue, clientCosts, clientProfit: revenue - clientCosts, salaryTotal, allocated, unallocated: Math.max(0, salaryTotal - allocated) },
  };
}

/** Loads one month from the database and runs the calculation. Salaries are read, so call this for the MD only. */
export async function loadProfitability(db: Db, monthKey: string, now = new Date()) {
  const { start, end } = monthBoundsIST(monthKey);
  const soFarEnd = now < end ? now : end;
  const [clients, people, entries, expenses] = await Promise.all([
    db.client.findMany({ where: { OR: [{ active: true }, { tasks: { some: { timeEntries: { some: { startedAt: { gte: start, lte: end } } } } } }] }, select: { id: true, name: true, retainer: true, internal: true, active: true } }),
    db.user.findMany({ where: { active: true }, omit: { monthlySalary: false } }).then((us) => us.map((x) => ({ id: x.id, name: x.name, monthlySalary: x.monthlySalary }))),
    db.timeEntry.findMany({ where: { startedAt: { gte: start, lte: end }, taskId: { not: null } }, select: { userId: true, seconds: true, task: { select: { clientId: true } } } }),
    db.expense.findMany({ where: { date: { gte: start, lte: end }, clientId: { not: null } }, select: { clientId: true, amount: true } }),
  ]);
  return computeProfitability({
    clients: clients.map((c) => ({ id: c.id, name: c.name, retainer: c.active ? c.retainer : 0, internal: c.internal })),
    people,
    entries: entries.filter((e) => e.task).map((e) => ({ userId: e.userId, clientId: e.task!.clientId, seconds: e.seconds })),
    expenses,
    workingDays: countWorkingDays(start, end),
    workingDaysSoFar: now < start ? 0 : countWorkingDays(start, soFarEnd),
  });
}
