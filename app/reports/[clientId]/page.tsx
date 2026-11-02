import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildClientReport, hasLogo, renderClientReportHtml, weekKeyFor, weekLabel } from '@/lib/client-report';
import { emailConfigured } from '@/lib/digest';
import { addDaysKey, mondayOfKey } from '@/lib/workcalendar';
import { PrintButton, SendReport } from '@/components/report-actions';

export default async function ClientReportPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ week?: string }> }) {
  const u = await requirePageUser('clients');
  if (u.role !== 'MD' && u.role !== 'DMM') redirect('/clients');
  const { clientId } = await params;
  const sp = await searchParams;
  const thisWeek = weekKeyFor(new Date());
  const week = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOfKey(sp.week) : addDaysKey(thisWeek, -7);
  const report = await buildClientReport(db, clientId, week);
  if (!report || report.client.internal) notFound();
  // Same HTML as the email. All values are escaped when it is built.
  const html = renderClientReportHtml(report, { senderName: u.name, appUrl: '', logo: hasLogo() });

  return <div className="page">
    <div className="header no-print"><div>
      <Link href="/reports" className="back">← All reports</Link>
      <div className="eyebrow">WEEKLY CLIENT REPORT</div>
      <h1>{report.client.name}</h1>
      <p className="muted">{weekLabel(week)}. This is exactly what the client receives (your personal note replaces the opening line).</p>
    </div>
      <div className="hero-status">
        <Link className="btn secondary small" href={`/reports/${clientId}?week=${addDaysKey(week, -7)}`}>← Week before</Link>
        {week < thisWeek && <Link className="btn secondary small" href={`/reports/${clientId}?week=${addDaysKey(week, 7)}`}>Week after →</Link>}
      </div></div>

    <div className="card no-print report-toolbar">
      <div className="row-actions"><PrintButton /><SendReport clientId={clientId} weekKey={week} defaultTo={report.client.email ?? ''} emailReady={emailConfigured()} /></div>
      {report.sent.length > 0 && <p className="muted">Already sent for this week: {report.sent.map((s) => `${new Date(s.sentAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })} to ${s.sentTo}`).join(' · ')}</p>}
      {!report.client.email && <p className="muted">No client email on file. Add it with Edit client on the client page.</p>}
    </div>

    <div className="report-paper">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </div>;
}
