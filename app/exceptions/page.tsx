import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildExceptions, countItems, emailConfigured } from '@/lib/digest';
import { aiProofEnabled } from '@/lib/proof-ai';
import { jobStatus } from '@/lib/scheduler';
import { dateTime } from '@/lib/format';
import { SendDigest } from '@/components/ops';

const JOB_LABEL: Record<string, string> = { 'scope-generate': 'Scope tasks (6:00 AM)', checkpoints: 'Onboarding checkpoints (6:30 AM)', 'client-autoclose': 'Close client work after 3 days (7:00 AM)', 'saydo-close': 'Close Say/Do plans (6:00 PM)', snapshots: 'Evening numbers (6:05 PM)', digest: 'Exceptions email (7:00 PM)', 'month-close': 'Freeze scorecards (1st, 2:00 AM)' };

export default async function Exceptions() {
  const u = await requirePageUser();
  if (u.role !== 'MD' && u.role !== 'DMM') redirect('/today');
  const now = new Date();
  const sections = await buildExceptions(db, u, now);
  const live = sections.filter((s) => s.items.length);
  const total = countItems(sections);
  const isMD = u.role === 'MD';
  const [jobs, digests] = isMD ? await Promise.all([jobStatus(db), db.digestLog.findMany({ orderBy: { dateKey: 'desc' }, take: 7, select: { dateKey: true, items: true, emailed: true, error: true } })]) : [[], []];
  return <div className="page">
    <div className="header"><div><div className="eyebrow">EXCEPTIONS</div><h1>{total ? `${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} attention` : 'All clear'}</h1><p className="muted">Only reds. If something is green it isn’t here, and it’s running without you.{isMD ? ' The same list goes to your email at 7:00 PM on working days.' : ''}</p></div>{isMD && <SendDigest />}</div>
    {total === 0 && <div className="card clear-state"><span>✓</span><div><strong>Nothing is red</strong><p>No late client work, no Red clients, no red scorecards{isMD ? ', no overdue invoices' : ''}.</p></div></div>}
    <div className="grid2">{live.map((s) => <section className="card exception" key={s.key}>
      <div className="section-head"><div><h3>{s.title}</h3><p className="muted">{s.hint}</p></div><span className="pill red">{s.items.length}</span></div>
      <div className="priority-list">{s.items.map((i, k) => <div className="priority" key={k}><div style={{ flex: 1 }}>{i.href ? <Link className="client-link" href={i.href}><b>{i.title}</b></Link> : <b>{i.title}</b>}<div className="muted">{i.detail}</div></div></div>)}</div>
    </section>)}</div>
    {isMD && <div className="grid2" style={{ marginTop: 14 }}>
      <section className="card"><div className="section-head"><div><h3>Autopilot status</h3><p className="muted">Jobs that run by themselves. If a time has passed and a job shows nothing, tell Gopi.</p></div></div>
        <div className="detail-list">
          <div><span>AI spell check</span><b className={aiProofEnabled() ? '' : 'danger-text'}>{aiProofEnabled() ? 'On' : 'Off: needs ANTHROPIC_API_KEY'}</b></div>
          <div><span>Digest email</span><b className={emailConfigured() ? '' : 'danger-text'}>{emailConfigured() ? 'On' : 'Off: needs SMTP settings'}</b></div>
          {jobs.map((j) => <div key={j.job}><span>{JOB_LABEL[j.job] ?? j.job}</span><b>{j.last ? `${j.last.result?.startsWith('OK') ? 'Ran' : j.last.result === 'RUNNING' ? 'Running' : 'Failed'} ${dateTime(j.last.ranAt)}` : 'Not run yet'}</b></div>)}
        </div></section>
      <section className="card"><div className="section-head"><div><h3>Recent digests</h3></div></div>
        {digests.length === 0 ? <div className="empty-state">The first digest goes out at 7:00 PM on the next working day.</div> : <div className="detail-list">{digests.map((d) => <div key={d.dateKey}><span>{d.dateKey}</span><b>{d.items} item{d.items === 1 ? '' : 's'} · {d.emailed ? 'emailed' : d.error ? d.error : d.items ? 'in app only' : 'all clear, no email'}</b></div>)}</div>}
      </section>
    </div>}
  </div>;
}
