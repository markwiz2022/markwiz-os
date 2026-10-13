import type { Db } from './db';
import { computeMetric, mdWaitingBaseline, METRICS } from './kpi';
import { mdUsers, notify } from './team';
import { addDaysKey, istDateKey, isWorkingDayKey, nextWorkingDayKey, prevWorkingDayKey, shortKeyLabel, taskDueFromKey } from './workcalendar';

// A new hire gets their plan and scorecard before day one. Plan items are real tasks with due dates,
// and each phase has a pass line decided in advance and checked by the system, not by the new hire.

type MetricCheck = { kind: 'metric'; metric: string; op: '>=' | '<=' | '<'; value: number | 'HALF_BASELINE'; fromDay: number; toDay: number; allowEmpty?: boolean };
type SpecialCheck = { kind: 'all_clients_scoped' } | { kind: 'tasks_done'; match: string; label: string };
type Check = MetricCheck | SpecialCheck;
type PlanTask = { phase: string; title: string; dueDay: number; perTopClient?: boolean };
type Checkpoint = { day: number; title: string; passLine: string; checks: Check[]; manual?: boolean };
type Plan = { tasks: PlanTask[]; checkpoints: Checkpoint[] };

const W1 = 'Week 1';
const P2 = 'Days 8 to 30';
const P3 = 'Days 31 to 60';
const P4 = 'Days 61 to 90';

export const PLANS: Record<string, Plan> = {
  DMM: {
    tasks: [
      { phase: W1, title: 'Read the handover notes and every client record in Markwiz OS', dueDay: 3 },
      { phase: W1, title: 'Intro call with every active client, together with Joseph', dueDay: 5 },
      { phase: W1, title: 'Audit each client’s scope against what is actually being delivered', dueDay: 5 },
      { phase: W1, title: 'Load every client’s recurring deliverables into Client scopes', dueDay: 7 },
      { phase: P2, title: 'Run daily allocation and a 10-minute stand-up from the Today screen', dueDay: 30 },
      { phase: P2, title: 'Own the proof check for every design and video', dueDay: 30 },
      { phase: P2, title: 'Send every client deliverable yourself', dueDay: 30 },
      { phase: P2, title: 'Run the Friday review from the Scorecards screen', dueDay: 30 },
      { phase: P3, title: 'Take over routine client communication from Joseph', dueDay: 60 },
      { phase: P3, title: 'Put the approval matrix live: every task at L0, L1 or L2', dueDay: 60 },
      { phase: P4, title: 'Run the monthly scorecard review with each team member', dueDay: 90 },
      { phase: P4, title: 'Ship one process fix and write it into the handover notes', dueDay: 90 },
      { phase: P4, title: 'Flag upsell openings for Joseph', dueDay: 90 },
    ],
    checkpoints: [
      { day: 7, title: W1, passLine: 'Every active client has a complete scope in Markwiz OS', checks: [{ kind: 'all_clients_scoped' }] },
      { day: 30, title: P2, passLine: '85% of client work on time, zero client-facing errors, reports out on time', checks: [
        { kind: 'metric', metric: 'client_on_time', op: '>=', value: 85, fromDay: 8, toDay: 30 },
        { kind: 'metric', metric: 'errors_all', op: '<=', value: 0, fromDay: 1, toDay: 30 },
        { kind: 'metric', metric: 'reports_on_time', op: '>=', value: 100, fromDay: 1, toDay: 30, allowEmpty: true },
      ] },
      { day: 60, title: P3, passLine: '90% on time, no Red clients, approvals waiting on Joseph down by half', checks: [
        { kind: 'metric', metric: 'client_on_time', op: '>=', value: 90, fromDay: 31, toDay: 60 },
        { kind: 'metric', metric: 'red_clients', op: '<=', value: 0, fromDay: 31, toDay: 60 },
        { kind: 'metric', metric: 'md_waiting', op: '<=', value: 'HALF_BASELINE', fromDay: 31, toDay: 60 },
      ] },
      { day: 90, title: P4, passLine: '95% on time, and the daily digest is the only delivery update Joseph needs', manual: true, checks: [
        { kind: 'metric', metric: 'client_on_time', op: '>=', value: 95, fromDay: 61, toDay: 90 },
      ] },
    ],
  },
  MOTION: {
    tasks: [
      { phase: W1, title: 'Study the brand guidelines of the top five clients', dueDay: 3 },
      { phase: W1, title: 'Set up the shared asset library: fonts, logos, music and project files', dueDay: 5 },
      { phase: W1, title: 'Shadow the graphic designer on this week’s live work', dueDay: 5 },
      { phase: P2, title: 'Template kit for {client}: reel, intro/outro and lower thirds', dueDay: 30, perTopClient: true },
      { phase: P2, title: 'Take your live deliverables through the proof check', dueDay: 30 },
      { phase: P3, title: 'Carry a full delivery load at the designer targets', dueDay: 60 },
      { phase: P4, title: 'Propose one motion format that could be sold as an add-on', dueDay: 90 },
    ],
    checkpoints: [
      { day: 30, title: P2, passLine: 'Reusable template kits delivered for the top five clients', checks: [{ kind: 'tasks_done', match: 'Template kit for', label: 'Template kits delivered' }] },
      { day: 60, title: P3, passLine: 'Designer numbers: 95% on time, 70% approved first time, under 2 revision rounds', checks: [
        { kind: 'metric', metric: 'on_time_handin', op: '>=', value: 95, fromDay: 31, toDay: 60 },
        { kind: 'metric', metric: 'first_review', op: '>=', value: 70, fromDay: 31, toDay: 60, allowEmpty: true },
        { kind: 'metric', metric: 'revision_rounds', op: '<', value: 2, fromDay: 31, toDay: 60, allowEmpty: true },
      ] },
      { day: 90, title: P4, passLine: 'Same numbers held, and zero errors reaching clients', checks: [
        { kind: 'metric', metric: 'on_time_handin', op: '>=', value: 95, fromDay: 61, toDay: 90 },
        { kind: 'metric', metric: 'first_review', op: '>=', value: 70, fromDay: 61, toDay: 90, allowEmpty: true },
        { kind: 'metric', metric: 'errors_own', op: '<=', value: 0, fromDay: 61, toDay: 90 },
      ] },
    ],
  },
  DEFAULT: {
    tasks: [
      { phase: W1, title: 'Read the client records and scopes you will work on', dueDay: 3 },
      { phase: W1, title: 'Meet each team member and learn how work moves through Markwiz OS', dueDay: 5 },
      { phase: P2, title: 'Take full ownership of your assigned work and your daily plan', dueDay: 30 },
    ],
    checkpoints: [
      { day: 30, title: P2, passLine: 'Say/Do at 85% or better from day 8', checks: [{ kind: 'metric', metric: 'say_do', op: '>=', value: 85, fromDay: 8, toDay: 30 }] },
      { day: 60, title: P3, passLine: 'Say/Do at 85% or better', checks: [{ kind: 'metric', metric: 'say_do', op: '>=', value: 85, fromDay: 31, toDay: 60 }] },
      { day: 90, title: P4, passLine: 'Say/Do at 85% or better, and no red month', checks: [{ kind: 'metric', metric: 'say_do', op: '>=', value: 85, fromDay: 61, toDay: 90 }] },
    ],
  },
};

export function planFor(seat?: string | null) { return PLANS[seat ?? ''] ?? PLANS.DEFAULT; }

export async function ensureInternalClient(db: Db) {
  const existing = await db.client.findFirst({ where: { internal: true }, orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  return db.client.create({ data: { name: 'Markwiz (internal)', company: 'Markwiz Marketing Consultancy', industry: 'Internal', internal: true, health: 'GREEN', healthScore: 100, notes: 'Internal work: onboarding, Markwiz OS fixes and admin. Not a client account.' } });
}

function dueKeyFrom(startKey: string, day: number) {
  let key = addDaysKey(startKey, Math.max(0, day - 1));
  if (!isWorkingDayKey(key)) { const prev = prevWorkingDayKey(key); key = prev >= startKey ? prev : nextWorkingDayKey(key); }
  return key;
}

/** Loads a new hire's plan as tasks and checkpoints. Does nothing if they already have one. */
export async function createOnboardingPlan(db: Db, userId: string, actorId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, seat: true, joiningDate: true } });
  if (!user) throw new Error('User not found');
  if (await db.onboardingCheckpoint.count({ where: { userId } })) return { created: 0, alreadyLoaded: true, startKey: null as string | null };
  const today = istDateKey(now);
  const joinKey = user.joiningDate ? istDateKey(user.joiningDate) : today;
  // A plan loaded long after someone joined starts today, so week 1 isn't overdue on arrival.
  const startKey = joinKey < addDaysKey(today, -7) ? today : joinKey;
  const plan = planFor(user.seat);
  const internal = await ensureInternalClient(db);
  const topClients = await db.client.findMany({ where: { active: true, internal: false }, orderBy: { retainer: 'desc' }, take: 5, select: { id: true, name: true } });
  let created = 0;
  for (const item of plan.tasks) {
    const targets = item.perTopClient ? topClients : [null];
    for (const client of targets) {
      const desc = `${item.phase} · ${item.title.replace('{client}', client?.name ?? 'each client')}`;
      const task = await db.task.create({
        data: {
          clientId: client?.id ?? internal.id, ownerId: user.id, assignerId: actorId, desc, due: taskDueFromKey(dueKeyFrom(startKey, item.dueDay)),
          priority: 'P2', approvalLevel: item.perTopClient ? 'L1' : 'L0', status: 'OPEN', category: item.perTopClient ? 'VIDEO' : 'ONBOARDING',
          clientFacing: false, needsCopy: false, needsProof: false,
        },
      });
      await db.taskEvent.create({ data: { taskId: task.id, userId: actorId, type: 'CREATED', note: 'Onboarding plan' } });
      created++;
    }
  }
  for (const cp of plan.checkpoints) {
    await db.onboardingCheckpoint.create({ data: { userId, day: cp.day, title: cp.title, passLine: cp.passLine, manual: !!cp.manual, checks: { startKey, items: cp.checks } } });
  }
  await notify(db, [user.id], 'Your first 90 days are loaded', `Your onboarding plan has ${created} tasks and ${plan.checkpoints.length} checkpoints. Open Scorecards to see what good looks like at each stage.`);
  return { created, alreadyLoaded: false, startKey };
}

export function checkpointDueKey(startKey: string, day: number) { return addDaysKey(startKey, day - 1); }

type CheckResult = { label: string; pass: boolean; value: string; target: string };

async function runCheck(db: Db, userId: string, startKey: string, check: Check, now: Date): Promise<CheckResult> {
  if (check.kind === 'all_clients_scoped') {
    const clients = await db.client.findMany({ where: { active: true, internal: false }, select: { name: true, _count: { select: { scopeItems: { where: { active: true } } } } } });
    const missing = clients.filter((c) => c._count.scopeItems === 0).map((c) => c.name);
    return { label: 'Clients with a scope loaded', pass: clients.length > 0 && missing.length === 0, value: `${clients.length - missing.length} of ${clients.length}${missing.length ? ` (missing: ${missing.slice(0, 4).join(', ')})` : ''}`, target: 'All' };
  }
  if (check.kind === 'tasks_done') {
    const tasks = await db.task.findMany({ where: { ownerId: userId, desc: { contains: check.match } }, select: { status: true } });
    const done = tasks.filter((t) => t.status === 'CLIENT' || t.status === 'DONE').length;
    return { label: check.label, pass: tasks.length > 0 && done === tasks.length, value: `${done} of ${tasks.length}`, target: 'All' };
  }
  const def = METRICS[check.metric];
  const win = { startKey: addDaysKey(startKey, check.fromDay - 1), endKey: addDaysKey(startKey, check.toDay - 1) };
  const result = await computeMetric(db, check.metric, userId, win, now);
  let threshold: number | null = typeof check.value === 'number' ? check.value : null;
  if (check.value === 'HALF_BASELINE') {
    const b = await mdWaitingBaseline(db);
    threshold = b.baseline !== null ? b.baseline / 2 : null;
  }
  const label = `${def?.label ?? check.metric} (days ${check.fromDay} to ${check.toDay})`;
  const targetText = threshold === null ? 'Baseline not ready' : `${check.op === '>=' ? 'At least' : check.op === '<' ? 'Under' : 'At most'} ${def?.unit === '%' ? `${threshold}%` : Math.round(threshold * 10) / 10}`;
  if (result.value === null) return { label, pass: !!check.allowEmpty, value: 'No data', target: targetText };
  if (threshold === null) return { label, pass: false, value: String(result.value), target: targetText };
  const v = result.value;
  const pass = check.op === '>=' ? v >= threshold : check.op === '<' ? v < threshold : v <= threshold;
  return { label, pass, value: def?.unit === '%' ? `${Math.round(v)}%` : String(v), target: targetText };
}

/** Evaluates checkpoints whose day has passed. Runs every morning. */
export async function evaluateCheckpoints(db: Db, now = new Date()) {
  const today = istDateKey(now);
  const pending = await db.onboardingCheckpoint.findMany({ where: { result: 'PENDING' }, include: { user: { select: { id: true, name: true, active: true } } } });
  const mds = (await mdUsers(db)).map((m) => m.id);
  let evaluated = 0;
  for (const cp of pending) {
    if (!cp.user.active) continue;
    const spec = cp.checks as { startKey?: string; items?: Check[] };
    if (!spec?.startKey || !Array.isArray(spec.items)) continue;
    const dueKey = checkpointDueKey(spec.startKey, cp.day);
    if (today <= dueKey) continue;
    const results: CheckResult[] = [];
    for (const check of spec.items) results.push(await runCheck(db, cp.userId, spec.startKey, check, now));
    const pass = results.every((r) => r.pass);
    const result = !pass ? 'MISS' : cp.manual ? 'CONFIRM' : 'PASS';
    await db.onboardingCheckpoint.update({ where: { id: cp.id }, data: { result, detail: results, evaluatedAt: now } });
    evaluated++;
    const summary = results.map((r) => `${r.pass ? '✓' : '✗'} ${r.label}: ${r.value} (target ${r.target})`).join('\n');
    if (result === 'CONFIRM') await notify(db, mds, `Confirm ${cp.user.name}'s day ${cp.day} checkpoint`, `The numbers pass: ${cp.passLine}. One part needs your judgement. Open their scorecard to confirm.\n${summary}`);
    else await notify(db, [...mds, cp.userId], `Day ${cp.day} checkpoint ${result === 'PASS' ? 'passed' : 'missed'}: ${cp.user.name}`, `${cp.passLine}\n${summary}`);
  }
  return { evaluated };
}

export function checkpointLabel(startKey: string, day: number) { return `Day ${day} · ${shortKeyLabel(checkpointDueKey(startKey, day))}`; }
