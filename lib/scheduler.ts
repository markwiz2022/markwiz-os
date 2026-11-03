import type { Db } from './db';
import { sendDailyDigest } from './digest';
import { closeMonth } from './kpi';
import { evaluateCheckpoints } from './onboarding';
import { autoCloseClientWork, runEscalations, takeSnapshots } from './rules';
import { closeDay } from './saydo';
import { generateScopeTasks } from './scope';
import { syncApollo } from './apollo';
import { addDaysKey, istDateKey, istMinutes, isWorkingDayKey, lastDayOfMonth, monthKeyIST, monthKeyOffset } from './workcalendar';

// Autopilot jobs (all times IST). Each job runs once per period: a JobRun row is the lock and the record.
// The in-process timer (instrumentation.ts) ticks every minute on a normal `npm start` server.
// For serverless hosting, call GET /api/cron with the CRON_SECRET every 5 to 10 minutes instead.
//
//   06:00 daily          scope-generate    create this period's scope tasks
//   06:30 daily          checkpoints       evaluate onboarding pass lines that are due
//   07:00 daily          client-autoclose  close client work with no changes after 3 working days
//   18:00 working days   saydo-close       close the day's plans, record no-plan days
//   18:05 working days   snapshots         Red clients and items waiting on the MD
//   19:00 working days   digest            the exceptions email
//   02:00 on the 1st     month-close       freeze last month's scorecards, raise PIP/bonus flags
//   every 5 minutes      escalations       overdue to owner + DMM, next day to the MD
//   every 10 minutes     apollo-sync       new Apollo contacts become CRM leads (needs APOLLO_API_KEY)

type Job = { name: string; keys: (now: Date, installKey: string) => string[]; run: (db: Db, now: Date, key: string) => Promise<unknown> };

const at = (now: Date, hh: number, mm = 0) => istMinutes(now) >= hh * 60 + mm;

export const JOBS: Job[] = [
  { name: 'scope-generate', keys: (now) => (at(now, 6) ? [istDateKey(now)] : []), run: (db, now) => generateScopeTasks(db, now) },
  { name: 'checkpoints', keys: (now) => (at(now, 6, 30) ? [istDateKey(now)] : []), run: (db, now) => evaluateCheckpoints(db, now) },
  { name: 'client-autoclose', keys: (now) => (at(now, 7) ? [istDateKey(now)] : []), run: (db, now) => autoCloseClientWork(db, now) },
  {
    name: 'saydo-close',
    keys: (now, installKey) => {
      const today = istDateKey(now);
      const keys: string[] = [];
      for (let i = 7; i >= 0; i--) {
        const k = addDaysKey(today, -i);
        if (k < installKey || !isWorkingDayKey(k)) continue;
        if (k === today && !at(now, 18)) continue;
        keys.push(k);
      }
      return keys;
    },
    run: (db, now, key) => closeDay(db, key, now),
  },
  { name: 'snapshots', keys: (now, installKey) => { const k = istDateKey(now); return isWorkingDayKey(k) && k >= installKey && at(now, 18, 5) ? [k] : []; }, run: (db, now, key) => takeSnapshots(db, key, now) },
  { name: 'digest', keys: (now) => { const k = istDateKey(now); return isWorkingDayKey(k) && at(now, 19) ? [k] : []; }, run: (db, now) => sendDailyDigest(db, now) },
  {
    name: 'month-close',
    keys: (now, installKey) => {
      const today = istDateKey(now);
      if (today.endsWith('-01') && !at(now, 2)) return [];
      const prev = monthKeyOffset(monthKeyIST(now), -1);
      // Never close a month that ended before Markwiz OS started running jobs.
      return `${prev}-${String(lastDayOfMonth(prev)).padStart(2, '0')}` >= installKey ? [prev] : [];
    },
    run: (db, now, key) => closeMonth(db, key, now),
  },
];

async function installKey(db: Db, now: Date) {
  const first = await db.jobRun.findUnique({ where: { job_periodKey: { job: 'install', periodKey: 'first' } } });
  if (first) return istDateKey(first.ranAt);
  try { await db.jobRun.create({ data: { job: 'install', periodKey: 'first', ranAt: now, result: 'Autopilot started' } }); } catch { /* another runner won */ }
  return istDateKey(now);
}

async function acquire(db: Db, job: string, periodKey: string, now: Date) {
  try {
    return await db.jobRun.create({ data: { job, periodKey, ranAt: now, result: 'RUNNING' } });
  } catch {
    const existing = await db.jobRun.findUnique({ where: { job_periodKey: { job, periodKey } } });
    // A run that crashed half-way is retried after 30 minutes.
    if (existing?.result === 'RUNNING' && Date.now() - existing.ranAt.getTime() > 30 * 60_000) await db.jobRun.delete({ where: { id: existing.id } }).catch(() => undefined);
    return null;
  }
}

let lastEscalation = 0;

export async function runDueJobs(db: Db, now = new Date(), opts: { forceEscalations?: boolean } = {}) {
  const ran: { job: string; key: string; result: string }[] = [];
  const install = await installKey(db, now);
  for (const job of JOBS) {
    for (const key of job.keys(now, install)) {
      const lock = await acquire(db, job.name, key, now);
      if (!lock) continue;
      try {
        const result = JSON.stringify(await job.run(db, now, key) ?? {}).slice(0, 480);
        await db.jobRun.update({ where: { id: lock.id }, data: { result: `OK ${result}` } });
        ran.push({ job: job.name, key, result });
      } catch (e) {
        await db.jobRun.delete({ where: { id: lock.id } }).catch(() => undefined);
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[autopilot] ${job.name} ${key} failed:`, message);
        ran.push({ job: job.name, key, result: `FAILED ${message.slice(0, 200)}` });
      }
    }
  }
  if (opts.forceEscalations || Date.now() - lastEscalation > 5 * 60_000) {
    lastEscalation = Date.now();
    try { ran.push({ job: 'escalations', key: '-', result: JSON.stringify(await runEscalations(db, now)) }); }
    catch (e) { console.error('[autopilot] escalations failed:', e); }
  }
  // Apollo → CRM. Does nothing without APOLLO_API_KEY, and at most once every 10 minutes.
  try { const r = await syncApollo(db, { now }); if (r) ran.push({ job: 'apollo-sync', key: '-', result: r.error ? `FAILED ${r.error}` : `created ${r.created}, linked ${r.linked}` }); }
  catch (e) { console.error('[autopilot] apollo sync failed:', e); }
  return ran;
}

export function startScheduler() {
  const g = globalThis as unknown as { __markwizAutopilot?: ReturnType<typeof setInterval>; __markwizTickRunning?: boolean };
  if (g.__markwizAutopilot) return;
  const tick = async () => {
    if (g.__markwizTickRunning) return;
    g.__markwizTickRunning = true;
    try { const { db } = await import('./db'); await runDueJobs(db); }
    catch (e) { console.error('[autopilot] tick failed:', e); }
    finally { g.__markwizTickRunning = false; }
  };
  g.__markwizAutopilot = setInterval(tick, 60_000);
  g.__markwizAutopilot.unref?.();
  setTimeout(tick, 15_000).unref?.();
  console.log('[autopilot] scheduler started (checks every minute, IST)');
}

/** For the status panel. */
export async function jobStatus(db: Db) {
  const rows = await db.jobRun.findMany({ orderBy: { ranAt: 'desc' }, take: 200 });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.job)) latest.set(r.job, r);
  return JOBS.map((j) => ({ job: j.name, last: latest.get(j.name) ?? null }));
}

