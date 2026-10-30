import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAllClientsHealthBreakdown } from '@/lib/client-health';
import ClientForm from '@/components/client-form';

export default async function Clients() {
  const u=await requirePageUser('clients');
  const now = new Date();

  const [cs, healthMap] = await Promise.all([
    db.client.findMany({
      where: { internal: false },
      orderBy: { name: 'asc' },
      include: {
        projects: true,
        tasks: true,
        invoices: true,
        meetings: true,
      },
    }),
    getAllClientsHealthBreakdown(db, undefined, now),
  ]);

  const clients = cs.map((client) => ({
    ...client,
    health: healthMap.get(client.id) ?? { score: 100, health: 'GREEN', issues: [], byOwner: {} },
  }));

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

      {u.role==='MD'&&<ClientForm isMD />}
      {u.role!=='MD'&&u.email==='aleena@markwiz.com'&&<ClientForm />}

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
