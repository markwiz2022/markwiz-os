import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import AttendanceControls from '@/components/attendance-controls';
import { ReasonsForm, TodayPlanner } from '@/components/ops';
import { clockedInOn, pendingReasons, planProgress, planWindow, sayDoStats } from '@/lib/saydo';
import { isDeliveryLane } from '@/lib/team';
import { isOverdue, STATUS_LABEL } from '@/lib/task-flow';
import { dateTime } from '@/lib/format';
import { addDaysKey, istDateKey, monthKeyIST, shortKeyLabel } from '@/lib/workcalendar';

export default async function Today() {
  const u = await requirePageUser();
  const now = new Date();
  const w = planWindow(now);
  const lead = u.role === 'MD' || u.role === 'DMM';
  const [plan, reasons, clockedIn, candidates, clients, month, history] = await Promise.all([
    db.dailyPlan.findUnique({ where: { userId_dateKey: { userId: u.id, dateKey: w.dateKey } }, include: { items: true } }),
    pendingReasons(db, u.id, w.dateKey),
    clockedInOn(db, u.id, w.dateKey),
    db.task.findMany({ where: { ownerId: u.id, status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] } }, include: { client: { select: { name: true } } }, orderBy: { due: 'asc' } }),
    db.client.findMany({ where: { active: true, internal: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    sayDoStats(db, u.id, `${monthKeyIST(now)}-01`, w.dateKey),
    db.dailyPlan.findMany({ where: { userId: u.id, dateKey: { gte: addDaysKey(w.dateKey, -20) } }, include: { items: { select: { outcome: true } } }, orderBy: { dateKey: 'desc' }, take: 12 }),
  ]);
  const progress = plan && !plan.noPlan ? await planProgress(db, plan, now) : [];
  const planned = new Set(plan?.items.map((i) => i.taskId) ?? []);
  const taskStatus = plan ? await db.task.findMany({ where: { id: { in: plan.items.map((i) => i.taskId).filter((x): x is string => !!x) } }, select: { id: true, status: true } }) : [];

  // Team view for the morning stand-up.
  let team: { id: string; name: string; clockedIn: boolean; isWfh: boolean; items: number; done: number; late: boolean; noPlan: boolean }[] = [];
  if (lead) {
    const people = await db.user.findMany({ where: { active: true, kpiTargets: { some: { metric: 'say_do', active: true } } }, select: { id: true, name: true, role: true, seat: true, status: true }, orderBy: { name: 'asc' } });
    for (const p of people.filter((p) => u.role === 'MD' || isDeliveryLane(p))) {
      const pl = await db.dailyPlan.findUnique({ where: { userId_dateKey: { userId: p.id, dateKey: w.dateKey } }, include: { items: true } });
      const prog = pl && !pl.noPlan ? await planProgress(db, pl, now) : [];
      const hasClockedIn = await clockedInOn(db, p.id, w.dateKey);
      team.push({
        id: p.id,
        name: p.name,
        clockedIn: hasClockedIn,
        isWfh: (p.status || '').includes('WFH'),
        items: pl?.items.length ?? 0,
        done: prog.filter((x) => x.done).length,
        late: !!pl?.late,
        noPlan: !!pl?.noPlan,
      });
    }
  }

  const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  return <div className="page">
    <div className="header"><div><div className="eyebrow">SAY / DO</div><h1>Today</h1><p className="muted">{dateLabel}. Commit to what you’ll hand in by 9:30 AM. The list locks at 11:00 AM and closes itself at 6:00 PM.</p></div>
      <div className="big-number"><b>{month.ratio === null ? '—' : `${Math.round(month.ratio)}%`}</b><span>Say/Do this month</span></div></div>

    {!w.working ? <div className="card empty-state">Today is a weekly off. No plan needed.</div> : <>
      {!clockedIn && <div className="card"><div className="section-head"><div><h3>Clock in to plan your day</h3><p className="muted">Check-in is 9:00 AM with grace until 9:15 AM. Choose Office or WFH.</p></div><AttendanceControls active={false} /></div></div>}
      {clockedIn && <div className="card" style={{ marginBottom: 14, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="muted" style={{ fontSize: '11px' }}>Today:</span>
          <span className={`pill ${u.status?.includes('WFH') ? 'cyan' : 'green'}`}>
            {u.status?.includes('WFH') ? '🏠 Work from Home (WFH)' : '🏢 In Office'}
          </span>
        </div>
        <AttendanceControls active={true} isWfh={u.status?.includes('WFH')} />
      </div>}

      {reasons.length > 0 && <div className="card warn-card"><div className="section-head"><div><h3>Unfinished from your last plan</h3><p className="muted">Give a reason for each before you commit today. Reasons show on your scorecard.</p></div></div>
        <ReasonsForm items={reasons.map((r) => ({ id: r.id, title: r.title, date: shortKeyLabel(r.plan.dateKey) }))} /></div>}

      {plan && !plan.noPlan && <div className="card"><div className="section-head"><div><h3>Your commitments</h3><p className="muted">Committed {dateTime(plan.committedAt)}{plan.late ? ' (after 9:30)' : ''}. A task counts once it’s handed in.</p></div><span className="count-chip">{progress.filter((p) => p.done).length}/{plan.items.length}</span></div>
        <div className="commit-list">{plan.items.map((i) => { const done = progress.find((p) => p.id === i.id)?.done || i.outcome === 'DONE'; const st = taskStatus.find((x) => x.id === i.taskId)?.status; return <div key={i.id} className={`commit ${done ? 'done' : i.outcome === 'MISSED' ? 'missed' : ''}`}><span className="tick">{done ? '✓' : i.outcome === 'MISSED' ? '✗' : ''}</span><div><Link href={i.taskId ? `/tasks/${i.taskId}` : '#'}><b>{i.title}</b></Link><small>{done ? 'Handed in' : i.outcome === 'MISSED' ? `Missed${i.reason ? `: ${i.reason}` : ''}` : st ? STATUS_LABEL[st] : ''}</small></div></div>; })}</div>
      </div>}
      {plan?.noPlan && <div className="card warn-card"><h3>No plan today</h3><p className="muted">You clocked in but didn’t commit a plan before it locked. This counts as one missed commitment.</p></div>}

      {clockedIn && !plan?.closedAt && !plan?.noPlan && reasons.length === 0 && w.open && <div className="card"><div className="section-head"><div><h3>{plan ? 'Add to today’s plan' : 'Plan your day'}</h3><p className="muted">Pick only what you will hand in today. Missing a commitment costs more than committing to less.</p></div></div>
        <TodayPlanner open={w.open} late={w.late} clients={clients} candidates={candidates.filter((c) => !planned.has(c.id)).map((c) => ({ id: c.id, desc: c.desc, client: c.client.name, due: shortKeyLabel(istDateKey(c.due)), status: STATUS_LABEL[c.status], late: isOverdue(c, now) }))} /></div>}
      {clockedIn && !plan && !w.open && <div className="card warn-card"><h3>Plans locked at 11:00 AM</h3><p className="muted">Today will count as a day without a plan.</p></div>}
    </>}

    {lead && team.length > 0 && <div className="card" style={{ marginTop: 14 }}><div className="section-head"><div><h3>Team stand-up</h3><p className="muted">Who has committed, and how far they are.</p></div></div>
      <table className="table"><thead><tr><th>Person</th><th>Clocked in</th><th>Work Mode</th><th>Plan</th><th>Handed in</th></tr></thead><tbody>
        {team.map((p) => <tr key={p.id}><td><Link href={`/scorecards?user=${p.id}`}><b>{p.name}</b></Link></td><td>{p.clockedIn ? <span className="pill green">Yes</span> : <span className="muted">No</span>}</td><td>{p.clockedIn ? (p.isWfh ? <span className="pill cyan">🏠 WFH</span> : <span className="pill green">🏢 Office</span>) : <span className="muted">—</span>}</td><td>{p.noPlan ? <span className="pill red">No plan</span> : p.items ? <span className={`pill ${p.late ? 'amber' : 'green'}`}>{p.items} task{p.items === 1 ? '' : 's'}{p.late ? ' · late' : ''}</span> : p.clockedIn && !w.open ? <span className="pill red">Missed the cut-off</span> : <span className="muted">Not yet</span>}</td><td>{p.items ? `${p.done} of ${p.items}` : '—'}</td></tr>)}
      </tbody></table></div>}

    <div className="card" style={{ marginTop: 14 }}><div className="section-head"><div><h3>Recent days</h3><p className="muted">{month.done} of {month.committed} commitments handed in this month{month.noPlanDays ? `, plus ${month.noPlanDays} day${month.noPlanDays === 1 ? '' : 's'} without a plan` : ''}.</p></div></div>
      <div className="day-strip">{history.map((h) => { const n = h.items.length; const d = h.items.filter((i) => i.outcome === 'DONE').length; const cls = !h.closedAt ? 'open' : h.noPlan ? 'red' : n && d / n >= 0.85 ? 'green' : n && d / n >= 0.7 ? 'amber' : 'red'; return <div key={h.id} className={`day ${cls}`} title={h.noPlan ? 'No plan' : `${d}/${n}`}><b>{shortKeyLabel(h.dateKey)}</b><span>{!h.closedAt ? 'Open' : h.noPlan ? 'No plan' : `${d}/${n}`}</span></div>; })}{history.length === 0 && <div className="empty-state">Your first plan will show here.</div>}</div>
    </div>
  </div>;
}
