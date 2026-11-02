import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditWhere, describeMetadata, type AuditFilters } from '@/lib/audit-query';

const PAGE_SIZE = 50;

export default async function Audit({ searchParams }: { searchParams: Promise<AuditFilters & { page?: string }> }) {
  const u = await requirePageUser();
  if (u.role !== 'MD') redirect('/');
  const sp = await searchParams;
  const f: AuditFilters = { user: sp.user || undefined, action: sp.action || undefined, entity: sp.entity || undefined, from: sp.from || undefined, to: sp.to || undefined, q: sp.q?.trim() || undefined };
  const page = Math.max(1, Number(sp.page) || 1);
  const where = auditWhere(f);

  const [logs, total, users, actions, entities] = await Promise.all([
    db.auditLog.findMany({ where, include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.auditLog.count({ where }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    db.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    Object.entries({ ...f, ...extra }).forEach(([k, v]) => { if (v !== undefined && v !== '') p.set(k, String(v)); });
    return p.toString();
  };
  const filtered = Object.values(f).some(Boolean);

  return <div className="page">
    <div className="header"><div><div className="eyebrow">CONTROL & GOVERNANCE</div><h1>Audit Trail</h1><p className="muted">Every recorded change, newest first. {total.toLocaleString('en-IN')} entr{total === 1 ? 'y' : 'ies'}{filtered ? ' match your filters' : ''}.</p></div>
      <div className="hero-status"><a className="btn secondary small" href={`/api/audit/export?${qs({})}`}>Export (CSV)</a></div></div>

    <form className="card filter-bar" method="get" action="/audit">
      <select name="user" defaultValue={f.user ?? ''}><option value="">Everyone</option><option value="system">System</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select name="action" defaultValue={f.action ?? ''}><option value="">All actions</option>{actions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}</select>
      <select name="entity" defaultValue={f.entity ?? ''}><option value="">All areas</option>{entities.map((e) => <option key={e.entity} value={e.entity}>{e.entity}</option>)}</select>
      <label className="inline-label">From<input type="date" name="from" defaultValue={f.from ?? ''} /></label>
      <label className="inline-label">To<input type="date" name="to" defaultValue={f.to ?? ''} /></label>
      <input name="q" defaultValue={f.q ?? ''} placeholder="Record ID or text" />
      <button className="btn secondary small" type="submit">Filter</button>
      {filtered && <Link className="btn secondary small" href="/audit">Clear</Link>}
    </form>

    <div className="card" style={{ marginTop: 14 }}>
      {logs.length === 0 ? <div className="empty-state">Nothing recorded{filtered ? ' for these filters' : ''}.</div> :
        <table className="table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Area</th><th>What changed</th></tr></thead><tbody>
          {logs.map((log) => <tr key={log.id}>
            <td>{new Date(log.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
            <td>{log.user?.name || 'System'}<div className="muted">{log.user?.role || '—'}</div></td>
            <td><span className={`pill ${log.action === 'DELETE' ? 'red' : log.action === 'LOGIN_FAILED' ? 'amber' : ''}`}>{log.action}</span></td>
            <td>{log.entity}<div className="muted">{log.entityId || '—'}</div></td>
            <td className="audit-detail">{describeMetadata(log.metadata) || '—'}</td>
          </tr>)}
        </tbody></table>}
      {pages > 1 && <div className="pager">
        {page > 1 ? <Link className="btn secondary small" href={`/audit?${qs({ page: page - 1 })}`}>← Newer</Link> : <span />}
        <span className="muted">Page {page} of {pages}</span>
        {page < pages ? <Link className="btn secondary small" href={`/audit?${qs({ page: page + 1 })}`}>Older →</Link> : <span />}
      </div>}
    </div>
  </div>;
}
