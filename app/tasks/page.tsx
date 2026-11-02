import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import TaskForm from '@/components/task-form';
import { TaskActionBar } from '@/components/ops';
import { availableActions, canRelease, canView, CATEGORIES, isOverdue, STATUS_LABEL } from '@/lib/task-flow';
import { dueLabel } from '@/lib/format';

const VIEWS = [
  { key: 'mine', label: 'My work' },
  { key: 'proof', label: 'Proof queue' },
  { key: 'review', label: 'Review queue' },
  { key: 'client', label: 'With clients' },
  { key: 'all', label: 'All open work' },
  { key: 'done', label: 'Done' },
];

export default async function Tasks({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; client?: string; owner?: string; priority?: string }> }) {
  const u = await requirePageUser('tasks');
  const lead = u.role === 'MD' || u.role === 'DMM';
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view! : lead ? 'all' : 'mine';
  const q = (sp.q ?? '').trim().toLowerCase();
  const fClient = sp.client ?? '';
  const fOwner = sp.owner ?? '';
  const fPriority = ['P1', 'P2', 'P3'].includes(sp.priority ?? '') ? sp.priority! : '';
  const now = new Date();
  const include = { client: { select: { id: true, name: true, internal: true } }, owner: { select: { id: true, name: true, role: true } }, assigner: { select: { id: true, name: true } }, _count: { select: { files: true } } } as const;

  // Leads see all open work. Everyone else only loads what they're allowed to open:
  // their own and assigned work, proof checks (anyone but the maker), and reviews they can release.
  const visibleWhere = lead
    ? { status: { not: 'DONE' as const } }
    : { status: { not: 'DONE' as const }, OR: [{ ownerId: u.id }, { assignerId: u.id }, { status: 'REVIEW' as const }, { status: 'APPROVAL' as const }] };

  const [loadedTasks, clients, users] = await Promise.all([
    db.task.findMany({ where: visibleWhere, include, orderBy: { due: 'asc' } }),
    db.client.findMany({ where: { active: true }, orderBy: [{ internal: 'asc' }, { name: 'asc' }], select: { id: true, name: true, internal: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, role: true } }),
  ]);
  const openTasks = lead ? loadedTasks : loadedTasks.filter((t) => canView(t, u));
  const proofQueue = openTasks.filter((t) => t.status === 'REVIEW' && t.ownerId !== u.id);
  const reviewQueue = openTasks.filter((t) => t.status === 'APPROVAL' && canRelease(t, u));
  const mine = openTasks.filter((t) => t.ownerId === u.id);
  const withClient = openTasks.filter((t) => t.status === 'CLIENT' && (lead || t.ownerId === u.id || t.assignerId === u.id));
  let list = openTasks;
  if (view === 'mine') list = mine.filter((t) => t.status !== 'CLIENT');
  if (view === 'proof') list = proofQueue;
  if (view === 'review') list = reviewQueue;
  if (view === 'client') list = withClient;
  if (view === 'all') list = lead ? openTasks.filter((t) => t.status !== 'CLIENT') : mine;
  if (view === 'done') list = await db.task.findMany({ where: { status: 'DONE', completedAt: { gte: new Date(now.getTime() - 30 * 86400000) }, ...(lead ? {} : { OR: [{ ownerId: u.id }, { assignerId: u.id }] }) }, include, orderBy: { completedAt: 'desc' }, take: 60 });
  const filtered = (q || fClient || fOwner || fPriority);
  if (filtered) list = list.filter((t) =>
    (!q || t.desc.toLowerCase().includes(q) || t.client.name.toLowerCase().includes(q) || t.owner.name.toLowerCase().includes(q)) &&
    (!fClient || t.client.id === fClient) &&
    (!fOwner || t.owner.id === fOwner) &&
    (!fPriority || t.priority === fPriority));
  const counts: Record<string, number> ={ mine: mine.filter((t) => t.status !== 'CLIENT').length, proof: proofQueue.length, review: reviewQueue.length, client: withClient.length };
  const overdue = (lead ? openTasks : mine).filter((t) => isOverdue(t, now)).length;
  const categories = Object.entries(CATEGORIES).filter(([k]) => k !== 'ONBOARDING').map(([key, c]) => ({ key, ...c }));

  return <div className="page">
    <div className="header"><div><div className="eyebrow">DELIVERY OPERATIONS</div><h1>Work & Tasks</h1><p className="muted">Copy, work, hand in, proof check, review, client. Nothing reaches a client without passing someone else’s check.</p></div></div>
    <TaskForm clients={clients} users={users} tasks={(lead ? openTasks : openTasks.filter((t) => t.ownerId === u.id || t.assignerId === u.id)).map((t) => ({ id: t.id, desc: t.desc, status: t.status }))} categories={categories} meId={u.id} />
    <div className="tabs">{VIEWS.filter((v) => lead || v.key !== 'all').map((v) => <Link key={v.key} href={`/tasks?view=${v.key}`} className={view === v.key ? 'active' : ''}>{v.label}{counts[v.key] ? <span>{counts[v.key]}</span> : null}</Link>)}</div>
    <form className="filter-bar" method="get" action="/tasks">
      <input type="hidden" name="view" value={view} />
      <input name="q" defaultValue={sp.q ?? ''} placeholder="Search task, client or person" />
      <select name="client" defaultValue={fClient}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      {lead && <select name="owner" defaultValue={fOwner}><option value="">Everyone</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
      <select name="priority" defaultValue={fPriority}><option value="">Any priority</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select>
      <button className="btn secondary small" type="submit">Filter</button>
      {filtered && <Link className="btn secondary small" href={`/tasks?view=${view}`}>Clear</Link>}
    </form>
    <div className="toolbar"><span>{list.length} task{list.length === 1 ? '' : 's'}{filtered ? ' (filtered)' : ''}</span><span className={overdue ? 'danger-text' : ''}>{overdue} overdue</span></div>
    {list.length === 0 ? <div className="card empty-state">{view === 'proof' ? 'Nothing waiting for a proof check.' : view === 'review' ? 'Nothing waiting for your review.' : view === 'client' ? 'Nothing waiting on a client.' : 'Nothing here.'}</div> :
      <div className="task-grid">{list.map((t) => {
        const late = isOverdue(t, now);
        const actions = availableActions(t, u).filter((a) => !a.needsNote && a.key !== 'proof_pass');
        return <div className={`card task-card ${t.status === 'DONE' ? 'done' : ''} ${late ? 'late' : ''}`} key={t.id}>
          <div className="task-top"><span className="pill">{t.client.name}</span><span className={`pill ${t.priority === 'P1' ? 'red' : t.priority === 'P2' ? 'amber' : 'green'}`}>{t.priority}</span></div>
          <h3><Link href={`/tasks/${t.id}`}>{t.desc}</Link></h3>
          <div className="muted">{t.owner.name}{t.assigner.id !== t.owner.id ? ` · from ${t.assigner.name}` : ''} · {CATEGORIES[t.category]?.label ?? t.category}</div>
          <Gates t={t} files={t._count.files} />
          <div className="task-meta"><span className={late ? 'danger-text' : ''}>{dueLabel(t.due, now, t.status === 'CLIENT' || t.status === 'DONE')}</span><span className={`pill ${t.status === 'CLIENT' || t.status === 'DONE' ? 'green' : t.status === 'BLOCKED' ? 'red' : ''}`}>{STATUS_LABEL[t.status]}</span>{t.internalReturns + t.clientReturns > 0 && <span>{t.internalReturns + t.clientReturns} revision{t.internalReturns + t.clientReturns === 1 ? '' : 's'}</span>}</div>
          {actions.length ? <TaskActionBar taskId={t.id} actions={actions} compact /> : <Link className="btn secondary small" href={`/tasks/${t.id}`}>{t.status === 'REVIEW' && t.ownerId !== u.id ? 'Open proof check' : t.status === 'APPROVAL' ? 'Open review' : 'Open'}</Link>}
        </div>;
      })}</div>}
  </div>;
}

function Gates({ t, files }: { t: { needsCopy: boolean; approvedCopy: string | null; needsProof: boolean; status: string; clientFacing: boolean; approvalLevel: string }; files: number }) {
  const order = ['OPEN', 'IN_PROGRESS', 'REVIEW', 'APPROVAL', 'CLIENT', 'DONE'];
  const at = order.indexOf(t.status === 'BLOCKED' ? 'OPEN' : t.status);
  const steps: { label: string; state: 'done' | 'now' | 'todo' }[] = [];
  if (t.needsCopy) steps.push({ label: 'Copy', state: t.approvedCopy ? 'done' : 'now' });
  steps.push({ label: files ? 'Work' : 'Work', state: at >= 2 ? 'done' : t.needsCopy && !t.approvedCopy ? 'todo' : 'now' });
  if (t.needsProof) steps.push({ label: 'Proof', state: at > 2 ? 'done' : at === 2 ? 'now' : 'todo' });
  if (t.approvalLevel !== 'L0' || t.needsProof) steps.push({ label: t.approvalLevel === 'L2' ? 'MD' : t.approvalLevel === 'L1' ? 'DMM' : 'Release', state: at > 3 ? 'done' : at === 3 ? 'now' : 'todo' });
  if (t.clientFacing) steps.push({ label: 'Client', state: at > 4 ? 'done' : at === 4 ? 'now' : 'todo' });
  return <div className="gates">{steps.map((s, i) => <span key={i} className={`gate ${s.state}`}>{s.label}</span>)}</div>;
}
