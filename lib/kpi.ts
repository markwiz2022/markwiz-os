import type { KpiTarget } from '@prisma/client';
import type { Db } from './db';
import { getClientHealthBreakdown } from './client-health';
import { sayDoStats } from './saydo';
import { mdUsers, notify, tenureDay } from './team';
import {
  addDaysKey, dayEndOfKey, dayStartOfKey, dueEnd, istDateKey, istMinutes, isWorkingDayKey, lastDayOfMonth,
  monthKeyOffset, monthLabel, workingDaysBetweenKeys,
} from './workcalendar';

// ---------------------------------------------------------------------------
// Every number here is calculated from what happens in the app. Nobody rates their own work.
//
// Rating rules
//   Percentages (at least):   target met = GREEN, within 10 points = AMBER, else RED
//   Counts with a pace (touches, meetings, proposals, closes): compared with the pace for the
//     working days so far. 100% of pace = GREEN, 75% = AMBER, else RED. Too early to call = no rating.
//   Zero targets (errors, Red clients): 0 = GREEN, 1 = AMBER, 2+ = RED
//   Other "at most" targets: met = GREEN, up to 25% over = AMBER, else RED
//
// Month rating: 2 or more RED KPIs = RED month. No RED and at most one AMBER = GREEN month.
// Anything else is AMBER. Two RED months in a row raise a PIP flag; three GREEN months a bonus flag.
// ---------------------------------------------------------------------------

export type Rating = 'GREEN' | 'AMBER' | 'RED' | 'NONE';
export type Per = 'day' | 'week' | 'month' | 'quarter';
export type Window = { startKey: string; endKey: string };

type Ctx = { db: Db; userId: string; win: Window; now: Date; memo: Map<string, Promise<unknown>> };
type Result = { value: number | null; detail?: string };

export type MetricDef = {
  key: string;
  label: string;
  unit: '%' | 'count' | 'avg';
  direction: 'atLeast' | 'atMost' | 'below';
  per?: Per;
  company?: boolean;
  manual?: boolean;
  halfBaseline?: boolean;
  how: string;
  compute?: (c: Ctx) => Promise<Result>;
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

function winBounds(win: Window, now: Date) {
  const start = dayStartOfKey(win.startKey);
  const end = new Date(Math.min(dayEndOfKey(win.endKey).getTime(), now.getTime()));
  return { start, end, dueStart: dayStartOfKey(win.startKey), dueEnd: dayEndOfKey(win.endKey) };
}

function memo<T>(c: Ctx, key: string, fn: () => Promise<T>): Promise<T> {
  if (!c.memo.has(key)) c.memo.set(key, fn());
  return c.memo.get(key) as Promise<T>;
}

async function onTime(c: Ctx, where: Record<string, unknown>, stamp: 'firstSubmittedAt' | 'deliveredAt') {
  const { dueStart, dueEnd: windowDueEnd } = winBounds(c.win, c.now);
  const tasks = await c.db.task.findMany({ where: { ...where, due: { gte: dueStart, lte: windowDueEnd } }, select: { due: true, firstSubmittedAt: true, deliveredAt: true } });
  let on = 0; let late = 0;
  for (const t of tasks) {
    const end = dueEnd(t.due);
    const at = t[stamp];
    if (at) { if (at.getTime() <= end.getTime()) on++; else late++; }
    else if (c.now.getTime() > end.getTime()) late++;
  }
  return { value: pct(on, on + late), detail: on + late ? `${on} of ${on + late} on time` : 'Nothing due yet' };
}

const STAGE_ORDER = ['NEW', 'QUALIFIED', 'MEETING', 'PROPOSAL', 'NEGOTIATION', 'WON'];

/** Leads that reached a stage (or later) for the first time inside the window. */
async function stageReached(c: Ctx, stage: string, mine: boolean) {
  const idx = STAGE_ORDER.indexOf(stage);
  const acts = await memo(c, 'stage-acts', () => c.db.leadActivity.findMany({
    where: { type: 'STAGE_CHANGE' },
    select: { leadId: true, toStage: true, note: true, createdAt: true, lead: { select: { ownerId: true } } },
    orderBy: { createdAt: 'asc' },
  }));
  const first = new Map<string, { at: Date; ownerId: string | null }>();
  for (const a of acts) {
    const to = a.toStage ?? (a.note?.match(/Moved to (\w+)/)?.[1] ?? null);
    if (!to || STAGE_ORDER.indexOf(to) < idx) continue;
    if (!first.has(a.leadId)) first.set(a.leadId, { at: a.createdAt, ownerId: a.lead.ownerId });
  }
  const { start, end } = winBounds(c.win, c.now);
  let n = 0;
  for (const f of first.values()) {
    if (mine && f.ownerId !== c.userId) continue;
    if (f.at >= start && f.at <= end) n++;
  }
  return { value: n };
}

async function redClientsNow(c: Ctx) {
  return memo(c, 'red-now', async () => {
    const clients = await c.db.client.findMany({ where: { active: true, internal: false }, select: { id: true } });
    let red = 0;
    for (const cl of clients) if ((await getClientHealthBreakdown(c.db, cl.id, c.now)).health === 'RED') red++;
    return red;
  });
}

/** Tasks and approvals waiting on the MD right now. */
export async function mdWaitingCount(db: Db) {
  const mds = await mdUsers(db);
  if (!mds.length) return 0;
  const mdIds = mds.map((m) => m.id);
  const dmmCount = await db.user.count({ where: { active: true, role: 'DMM' } });
  const [own, releases, leave, regs] = await Promise.all([
    db.task.count({ where: { ownerId: { in: mdIds }, status: { notIn: ['CLIENT', 'DONE'] } } }),
    db.task.count({ where: { status: 'APPROVAL', OR: [{ approvalLevel: 'L2' }, ...(dmmCount ? [] : [{ approvalLevel: 'L1' }])] } }),
    db.leaveRequest.count({ where: { status: 'PENDING' } }),
    db.regularisationRequest.count({ where: { status: 'PENDING' } }),
  ]);
  return own + releases + leave + regs;
}

export async function redClientCount(db: Db, now = new Date()) {
  const clients = await db.client.findMany({ where: { active: true, internal: false }, select: { id: true } });
  let red = 0;
  for (const cl of clients) if ((await getClientHealthBreakdown(db, cl.id, now)).health === 'RED') red++;
  return red;
}

export async function mdWaitingBaseline(db: Db) {
  const first = await db.metricSnapshot.findMany({ where: { metric: 'md_waiting' }, orderBy: { dateKey: 'asc' }, take: 10 });
  if (first.length < 10) return { baseline: null as number | null, days: first.length };
  return { baseline: first.reduce((s, x) => s + x.value, 0) / first.length, days: first.length };
}

export const METRICS: Record<string, MetricDef> = {
  on_time_handin: {
    key: 'on_time_handin', label: 'Handed in on time', unit: '%', direction: 'atLeast',
    how: 'Your tasks due in the period that were handed in by the end of their due date.',
    compute: (c) => onTime(c, { ownerId: c.userId }, 'firstSubmittedAt'),
  },
  client_on_time: {
    key: 'client_on_time', label: 'Client work delivered on time', unit: '%', direction: 'atLeast', company: true,
    how: 'Client deliverables due in the period that reached the client by their due date.',
    compute: (c) => onTime(c, { clientFacing: true, client: { internal: false } }, 'deliveredAt'),
  },
  reports_on_time: {
    key: 'reports_on_time', label: 'Client reports out on time', unit: '%', direction: 'atLeast', company: true,
    how: 'Client reports due in the period that went out by their due date. Set report scopes to the 5th.',
    compute: (c) => onTime(c, { category: 'REPORT', clientFacing: true, client: { internal: false } }, 'deliveredAt'),
  },
  errors_own: {
    key: 'errors_own', label: 'Errors that reached a client', unit: 'count', direction: 'atMost',
    how: 'Errors logged against your work after it reached the client.',
    compute: async (c) => { const { start, end } = winBounds(c.win, c.now); return { value: await c.db.incident.count({ where: { type: 'ERROR', ownerId: c.userId, createdAt: { gte: start, lte: end } } }) }; },
  },
  errors_all: {
    key: 'errors_all', label: 'Errors that reached clients', unit: 'count', direction: 'atMost', company: true,
    how: 'Every error logged after work reached a client, whoever made it. The proof check owns this.',
    compute: async (c) => { const { start, end } = winBounds(c.win, c.now); return { value: await c.db.incident.count({ where: { type: 'ERROR', createdAt: { gte: start, lte: end } } }) }; },
  },
  red_clients: {
    key: 'red_clients', label: 'Red clients', unit: 'count', direction: 'atMost', company: true,
    how: 'The highest number of Red clients on any working day in the period (checked every evening).',
    compute: async (c) => {
      const snaps = await c.db.metricSnapshot.findMany({ where: { metric: 'red_clients', dateKey: { gte: c.win.startKey, lte: c.win.endKey } } });
      const includesToday = istDateKey(c.now) <= c.win.endKey && istDateKey(c.now) >= c.win.startKey;
      const values = snaps.map((s) => s.value);
      if (includesToday) values.push(await redClientsNow(c));
      if (!values.length) return { value: null, detail: 'No daily checks recorded' };
      return { value: Math.max(...values), detail: `Checked on ${values.length} day${values.length === 1 ? '' : 's'}` };
    },
  },
  ad_accounts: {
    key: 'ad_accounts', label: 'Ad accounts on target', unit: '%', direction: 'atLeast', company: true, manual: true,
    how: 'Share of ad accounts that hit their agreed target. The MD enters it each month from the ad platforms.',
  },
  first_review: {
    key: 'first_review', label: 'Approved at first internal review', unit: '%', direction: 'atLeast',
    how: 'Your work that passed the proof check and review without being sent back.',
    compute: async (c) => {
      const { start, end } = winBounds(c.win, c.now);
      const tasks = await c.db.task.findMany({ where: { ownerId: c.userId, deliveredAt: { gte: start, lte: end }, OR: [{ needsProof: true }, { approvalLevel: { not: 'L0' } }] }, select: { id: true, deliveredAt: true } });
      if (!tasks.length) return { value: null, detail: 'Nothing reviewed yet' };
      const returns = await c.db.taskEvent.findMany({ where: { taskId: { in: tasks.map((t) => t.id) }, type: { in: ['PROOF_RETURNED', 'REVIEW_RETURNED'] } }, select: { taskId: true, createdAt: true } });
      const clean = tasks.filter((t) => !returns.some((r) => r.taskId === t.id && r.createdAt < t.deliveredAt!)).length;
      return { value: pct(clean, tasks.length), detail: `${clean} of ${tasks.length} first time` };
    },
  },
  revision_rounds: {
    key: 'revision_rounds', label: 'Revision rounds per asset', unit: 'avg', direction: 'below',
    how: 'Average number of times each finished asset was sent back, by the proof check, review or the client.',
    compute: async (c) => {
      const { start, end } = winBounds(c.win, c.now);
      const tasks = await c.db.task.findMany({ where: { ownerId: c.userId, completedAt: { gte: start, lte: end }, OR: [{ needsProof: true }, { approvalLevel: { not: 'L0' } }, { clientFacing: true }] }, select: { internalReturns: true, clientReturns: true } });
      if (!tasks.length) return { value: null, detail: 'Nothing finished yet' };
      const total = tasks.reduce((s, t) => s + t.internalReturns + t.clientReturns, 0);
      return { value: Math.round((total / tasks.length) * 10) / 10, detail: `${total} rounds over ${tasks.length} asset${tasks.length === 1 ? '' : 's'}` };
    },
  },
  say_do: {
    key: 'say_do', label: 'Say/Do', unit: '%', direction: 'atLeast',
    how: 'Committed tasks handed in the same day by 6 PM. A working day without a plan counts as one miss.',
    compute: async (c) => {
      const s = await sayDoStats(c.db, c.userId, c.win.startKey, c.win.endKey);
      return { value: s.ratio, detail: s.days ? `${s.done} of ${s.committed} done${s.noPlanDays ? ` · ${s.noPlanDays} day${s.noPlanDays === 1 ? '' : 's'} without a plan` : ''}` : 'No closed days yet' };
    },
  },
  touches: {
    key: 'touches', label: 'Outreach touches', unit: 'count', direction: 'atLeast', per: 'day',
    how: 'Calls, WhatsApps, emails and LinkedIn messages logged in the CRM.',
    compute: async (c) => {
      const { start, end } = winBounds(c.win, c.now);
      const agg = await c.db.outreachLog.aggregate({ where: { userId: c.userId, createdAt: { gte: start, lte: end } }, _sum: { count: true } });
      return { value: agg._sum.count ?? 0 };
    },
  },
  meetings: {
    key: 'meetings', label: 'Qualified meetings', unit: 'count', direction: 'atLeast', per: 'week',
    how: 'Your leads moved to the Meeting stage for the first time.',
    compute: (c) => stageReached(c, 'MEETING', true),
  },
  meetings_month: {
    key: 'meetings_month', label: 'Qualified meetings', unit: 'count', direction: 'atLeast', per: 'month',
    how: 'Your leads moved to the Meeting stage for the first time.',
    compute: (c) => stageReached(c, 'MEETING', true),
  },
  proposals: {
    key: 'proposals', label: 'Proposals sent', unit: 'count', direction: 'atLeast', per: 'month',
    how: 'Your leads moved to the Proposal stage for the first time.',
    compute: (c) => stageReached(c, 'PROPOSAL', true),
  },
  closes: {
    key: 'closes', label: 'Clients closed', unit: 'count', direction: 'atLeast', per: 'month',
    how: 'Your leads moved to Won.',
    compute: (c) => stageReached(c, 'WON', true),
  },
  closes_quarter: {
    key: 'closes_quarter', label: 'New clients this quarter', unit: 'count', direction: 'atLeast', per: 'quarter',
    how: 'Your leads moved to Won in the quarter. Rated at the end of each quarter.',
    compute: (c) => stageReached(c, 'WON', true),
  },
  company_closes: {
    key: 'company_closes', label: 'New retainers signed', unit: 'count', direction: 'atLeast', per: 'month', company: true,
    how: 'Leads moved to Won across the company.',
    compute: (c) => stageReached(c, 'WON', false),
  },
  collections: {
    key: 'collections', label: 'Invoices collected', unit: '%', direction: 'atLeast', company: true,
    how: 'Invoice value that fell due in the period and has been paid. Measured at month end for closed months.',
    compute: async (c) => {
      const { dueStart, dueEnd: last } = winBounds(c.win, c.now);
      const invoices = await c.db.invoice.findMany({ where: { status: { not: 'DRAFT' }, dueDate: { gte: dueStart, lte: new Date(Math.min(last.getTime(), c.now.getTime())) } }, select: { amount: true, paid: true } });
      const due = invoices.reduce((s, i) => s + i.amount, 0);
      const paid = invoices.reduce((s, i) => s + Math.min(i.paid, i.amount), 0);
      return { value: pct(paid, due), detail: invoices.length ? `${invoices.length} invoice${invoices.length === 1 ? '' : 's'} due` : 'No invoices due yet' };
    },
  },
  md_waiting: {
    key: 'md_waiting', label: 'Tasks and approvals waiting on you', unit: 'avg', direction: 'atMost', company: true, halfBaseline: true,
    how: 'Average daily count at 6 PM of your own open tasks, reviews only you can release, and leave and attendance approvals. Target: half of your first 10 working days.',
    compute: async (c) => {
      const snaps = await c.db.metricSnapshot.findMany({ where: { metric: 'md_waiting', dateKey: { gte: c.win.startKey, lte: c.win.endKey } } });
      const values = snaps.map((s) => s.value);
      const today = istDateKey(c.now);
      if (today >= c.win.startKey && today <= c.win.endKey && !snaps.some((s) => s.dateKey === today)) values.push(await memo(c, 'md-waiting-now', () => mdWaitingCount(c.db)));
      if (!values.length) return { value: null };
      return { value: Math.round((values.reduce((s, x) => s + x, 0) / values.length) * 10) / 10, detail: `Average over ${values.length} day${values.length === 1 ? '' : 's'}` };
    },
  },
  qa_pass: {
    key: 'qa_pass', label: 'QA checklist passed before handover', unit: '%', direction: 'atLeast',
    how: 'Website hand-ins with every QA item ticked. The app blocks hand-in otherwise, so anything below 100% means an override.',
    compute: async (c) => {
      const { start, end } = winBounds(c.win, c.now);
      const tasks = await c.db.task.findMany({ where: { ownerId: c.userId, category: 'WEB', firstSubmittedAt: { gte: start, lte: end } }, select: { checklist: true } });
      if (!tasks.length) return { value: null, detail: 'No website hand-ins yet' };
      const pass = tasks.filter((t) => Array.isArray(t.checklist) && (t.checklist as { done?: boolean }[]).every((x) => x?.done)).length;
      return { value: pct(pass, tasks.length), detail: `${pass} of ${tasks.length}` };
    },
  },
  bugs_after_launch: {
    key: 'bugs_after_launch', label: 'Client-reported bugs after launch', unit: 'count', direction: 'atMost',
    how: 'The most bugs a client reported on any one of your sites in its first 14 days live.',
    compute: async (c) => {
      const { start, end } = winBounds(c.win, c.now);
      const sites = await c.db.task.findMany({ where: { ownerId: c.userId, category: 'WEB', deliveredAt: { gte: new Date(start.getTime() - 14 * 86400000), lte: end } }, select: { id: true, deliveredAt: true } });
      if (!sites.length) return { value: null, detail: 'No launches in the period' };
      const bugs = await c.db.incident.findMany({ where: { type: 'BUG', taskId: { in: sites.map((s) => s.id) }, createdAt: { gte: start, lte: end } }, select: { taskId: true, createdAt: true } });
      let worst = 0;
      for (const s of sites) worst = Math.max(worst, bugs.filter((b) => b.taskId === s.id && b.createdAt.getTime() <= s.deliveredAt!.getTime() + 14 * 86400000).length);
      return { value: worst, detail: `${sites.length} site${sites.length === 1 ? '' : 's'} live` };
    },
  },
  os_fix_speed: {
    key: 'os_fix_speed', label: 'Markwiz OS fixes within 2 working days', unit: '%', direction: 'atLeast',
    how: 'Markwiz OS fix tasks assigned to you that were handed in within 2 working days of being raised.',
    compute: async (c) => {
      const { start, end } = winBounds(c.win, c.now);
      const tasks = await c.db.task.findMany({ where: { ownerId: c.userId, category: 'SYSTEM', createdAt: { gte: start, lte: end } }, select: { createdAt: true, firstSubmittedAt: true } });
      const today = istDateKey(c.now);
      let ok = 0; let late = 0;
      for (const t of tasks) {
        const raised = istDateKey(t.createdAt);
        if (t.firstSubmittedAt) { if (workingDaysBetweenKeys(raised, istDateKey(t.firstSubmittedAt)) <= 2) ok++; else late++; }
        else if (workingDaysBetweenKeys(raised, today) > 2) late++;
      }
      return { value: pct(ok, ok + late), detail: ok + late ? `${ok} of ${ok + late} within 2 days` : 'No fixes due yet' };
    },
  },
};

// ---------------------------------------------------------------------------
// Windows, pace, targets and ratings
// ---------------------------------------------------------------------------

export function monthWindow(monthKey: string): Window {
  return { startKey: `${monthKey}-01`, endKey: `${monthKey}-${String(lastDayOfMonth(monthKey)).padStart(2, '0')}` };
}

export function quarterWindow(monthKey: string): Window & { lastMonth: string } {
  const [y, m] = monthKey.split('-').map(Number);
  const q0 = Math.floor((m - 1) / 3) * 3 + 1;
  const first = `${y}-${String(q0).padStart(2, '0')}`;
  const last = monthKeyOffset(first, 2);
  return { startKey: `${first}-01`, endKey: monthWindow(last).endKey, lastMonth: last };
}

function workingDaysIn(win: Window) {
  let n = 0; let k = win.startKey;
  while (k <= win.endKey) { if (isWorkingDayKey(k)) n++; k = addDaysKey(k, 1); }
  return n;
}

/** Working days of the window already finished (today counts once the day closes at 6 PM). */
function elapsedWorkingDays(win: Window, now: Date) {
  const today = istDateKey(now);
  if (today > win.endKey) return workingDaysIn(win);
  if (today < win.startKey) return 0;
  let n = 0; let k = win.startKey;
  while (k < today) { if (isWorkingDayKey(k)) n++; k = addDaysKey(k, 1); }
  if (isWorkingDayKey(today) && istMinutes(now) >= 18 * 60) n++;
  return n;
}

const DAYS_PER_WEEK = 5.5;

function expectedFor(def: MetricDef, target: number, win: Window, now: Date) {
  const elapsed = elapsedWorkingDays(win, now);
  const total = workingDaysIn(win) || 1;
  switch (def.per) {
    case 'day': return target * elapsed;
    case 'week': return (target * elapsed) / DAYS_PER_WEEK;
    case 'month': return (target * elapsed) / total;
    case 'quarter': return (target * elapsed) / total;
    default: return target;
  }
}

export function rate(def: MetricDef, value: number | null, target: number | null, expected: number | null, complete: boolean): Rating {
  if (value === null || target === null) return 'NONE';
  if (def.per && def.direction === 'atLeast') {
    // Month and quarter targets are totals: hitting the total early is green straight away.
    if ((def.per === 'month' || def.per === 'quarter') && value >= target) return 'GREEN';
    if (expected === null || expected <= 0) return 'NONE';
    if (value >= expected) return 'GREEN';
    if (!complete && expected < 1) return 'NONE';
    const r = value / expected;
    return r >= 0.75 ? 'AMBER' : 'RED';
  }
  if (def.direction === 'atLeast') {
    if (def.unit === '%') return value >= target ? 'GREEN' : value >= target - 10 ? 'AMBER' : 'RED';
    return value >= target ? 'GREEN' : value >= target * 0.75 ? 'AMBER' : 'RED';
  }
  if (def.direction === 'atMost') {
    if (target === 0) return value <= 0 ? 'GREEN' : value <= 1 ? 'AMBER' : 'RED';
    return value <= target ? 'GREEN' : value <= target * 1.25 ? 'AMBER' : 'RED';
  }
  return value < target ? 'GREEN' : value < target * 1.25 ? 'AMBER' : 'RED';
}

export function overallRating(ratings: Rating[]): Rating {
  const rated = ratings.filter((r) => r !== 'NONE');
  if (!rated.length) return 'NONE';
  const reds = rated.filter((r) => r === 'RED').length;
  const ambers = rated.filter((r) => r === 'AMBER').length;
  if (reds >= 2) return 'RED';
  if (reds === 0 && ambers <= 1) return 'GREEN';
  return 'AMBER';
}

type Ramp = { untilDay: number; target: number | null }[];

export function resolveTarget(t: Pick<KpiTarget, 'target' | 'ramp'>, joiningDate: Date | null, at: Date) {
  const ramp = (Array.isArray(t.ramp) ? t.ramp : []) as Ramp;
  const day = tenureDay(joiningDate, at);
  if (ramp.length && day !== null) {
    const step = [...ramp].sort((a, b) => a.untilDay - b.untilDay).find((r) => day <= r.untilDay);
    if (step) return { target: step.target, note: step.target === null ? `Not scored until day ${step.untilDay + 1}` : `Ramp target until day ${step.untilDay}` };
  }
  return { target: t.target, note: undefined as string | undefined };
}

export function formatValue(def: MetricDef, value: number | null) {
  if (value === null) return '—';
  if (def.unit === '%') return `${Math.round(value)}%`;
  if (def.unit === 'avg') return value.toFixed(1);
  return value.toLocaleString('en-IN');
}

export function formatTarget(def: MetricDef, target: number | null) {
  if (target === null) return 'Not set';
  if (def.per) return `${target} a ${def.per}`;
  if (def.direction === 'atMost') return target === 0 ? 'Zero' : `${target} or fewer`;
  if (def.direction === 'below') return `Under ${target}`;
  return def.unit === '%' ? `${target}%+` : `${target}+`;
}

export type ScoreRow = {
  metric: string; label: string; how: string; unit: string; per?: Per; company: boolean; manual: boolean;
  value: number | null; display: string; target: number | null; targetDisplay: string; targetNote?: string;
  expected: number | null; pace?: string; rating: Rating; detail?: string;
};

export type Scorecard = { userId: string; monthKey: string; label: string; complete: boolean; rows: ScoreRow[]; overall: Rating };

type Person = { id: string; joiningDate: Date | null };

/** Computes one KPI for a person over a window. Shared by scorecards and onboarding checkpoints. */
export async function computeMetric(db: Db, metric: string, userId: string, win: Window, now: Date, memoMap = new Map<string, Promise<unknown>>()) {
  const def = METRICS[metric];
  if (!def?.compute) return { value: null } as Result;
  return def.compute({ db, userId, win, now, memo: memoMap });
}

export async function computeScorecard(db: Db, person: Person, monthKey: string, now = new Date(), memoMap = new Map<string, Promise<unknown>>()): Promise<Scorecard> {
  const month = monthWindow(monthKey);
  const complete = now.getTime() > dayEndOfKey(month.endKey).getTime();
  const targets = await db.kpiTarget.findMany({ where: { userId: person.id, active: true }, orderBy: { sort: 'asc' } });
  const at = complete ? dayEndOfKey(month.endKey) : now;
  const rows: ScoreRow[] = [];
  for (const t of targets) {
    const def = METRICS[t.metric];
    if (!def) continue;
    const quarter = def.per === 'quarter' ? quarterWindow(monthKey) : null;
    const win = quarter ?? month;
    const winComplete = quarter ? now.getTime() > dayEndOfKey(quarter.endKey).getTime() : complete;
    let { target, note } = resolveTarget(t, person.joiningDate, at);
    let result: Result;
    if (def.manual) {
      const m = await db.manualKpiValue.findUnique({ where: { userId_metric_monthKey: { userId: person.id, metric: def.key, monthKey } } });
      result = { value: m?.value ?? null, detail: m ? (m.note || 'Entered by the MD') : 'Waiting for the MD to enter this month’s figure' };
    } else {
      const map = def.company ? memoMap : new Map<string, Promise<unknown>>();
      result = await def.compute!({ db, userId: person.id, win, now, memo: map });
    }
    if (def.halfBaseline && target === null) {
      const b = await mdWaitingBaseline(db);
      if (b.baseline !== null) { target = Math.max(1, Math.ceil(b.baseline / 2)); note = `Half of your first 10 days (${b.baseline.toFixed(1)})`; }
      else note = `Baseline builds over the first 10 working days (${b.days} so far)`;
    }
    const expected = def.per && target !== null ? expectedFor(def, target, win, now) : null;
    let rating = rate(def, result.value, target, expected, winComplete);
    if (quarter && !(winComplete || (complete && monthKey === quarter.lastMonth))) rating = 'NONE';
    let pace: string | undefined;
    if (def.per && result.value !== null) {
      const elapsed = elapsedWorkingDays(win, now);
      if (def.per === 'day' && elapsed) pace = `${(result.value / elapsed).toFixed(1)} a day`;
      else if (def.per === 'week' && elapsed) pace = `${((result.value / elapsed) * DAYS_PER_WEEK).toFixed(1)} a week`;
      else if (expected !== null && !winComplete) pace = `${expected.toFixed(1)} needed by now`;
    }
    rows.push({
      metric: def.key, label: def.label, how: def.how, unit: def.unit, per: def.per, company: !!def.company, manual: !!def.manual,
      value: result.value, display: formatValue(def, result.value), target, targetDisplay: formatTarget(def, target), targetNote: note,
      expected, pace, rating, detail: result.detail,
    });
  }
  return { userId: person.id, monthKey, label: monthLabel(monthKey), complete, rows, overall: overallRating(rows.map((r) => r.rating)) };
}

/** Freezes last month's scorecards and raises PIP and bonus flags. Runs on the 1st. */
export async function closeMonth(db: Db, monthKey: string, now = new Date()) {
  const people = await db.user.findMany({ where: { active: true, kpiTargets: { some: { active: true } } }, select: { id: true, name: true, role: true, joiningDate: true } });
  const memoMap = new Map<string, Promise<unknown>>();
  let flags = 0;
  for (const p of people) {
    const card = await computeScorecard(db, p, monthKey, now, memoMap);
    const results = card.rows.map((r) => ({ metric: r.metric, label: r.label, value: r.value, display: r.display, target: r.target, targetDisplay: r.targetDisplay, rating: r.rating, detail: r.detail ?? null }));
    await db.scorecardMonth.upsert({ where: { userId_monthKey: { userId: p.id, monthKey } }, update: { overall: card.overall, results }, create: { userId: p.id, monthKey, overall: card.overall, results } });
    if (p.role !== 'MD') flags += await evaluateFlags(db, p);
  }
  return { people: people.length, flags };
}

export async function evaluateFlags(db: Db, person: { id: string; name: string }) {
  const months = await db.scorecardMonth.findMany({ where: { userId: person.id }, orderBy: { monthKey: 'desc' }, take: 3 });
  const consecutive = (n: number) => months.length >= n && months.slice(0, n).every((m, i) => i === 0 || monthKeyOffset(m.monthKey, 1) === months[i - 1].monthKey);
  const latest = months[0];
  if (!latest) return 0;
  const mds = (await mdUsers(db)).map((m) => m.id);
  let raised = 0;
  if (consecutive(2) && months.slice(0, 2).every((m) => m.overall === 'RED')) {
    const exists = await db.performanceFlag.findUnique({ where: { userId_type_monthKey: { userId: person.id, type: 'PIP', monthKey: latest.monthKey } } });
    if (!exists) {
      await db.performanceFlag.create({ data: { userId: person.id, type: 'PIP', monthKey: latest.monthKey, note: `Red scorecard in ${monthLabel(months[1].monthKey)} and ${monthLabel(latest.monthKey)}.` } });
      await notify(db, mds, 'PIP flag raised', `${person.name} has had two red months in a row (${monthLabel(months[1].monthKey)}, ${monthLabel(latest.monthKey)}). Open their scorecard to start the conversation.`);
      raised++;
    }
  }
  if (consecutive(3) && months.slice(0, 3).every((m) => m.overall === 'GREEN')) {
    const exists = await db.performanceFlag.findUnique({ where: { userId_type_monthKey: { userId: person.id, type: 'BONUS', monthKey: latest.monthKey } } });
    if (!exists) {
      await db.performanceFlag.create({ data: { userId: person.id, type: 'BONUS', monthKey: latest.monthKey, note: `Green scorecard for three months running, ending ${monthLabel(latest.monthKey)}.` } });
      await notify(db, mds, 'Bonus flag raised', `${person.name} has had three green months in a row. Worth recognising.`);
      raised++;
    }
  }
  return raised;
}
