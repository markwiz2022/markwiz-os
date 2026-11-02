import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getClientHealthBreakdown } from '@/lib/client-health';
import ClientForm from '@/components/client-form';
import ClientEdit from '@/components/client-edit';
import Link from 'next/link';
import { canCreateClients } from '@/lib/settings';

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; health?: string }> }) {
  const u=await requirePageUser('clients');
  const sp=await searchParams;
  const q=(sp.q??'').trim().toLowerCase();
  const fHealth=['GREEN','AMBER','RED'].includes(sp.health??'')?sp.health!:'';
  const canAdd=await canCreateClients(u);

  const cs = await db.client.findMany({
    where: { internal: false },
    orderBy: { name: 'asc' },
    include: {
      projects: true,
      tasks: true,
      invoices: true,
      meetings: true,
    },
  });

  const allClients = await Promise.all(
    cs.map(async (client) => {
      const health = await getClientHealthBreakdown(db, client.id);

      return {
        ...client,
        health,
      };
    })
  );
  const clients = allClients.filter((c) =>
    (!q || [c.name, c.company, c.industry, c.accountManager].some((v) => v?.toLowerCase().includes(q))) &&
    (!fHealth || c.health.health === fHealth));
  const filtered = Boolean(q || fHealth);

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="eyebrow">ACCOUNT MANAGEMENT</div>
          <h1>Clients</h1>
          <p className="muted">
            Single source of truth for every account.
          </p>
        </div>
      </div>

      {canAdd&&<ClientForm isMD={u.role==='MD'} />}

      <form className="card filter-bar" method="get" action="/clients" style={{ marginBottom: 14 }}>
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Search client, company, industry or manager" />
        <select name="health" defaultValue={fHealth}><option value="">Any health</option><option value="RED">Red</option><option value="AMBER">Amber</option><option value="GREEN">Green</option></select>
        <button className="btn secondary small" type="submit">Filter</button>
        {filtered && <Link className="btn secondary small" href="/clients">Clear</Link>}
        <span className="muted">{clients.length} of {allClients.length} clients</span>
      </form>
      {clients.length===0&&<div className="card empty-state">{filtered?'No clients match these filters.':'No clients yet.'}</div>}

      <div className="grid2">
        {clients.map((c) => {
          const issues = c.health.issues;
          const owners = Object.values(c.health.byOwner);

          return (
            <div className="card" key={c.id}>
              <div className="section-head">
                <div>
                  <h3>
                    <a
                      className="client-link"
                      href={`/clients/${c.id}`}
                    >
                      {c.name}
                    </a>
                  </h3>

                  <p className="muted">
                    {c.company || 'No company name'} ·{' '}
                    {c.industry || 'No industry'}
                  </p>
                </div>

                <span
                  className={`pill ${c.health.health.toLowerCase()}`}
                >
                  {c.health.health} · {c.health.score}
                </span>
              </div>

              <ClientEdit
                isMD={u.role==='MD'}
                client={{
                  id: c.id,
                  name: c.name,
                  company: c.company,
                  industry: c.industry,
                  accountManager: c.accountManager,
                  notes: c.notes,
                  email: c.email,
                  phone: c.phone,
                  website: c.website,
                  retainer: c.retainer,
                  renewalDate: c.renewalDate ? new Date(c.renewalDate).toISOString() : null,
                }}
              />

              {u.role==='MD'&&<div className="muted" style={{ marginBottom: 14 }}>{c.email || 'No email'} · {c.website || 'No website'}</div>}

              <div className="summary-grid compact">
                {u.role==='MD'&&<div><b>₹{c.retainer.toLocaleString('en-IN')}</b><span>monthly retainer</span></div>}

                <div>
                  <b>{c.projects.length}</b>
                  <span>projects</span>
                </div>

                <div>
                  <b>
                    {c.tasks.filter(
                      (t) => t.status !== 'DONE' && t.status !== 'CLIENT'
                    ).length}
                  </b>
                  <span>open tasks</span>
                </div>

                {u.role==='MD'&&<div><b>₹{c.invoices.reduce((s,i)=>s+(i.amount-i.paid),0).toLocaleString('en-IN')}</b><span>receivable</span></div>}
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="section-head">
                  <div>
                    <h3>Why is health down?</h3>
                  </div>

                  <span className="muted">
                    {issues.length} issue
                    {issues.length === 1 ? '' : 's'}
                  </span>
                </div>

                {issues.length === 0 ? (
                  <div className="priority">
                    <div>
                      <strong>
                        No outstanding health issues
                      </strong>
                      <div className="muted">
                        All current tasks are completed or on track.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="priority-list">
                    {issues.filter((issue) => u.role === 'MD' || issue.kind !== 'INVOICE').map((issue) => (
                      <div
                        className="priority"
                        key={issue.id}
                      >
                        <div style={{ flex: 1 }}>
                          <strong>{issue.reason}</strong>

                          <div style={{ marginTop: 4 }}>
                            {issue.task}
                          </div>

                          <div
                            className="muted"
                            style={{ marginTop: 5 }}
                          >
                            Responsible:{' '}
                            <strong>
                              {issue.ownerName}
                            </strong>
                            {' · '}
                            {issue.ownerRole}
                          </div>

                          <div
                            className="muted"
                            style={{ marginTop: 3 }}
                          >
                            Due:{' '}
                            {new Date(
                              issue.due
                            ).toLocaleDateString('en-IN')}
                            {' · '}
                            Status: {issue.status}
                          </div>
                        </div>

                        <span className="pill red">
                          -{issue.deduction}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {owners.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="section-head">
                    <h3>Team impact</h3>
                  </div>

                  <div className="detail-list">
                    {owners.map((owner) => (
                      <div key={owner.ownerId || 'unassigned'}>
                        <span>
                          {owner.ownerName}
                          <br />
                          <small>
                            {owner.ownerRole}
                          </small>
                        </span>

                        <strong className="danger-text">
                          -{owner.deduction} health
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="client-foot">
                <span>
                  Account manager:{' '}
                  {c.accountManager || 'Unassigned'}
                </span>

                <span>
                  Renewal:{' '}
                  {c.renewalDate
                    ? new Date(
                        c.renewalDate
                      ).toLocaleDateString('en-IN')
                    : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
