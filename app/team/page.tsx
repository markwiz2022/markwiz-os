import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { ROLES, SEATS, seatLabel, tenureDay } from '@/lib/team';
import { istDateKey } from '@/lib/workcalendar';
import { TeamForm, TeamRow } from '@/components/ops';
import { ClientCreatorsSetting, PersonDetailsEdit } from '@/components/team-extra';
import { getClientCreatorIds } from '@/lib/settings';

export default async function Team({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string }> }) {
  const u = await requirePageUser();
  if (u.role !== 'MD') redirect('/');
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().toLowerCase();
  const status = sp.status === 'inactive' ? 'inactive' : sp.status === 'all' ? 'all' : 'active';
  const creators = await getClientCreatorIds();
  const everyone = await db.user.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { id: true, name: true, email: true, role: true, seat: true, joiningDate: true, active: true, _count: { select: { kpiTargets: { where: { active: true } }, checkpoints: true } } } });
  const people = everyone.filter((p) => (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) && (!sp.role || p.role === sp.role) && (status === 'all' || (status === 'active' ? p.active : !p.active)));
  const seats = Object.entries(SEATS).map(([key, s]) => ({ key, label: s.label }));
  const roles = [...ROLES];
  return <div className="page">
    <div className="header"><div><div className="eyebrow">TEAM & TARGETS</div><h1>Team</h1><p className="muted">Role decides what someone can open. Seat decides their KPIs and their 90-day plan. Targets per person are set on their scorecard.</p></div></div>
    <TeamForm roles={roles} seats={seats} />
    <form className="card filter-bar" method="get" action="/team" style={{ marginTop: 14 }}>
      <input name="q" defaultValue={sp.q ?? ''} placeholder="Search name or email" />
      <select name="role" defaultValue={sp.role ?? ''}><option value="">All roles</option>{roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      <select name="status" defaultValue={status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">Everyone</option></select>
      <button className="btn secondary small" type="submit">Filter</button>
      <span className="muted">{people.length} of {everyone.length}</span>
    </form>
    <div className="card" style={{ marginTop: 14 }}><table className="table"><thead><tr><th>Person</th><th>Seat</th><th>Tenure</th><th>KPIs</th><th>Settings</th></tr></thead><tbody>
      {people.map((p) => { const d = tenureDay(p.joiningDate); return <tr key={p.id} className={p.active ? '' : 'inactive'}>
        <td><Link href={`/scorecards?user=${p.id}`}><b>{p.name}</b></Link><div className="muted">{p.email}{p.active ? '' : ' · inactive'}</div><PersonDetailsEdit id={p.id} name={p.name} email={p.email} /></td>
        <td>{seatLabel(p.seat)}<div className="muted">{p.role}</div></td>
        <td>{d && d > 0 ? `Day ${d}` : d !== null ? `Joins in ${1 - d} day${1 - d === 1 ? '' : 's'}` : '—'}{p._count.checkpoints ? <div className="muted">90-day plan loaded</div> : null}</td>
        <td>{p._count.kpiTargets}</td>
        <td><TeamRow id={p.id} role={p.role} seat={p.seat ?? ''} joiningDate={p.joiningDate ? istDateKey(p.joiningDate) : ''} active={p.active} roles={roles} seats={seats} hasPlan={p._count.checkpoints > 0} /></td>
      </tr>; })}
    </tbody></table></div>
    <ClientCreatorsSetting people={everyone.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, role: p.role }))} selected={creators} />
  </div>;
}
