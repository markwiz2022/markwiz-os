import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard, isLead } from '@/lib/api';
import { audit } from '@/lib/audit';
import { emailConfigured, transport } from '@/lib/digest';
import { buildClientReport, hasLogo, renderClientReportHtml, renderClientReportText } from '@/lib/client-report';

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** POST { clientId, weekKey, to, note? } — emails the weekly report to the client. MD or DMM, never automatic. */
export async function POST(req: Request) {
  const g = await guard('clients'); if (g.error) return g.error;
  const u = g.user!;
  if (!isLead(u.role)) return NextResponse.json({ error: 'Only the MD or DMM can send client reports.' }, { status: 403 });
  if (!emailConfigured()) return NextResponse.json({ error: 'Email isn’t set up yet (SMTP settings). Use Print / Save as PDF and send it yourself for now.' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.weekKey || ''))) return NextResponse.json({ error: 'Invalid week' }, { status: 400 });
  const to = String(b.to || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!to.length || to.some((x) => !EMAIL.test(x))) return NextResponse.json({ error: 'Enter valid email address(es), separated by commas.' }, { status: 400 });
  const report = await buildClientReport(db, String(b.clientId || ''), String(b.weekKey));
  if (!report || report.client.internal) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const note = b.note ? String(b.note).slice(0, 2000) : '';
  try {
    await transport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'reports@markwiz.com',
      replyTo: u.email,
      to: to.join(', '),
      subject: `Weekly update · ${report.client.name} · ${report.label}`,
      html: renderClientReportHtml(report, { note, senderName: u.name, appUrl: process.env.APP_URL, logo: hasLogo() && !!process.env.APP_URL }),
      text: renderClientReportText(report, note),
    });
  } catch (e) {
    return NextResponse.json({ error: `Email failed: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown error'}` }, { status: 502 });
  }
  const log = await db.clientReport.create({ data: { clientId: report.client.id, weekKey: report.weekKey, sentTo: to.join(', '), sentById: u.id, note: note || null } });
  await audit(u.id, 'SEND', 'ClientReport', log.id, { client: report.client.name, week: report.weekKey, to: to.join(', ') });
  return NextResponse.json({ ok: true, sentTo: to });
}
