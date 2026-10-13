import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { ROLES, SEATS, seatLabel, tenureDay } from '@/lib/team';
import { istDateKey } from '@/lib/workcalendar';
import { TeamForm, TeamRow } from '@/components/ops';

export default async function Team() {
  const u = await requirePageUser();
  if (u.role !== 'MD') redirect('/');
  const people = await db.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { id: true, name: true, email: true, role: true, seat: true, joiningDate: true, active: true, _count: { select: { kpiTargets: { where: { active: true } }, checkpoints: true } } } });
  const seats = Object.entries(SEATS).map(([key, s]) => ({ key, label: s.label }));
  const roles = [...ROLES];
  return <div className="page">
    <div className="header"><div><div className="eyebrow">TEAM & TARGETS</div><h1>Team</h1><p className="muted">Role decides what someone can open. Seat decides their KPIs and their 90-day plan. Targets per person are set on their scorecard.</p></div></div>
    <TeamForm roles={roles} seats={seats} />
    <div className="card" style={{ marginTop: 14 }}><table className="table"><thead><tr><th>Person</th><th>Seat</th><th>Tenure</th><th>KPIs</th><th>Settings</th></tr></thead><tbody>
      {people.map((p) => { const d = tenureDay(p.joiningDate); return <tr key={p.id} className={p.active ? '' : 'inactive'}>
        <td><Link href={`/scorecards?user=${p.id}`}><b>{p.name}</b></Link><div className="muted">{p.email}{p.active ? '' : ' · inactive'}</div></td>
        <td>{seatLabel(p.seat)}<div className="muted">{p.role}</div></td>
        <td>{d && d > 0 ? `Day ${d}` : d !== null ? `Joins in ${1 - d} day${1 - d === 1 ? '' : 's'}` : '—'}{p._count.checkpoints ? <div className="muted">90-day plan loaded</div> : null}</td>
        <td>{p._count.kpiTargets}</td>
        <td><TeamRow id={p.id} role={p.role} seat={p.seat ?? ''} joiningDate={p.joiningDate ? istDateKey(p.joiningDate) : ''} active={p.active} roles={roles} seats={seats} hasPlan={p._count.checkpoints > 0} /></td>
      </tr>; })}
    </tbody></table></div>
  </div>;
}
