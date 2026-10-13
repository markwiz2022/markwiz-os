import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeScorecard, METRICS, type Rating } from '@/lib/kpi';
import { checkpointDueKey } from '@/lib/onboarding';
import { canSeeScorecard, seatLabel, tenureDay } from '@/lib/team';
import { ratingClass, ratingLabel } from '@/lib/format';
import { isOverdue, STATUS_LABEL } from '@/lib/task-flow';
import { istDateKey, monthKeyIST, monthKeyOffset, monthLabel, shortKeyLabel } from '@/lib/workcalendar';
import { AddKpi, CheckpointActions, FlagActions, ManualKpiForm, TargetEditor } from '@/components/ops';

export default async function Scorecards({ searchParams }: { searchParams: Promise<{ user?: string; month?: string }> }) {
  const u = await requirePageUser();
  const sp = await searchParams;
  const now = new Date();
  const currentMonth = monthKeyIST(now);
  const monthKey = sp.month && /^\d{4}-\d{2}$/.test(sp.month) && sp.month <= currentMonth ? sp.month : currentMonth;
  const everyone = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true, seat: true, joiningDate: true }, orderBy: { name: 'asc' } });
  const visible = everyone.filter((p) => canSeeScorecard(u, p));
  const isMD = u.role === 'MD';
  const memo = new Map<string, Promise<unknown>>();

  const subjectId = sp.user ?? (visible.length > 1 && !sp.user ? null : u.id);
  if (subjectId && !visible.some((p) => p.id === subjectId)) redirect('/scorecards');

  // Team overview
  if (!subjectId) {
    const cards = [];
    for (const p of visible) {
      const card = await computeScorecard(db, p, monthKey, now, memo);
      const history = await db.scorecardMonth.findMany({ where: { userId: p.id }, orderBy: { monthKey: 'desc' }, take: 3 });
      cards.push({ p, card, history });
    }
    return <div className="page">
      <Header monthKey={monthKey} current={currentMonth} base="/scorecards?" />
      <p className="muted rule-note">A month is red with two or more red KPIs, and green with no reds and at most one amber. Two red months in a row raise a PIP flag; three green months raise a bonus flag.</p>
      <div className="score-grid">{cards.map(({ p, card, history }) => <Link key={p.id} href={`/scorecards?user=${p.id}${monthKey !== currentMonth ? `&month=${monthKey}` : ''}`} className={`card score-card ${ratingClass(card.overall)}`}>
        <div className="section-head"><div><h3>{p.name}</h3><p className="muted">{seatLabel(p.seat)}</p></div><span className={`pill ${ratingClass(card.overall)}`}>{ratingLabel(card.overall)}</span></div>
        {card.rows.length === 0 ? <p className="muted">No KPIs set.</p> : <div className="kpi-dots">{card.rows.map((r) => <span key={r.metric} className={`kpi-dot ${ratingClass(r.rating)}`} title={`${r.label}: ${r.display}`}><i />{r.label}<b>{r.display}</b></span>)}</div>}
        {history.length > 0 && <div className="month-strip">{history.slice().reverse().map((h) => <span key={h.monthKey} className={`pill ${ratingClass(h.overall)}`}>{monthLabel(h.monthKey).split(' ')[0].slice(0, 3)}</span>)}</div>}
      </Link>)}</div>
    </div>;
  }

  const person = everyone.find((p) => p.id === subjectId)!;
  const card = await computeScorecard(db, person, monthKey, now, memo);
  const [targets, history, flags, checkpoints, onboardingTasks] = await Promise.all([
    db.kpiTarget.findMany({ where: { userId: person.id }, orderBy: { sort: 'asc' } }),
    db.scorecardMonth.findMany({ where: { userId: person.id }, orderBy: { monthKey: 'desc' }, take: 6 }),
    isMD ? db.performanceFlag.findMany({ where: { userId: person.id }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    db.onboardingCheckpoint.findMany({ where: { userId: person.id }, orderBy: { day: 'asc' } }),
    db.task.findMany({ where: { ownerId: person.id, OR: [{ category: 'ONBOARDING' }, { desc: { startsWith: 'Days 8 to 30 · Template kit' } }] }, orderBy: { due: 'asc' }, select: { id: true, desc: true, status: true, due: true } }),
  ]);
  const inactive = targets.filter((t) => !t.active);
  const unused = Object.values(METRICS).filter((m) => !targets.some((t) => t.metric === m.key)).map((m) => ({ key: m.key, label: `${m.label}${m.per ? ` (per ${m.per})` : ''}` }));
  const day = tenureDay(person.joiningDate, now);
  const startKey = (checkpoints[0]?.checks as { startKey?: string } | undefined)?.startKey;

  return <div className="page">
    {visible.length > 1 && <Link href={`/scorecards${monthKey !== currentMonth ? `?month=${monthKey}` : ''}`} className="back">← Team scorecards</Link>}
    <Header monthKey={monthKey} current={currentMonth} base={`/scorecards?user=${person.id}&`} title={person.name} sub={`${seatLabel(person.seat)}${day && day > 0 ? ` · day ${day}` : ''}`} overall={card.overall} complete={card.complete} />

    <div className="card"><table className="table kpi-table"><thead><tr><th>KPI</th><th>{card.complete ? card.label : 'So far this month'}</th><th>Target</th><th>Rating</th>{isMD && <th>Change target</th>}</tr></thead><tbody>
      {card.rows.length === 0 && <tr><td colSpan={5} className="muted">No KPIs set. {isMD ? 'Set a seat on the Team screen, or add one below.' : 'Joseph sets these.'}</td></tr>}
      {card.rows.map((r) => { const t = targets.find((x) => x.metric === r.metric)!; return <tr key={r.metric}>
        <td><b>{r.label}</b>{r.company && <span className="pill tiny">Company</span>}<div className="muted">{r.how}</div></td>
        <td><b className="kpi-value">{r.display}</b>{r.pace && <div className="muted">{r.pace}</div>}{r.detail && <div className="muted">{r.detail}</div>}</td>
        <td>{r.targetDisplay}{r.targetNote && <div className="muted">{r.targetNote}</div>}</td>
        <td><span className={`pill ${ratingClass(r.rating)}`}>{ratingLabel(r.rating)}</span></td>
        {isMD && <td>{r.manual && <div style={{ marginBottom: 6 }}><ManualKpiForm userId={person.id} metric={r.metric} monthKey={monthKey} value={r.value} /></div>}<TargetEditor userId={person.id} metric={r.metric} target={t.target} active={t.active} /></td>}
      </tr>; })}
    </tbody></table>
    {isMD && inactive.length > 0 && <p className="muted">Switched off: {inactive.map((t) => <span key={t.id} className="inline-target">{METRICS[t.metric]?.label ?? t.metric} <TargetEditor userId={person.id} metric={t.metric} target={t.target} active={false} /></span>)}</p>}
    {isMD && <AddKpi userId={person.id} options={unused} />}
    </div>

    {history.length > 0 && <div className="card" style={{ marginTop: 14 }}><div className="section-head"><div><h3>Past months</h3><p className="muted">Frozen on the 1st of each month.</p></div></div>
      <div className="month-row">{history.map((h) => <Link key={h.monthKey} href={`/scorecards?user=${person.id}&month=${h.monthKey}`} className={`month-box ${ratingClass(h.overall)}`}><b>{monthLabel(h.monthKey)}</b><span>{ratingLabel(h.overall)}</span></Link>)}</div></div>}

    {isMD && flags.length > 0 && <div className="card" style={{ marginTop: 14 }}><div className="section-head"><div><h3>Flags</h3><p className="muted">Raised by the rules. Only you see these.</p></div></div>
      {flags.map((f) => <div key={f.id} className="priority"><span className={`pill ${f.type === 'PIP' ? 'red' : 'green'}`}>{f.type === 'PIP' ? 'PIP' : 'Bonus'}</span><div style={{ flex: 1 }}><b>{f.note}</b><div className="muted">{f.status === 'OPEN' ? 'Open' : `${f.status.toLowerCase()}`}</div></div>{f.status === 'OPEN' && <FlagActions id={f.id} />}</div>)}</div>}

    {checkpoints.length > 0 && startKey && <div className="card" style={{ marginTop: 14 }}><div className="section-head"><div><h3>First 90 days</h3><p className="muted">Pass lines were set before day one and are checked by the system.</p></div></div>
      <div className="checkpoints">{checkpoints.map((c) => { const detail = (Array.isArray(c.detail) ? c.detail : []) as { label: string; pass: boolean; value: string; target: string }[]; return <div key={c.id} className={`checkpoint ${c.result === 'PASS' ? 'green' : c.result === 'MISS' ? 'red' : c.result === 'CONFIRM' ? 'amber' : ''}`}>
        <div className="cp-head"><b>Day {c.day} · {c.title}</b><span className={`pill ${c.result === 'PASS' ? 'green' : c.result === 'MISS' ? 'red' : c.result === 'CONFIRM' ? 'amber' : ''}`}>{c.result === 'PENDING' ? `Checked ${shortKeyLabel(checkpointDueKey(startKey, c.day + 1))}` : c.result === 'CONFIRM' ? 'Needs MD confirmation' : c.result === 'PASS' ? 'Passed' : 'Missed'}</span></div>
        <p>{c.passLine}</p>
        {detail.map((d, i) => <div key={i} className="muted">{d.pass ? '✓' : '✗'} {d.label}: {d.value} (target {d.target})</div>)}
        {isMD && c.result !== 'PENDING' && <CheckpointActions id={c.id} />}
      </div>; })}</div>
      {onboardingTasks.length > 0 && <><div className="mini-heading" style={{ marginTop: 14 }}>PLAN TASKS</div><div className="commit-list">{onboardingTasks.map((t) => <div key={t.id} className={`commit ${t.status === 'DONE' || t.status === 'CLIENT' ? 'done' : isOverdue(t, now) ? 'missed' : ''}`}><span className="tick">{t.status === 'DONE' || t.status === 'CLIENT' ? '✓' : ''}</span><div><Link href={`/tasks/${t.id}`}><b>{t.desc}</b></Link><small>Due {shortKeyLabel(istDateKey(t.due))} · {STATUS_LABEL[t.status]}</small></div></div>)}</div></>}
    </div>}
    {checkpoints.length === 0 && day !== null && day <= 90 && person.role !== 'MD' && <p className="muted" style={{ marginTop: 14 }}>No 90-day plan loaded. {isMD ? 'Load it from the Team screen.' : ''}</p>}
  </div>;
}

function Header({ monthKey, current, base, title = 'Scorecards', sub, overall, complete }: { monthKey: string; current: string; base: string; title?: string; sub?: string; overall?: Rating; complete?: boolean }) {
  const prev = monthKeyOffset(monthKey, -1); const next = monthKeyOffset(monthKey, 1);
  return <div className="header"><div><div className="eyebrow">SCORECARD · {monthLabel(monthKey).toUpperCase()}</div><h1>{title}</h1><p className="muted">{sub ?? 'Every number is calculated from what happens in Markwiz OS. Nobody rates their own work.'}</p></div>
    <div className="hero-status">{overall && <span className={`pill big ${ratingClass(overall)}`}>{complete ? '' : 'So far: '}{ratingLabel(overall)}</span>}<Link className="btn secondary small" href={`${base}month=${prev}`}>← {monthLabel(prev).split(' ')[0]}</Link>{monthKey < current && <Link className="btn secondary small" href={`${base}month=${next}`}>{monthLabel(next).split(' ')[0]} →</Link>}</div></div>;
}
