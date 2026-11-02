import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { weekKeyFor, weekLabel } from '@/lib/client-report';
import { addDaysKey } from '@/lib/workcalendar';
import { emailConfigured } from '@/lib/digest';

export default async function Reports() {
  const u = await requirePageUser('clients');
  if (u.role !== 'MD' && u.role !== 'DMM') redirect('/clients');
  const thisWeek = weekKeyFor(new Date());
  const lastWeek = addDaysKey(thisWeek, -7);
  const clients = await db.client.findMany({ where: { active: true, internal: false }, select: { id: true, name: true, email: true, reports: { orderBy: { sentAt: 'desc' }, take: 1, select: { weekKey: true, sentAt: true, sentTo: true } } }, orderBy: { name: 'asc' } });
  const sentLastWeek = clients.filter((c) => c.reports[0]?.weekKey === lastWeek).length;

  return <div className="page">
    <div className="header"><div>
      <div className="eyebrow">CLIENT REPORTING</div>
      <h1>Weekly client reports</h1>
      <p className="muted">Built from delivered tasks and the content calendar. Open a report, add a personal note, and send it, or save it as a PDF. Nothing is sent automatically.</p>
    </div></div>
    {!emailConfigured() && <div className="card warn-card"><h3>Email isn’t set up yet</h3><p className="muted">You can still open each report and use Print / Save as PDF. To send from here, add the SMTP settings (see HANDOVER, section 12).</p></div>}
    <div className="grid">
      <div className="card"><div className="label">Last week</div><div className="kpi">{sentLastWeek}/{clients.length}</div><div className="muted">reports sent for {weekLabel(lastWeek)}</div></div>
    </div>
    <div className="card" style={{ marginTop: 14 }}>
      <div className="table-wrap"><table className="table"><thead><tr><th>Client</th><th>Last sent</th><th>Reports</th></tr></thead><tbody>
        {clients.map((c) => { const last = c.reports[0]; return <tr key={c.id}>
          <td><b>{c.name}</b><div className="muted">{c.email || 'No client email set'}</div></td>
          <td>{last ? <>{weekLabel(last.weekKey)}<div className="muted">to {last.sentTo}</div></> : <span className="muted">Never</span>}</td>
          <td><div className="row-actions"><Link className={`btn small ${last?.weekKey === lastWeek ? 'secondary' : ''}`} href={`/reports/${c.id}?week=${lastWeek}`}>Last week</Link><Link className="btn secondary small" href={`/reports/${c.id}?week=${thisWeek}`}>This week so far</Link></div></td>
        </tr>; })}
      </tbody></table></div>
    </div>
  </div>;
}
