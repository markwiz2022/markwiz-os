import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { GenerateNow, ScopeForm, ScopeToggle } from '@/components/ops';
import { describeCadence, dueKeyFor, periodKeyFor } from '@/lib/scope';
import { CATEGORIES, STATUS_LABEL } from '@/lib/task-flow';
import { shortKeyLabel } from '@/lib/workcalendar';

export default async function Scopes() {
  const u = await requirePageUser('clients');
  const lead = u.role === 'MD' || u.role === 'DMM';
  const now = new Date();
  const [clients, users] = await Promise.all([
    db.client.findMany({ where: { active: true, internal: false }, orderBy: { name: 'asc' }, include: { scopeItems: { orderBy: [{ active: 'desc' }, { createdAt: 'asc' }], include: { tasks: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, periodKey: true } } } } } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  const nameOf = (id: string | null) => users.find((x) => x.id === id)?.name ?? 'DMM decides';
  const missing = clients.filter((c) => !c.scopeItems.some((i) => i.active));
  const categories = Object.entries(CATEGORIES).map(([key, c]) => ({ key, ...c }));
  return <div className="page">
    <div className="header"><div><div className="eyebrow">RETAINER DELIVERY</div><h1>Client scopes</h1><p className="muted">Every retainer’s recurring deliverables. Monthly items become tasks on the 1st, weekly items every Monday, with owner, due date and checks already set. Nobody has to remember to create them.</p></div>{lead && <GenerateNow />}</div>
    {missing.length > 0 && <div className="card warn-card"><h3>{missing.length} client{missing.length === 1 ? ' has' : 's have'} no scope loaded</h3><p className="muted">{missing.map((c) => c.name).join(', ')}. Their work won’t create itself until it’s here.</p></div>}
    {lead && <ScopeForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} users={users} categories={categories} />}
    <div className="scope-list">{clients.map((c) => <div className="card" key={c.id}>
      <div className="section-head"><div><h3><Link className="client-link" href={`/clients/${c.id}`}>{c.name}</Link></h3><p className="muted">{c.scopeItems.filter((i) => i.active).length} recurring deliverable{c.scopeItems.filter((i) => i.active).length === 1 ? '' : 's'}</p></div></div>
      {c.scopeItems.length === 0 ? <div className="empty-state">No scope yet.</div> : <table className="table"><thead><tr><th>Deliverable</th><th>When</th><th>Owner</th><th>Checks</th><th>This period</th>{lead && <th />}</tr></thead><tbody>
        {c.scopeItems.map((i) => { const period = periodKeyFor(i, now); const t = i.tasks[0]?.periodKey === period ? i.tasks[0] : null; return <tr key={i.id} className={i.active ? '' : 'inactive'}>
          <td><b>{i.title}</b><div className="muted">{CATEGORIES[i.category]?.label ?? i.category}</div></td>
          <td>{describeCadence(i)}<div className="muted">Next due {shortKeyLabel(dueKeyFor(i, period))}</div></td>
          <td>{nameOf(i.ownerId)}</td>
          <td>{[i.needsCopy && 'Copy', i.needsProof && 'Proof', i.approvalLevel].filter(Boolean).join(' · ')}</td>
          <td>{!i.active ? <span className="muted">Paused</span> : t ? <Link href={`/tasks/${t.id}`} className="pill">{STATUS_LABEL[t.status]}</Link> : <span className="muted">Created at the next period</span>}</td>
          {lead && <td><ScopeToggle id={i.id} active={i.active} /></td>}
        </tr>; })}
      </tbody></table>}
    </div>)}</div>
  </div>;
}
