import nodemailer from 'nodemailer';
import type { Db } from './db';
import { getClientHealthBreakdown } from './client-health';
import { computeScorecard } from './kpi';
import { canSeeScorecard, mdUsers, notify } from './team';
import { STATUS_LABEL } from './task-flow';
import { istDateKey, isPastDue, monthKeyIST, shortKeyLabel, workingDaysBetweenKeys } from './workcalendar';

// Only reds. If it's green, it isn't here.

export type DigestItem = { title: string; detail: string; href?: string };
export type DigestSection = { key: string; title: string; hint: string; items: DigestItem[] };

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const SALES_METRICS = ['touches', 'meetings', 'meetings_month', 'proposals', 'closes', 'closes_quarter', 'company_closes'];

export async function buildExceptions(db: Db, viewer: { id: string; role: string }, now = new Date()): Promise<DigestSection[]> {
  const isMD = viewer.role === 'MD';
  const today = istDateKey(now);
  const sections: DigestSection[] = [];

  // 1. Late client work
  const late = await db.task.findMany({
    where: { status: { notIn: ['CLIENT', 'DONE'] }, clientFacing: true, client: { internal: false }, due: { lt: now } },
    include: { client: { select: { name: true } }, owner: { select: { name: true } } },
    orderBy: { due: 'asc' },
  });
  sections.push({
    key: 'late', title: 'Late client work', hint: 'Past due and not yet with the client. The owner and DMM were told when it went late.',
    items: late.filter((t) => isPastDue(t.due, now)).slice(0, 30).map((t) => {
      const days = Math.max(1, workingDaysBetweenKeys(istDateKey(t.due), today));
      return { title: t.desc, detail: `${t.client.name} · ${t.owner.name} · ${days} working day${days === 1 ? '' : 's'} late · ${STATUS_LABEL[t.status] ?? t.status}${t.escalatedAt ? ' · escalated' : ''}`, href: `/tasks/${t.id}` };
    }),
  });

  // 2. Stuck in checks for more than a working day
  const inChecks = await db.task.findMany({ where: { status: { in: ['REVIEW', 'APPROVAL'] } }, include: { client: { select: { name: true } }, owner: { select: { name: true } } } });
  const stuck: DigestItem[] = [];
  for (const t of inChecks) {
    const entered = await db.taskEvent.findFirst({ where: { taskId: t.id, type: { in: t.status === 'REVIEW' ? ['HANDED_IN'] : ['HANDED_IN', 'PROOF_PASSED'] } }, orderBy: { createdAt: 'desc' } });
    const since = entered?.createdAt ?? t.updatedAt;
    const days = workingDaysBetweenKeys(istDateKey(since), today);
    if (days >= 1) stuck.push({ title: t.desc, detail: `${t.client.name} · ${STATUS_LABEL[t.status]} for ${days} working day${days === 1 ? '' : 's'} · made by ${t.owner.name}`, href: `/tasks/${t.id}` });
  }
  sections.push({ key: 'stuck', title: 'Stuck in proof check or review', hint: 'Handed in more than a working day ago and still waiting on a checker.', items: stuck });

  // 3. Red clients
  const clients = await db.client.findMany({ where: { active: true, internal: false }, select: { id: true, name: true } });
  const red: DigestItem[] = [];
  for (const c of clients) {
    const h = await getClientHealthBreakdown(db, c.id, now);
    if (h.health !== 'RED') continue;
    const reasons = h.issues.filter((i) => isMD || i.kind !== 'INVOICE').slice(0, 3).map((i) => `${i.reason}: ${i.task}`);
    red.push({ title: `${c.name} · ${h.score}/100`, detail: reasons.join(' · ') || 'Several small issues', href: `/clients/${c.id}` });
  }
  sections.push({ key: 'red_clients', title: 'Red clients', hint: 'Health below 50, from overdue work, errors, complaints and late payments.', items: red });

  // 4. Errors and complaints in the last 7 days
  const incidents = await db.incident.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } }, include: { client: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  const typeLabel: Record<string, string> = { ERROR: 'Error reached the client', COMPLAINT: 'Complaint', BUG: 'Client-reported bug' };
  sections.push({ key: 'incidents', title: 'Errors and complaints this week', hint: 'Logged after something reached a client.', items: incidents.map((i) => ({ title: `${typeLabel[i.type] ?? i.type} · ${i.client.name}`, detail: `${i.description} · ${shortKeyLabel(istDateKey(i.createdAt))}`, href: i.taskId ? `/tasks/${i.taskId}` : `/clients/${i.client.id}` })) });

  // 5. Red scorecards (and sales behind pace for the MD)
  const people = await db.user.findMany({ where: { active: true, kpiTargets: { some: { active: true } } }, select: { id: true, name: true, role: true, seat: true, joiningDate: true } });
  const monthKey = monthKeyIST(now);
  const memoMap = new Map<string, Promise<unknown>>();
  const redCards: DigestItem[] = [];
  const sales: DigestItem[] = [];
  for (const p of people) {
    if (!canSeeScorecard(viewer, p)) continue;
    const card = await computeScorecard(db, p, monthKey, now, memoMap);
    const reds = card.rows.filter((r) => r.rating === 'RED');
    if (card.overall === 'RED') redCards.push({ title: `${p.name} · red month so far`, detail: reds.map((r) => `${r.label} ${r.display} (target ${r.targetDisplay})`).join(' · '), href: `/scorecards?user=${p.id}` });
    if (isMD) for (const r of reds.filter((x) => SALES_METRICS.includes(x.metric))) sales.push({ title: `${p.name} · ${r.label}`, detail: `${r.display}${r.pace ? ` (${r.pace})` : ''} against ${r.targetDisplay}`, href: `/scorecards?user=${p.id}` });
  }
  sections.push({ key: 'scorecards', title: 'Red scorecards', hint: 'Two or more KPIs red this month.', items: redCards });
  if (isMD) sections.push({ key: 'sales', title: 'Sales behind pace', hint: 'Pipeline activity below the pace needed for this month’s targets.', items: sales });

  // 6. Overdue receivables (MD only)
  if (isMD) {
    const invoices = await db.invoice.findMany({ where: { status: { not: 'DRAFT' } }, include: { client: { select: { id: true, name: true } } }, orderBy: { dueDate: 'asc' } });
    sections.push({
      key: 'receivables', title: 'Overdue receivables', hint: 'Unpaid past the due date.',
      items: invoices.filter((i) => i.amount > i.paid && isPastDue(i.dueDate, now)).map((i) => ({ title: `${i.client.name} · ${money(i.amount - i.paid)}`, detail: `Invoice ${i.number} · due ${shortKeyLabel(istDateKey(i.dueDate))}`, href: `/clients/${i.client.id}` })),
    });
  }

  // 7. Waiting on the MD
  if (isMD) {
    const dmmCount = await db.user.count({ where: { active: true, role: 'DMM' } });
    const [releases, leave, regs, confirms, flags] = await Promise.all([
      db.task.findMany({ where: { status: 'APPROVAL', OR: [{ approvalLevel: 'L2' }, ...(dmmCount ? [] : [{ approvalLevel: 'L1' }])] }, include: { client: { select: { name: true } } } }),
      db.leaveRequest.count({ where: { status: 'PENDING' } }),
      db.regularisationRequest.count({ where: { status: 'PENDING' } }),
      db.onboardingCheckpoint.findMany({ where: { result: 'CONFIRM' }, include: { user: { select: { id: true, name: true } } } }),
      db.performanceFlag.findMany({ where: { status: 'OPEN' }, include: { user: { select: { id: true, name: true } } } }),
    ]);
    const items: DigestItem[] = [
      ...releases.map((t) => ({ title: `Release: ${t.desc}`, detail: `${t.client.name} · ${t.approvalLevel} review`, href: `/tasks/${t.id}` })),
      ...(leave ? [{ title: `${leave} leave request${leave === 1 ? '' : 's'}`, detail: 'Waiting for approval', href: '/people' }] : []),
      ...(regs ? [{ title: `${regs} attendance regularisation${regs === 1 ? '' : 's'}`, detail: 'Waiting for approval', href: '/people' }] : []),
      ...confirms.map((c) => ({ title: `Confirm ${c.user.name}'s day ${c.day} checkpoint`, detail: c.passLine, href: `/scorecards?user=${c.user.id}` })),
      ...flags.map((f) => ({ title: `${f.type === 'PIP' ? 'PIP flag' : 'Bonus flag'}: ${f.user.name}`, detail: f.note, href: `/scorecards?user=${f.user.id}` })),
    ];
    sections.push({ key: 'waiting', title: 'Waiting on you', hint: 'Only things that need your decision.', items });
  }

  // 8. Onboarding checkpoints missed in the last 14 days
  const missed = await db.onboardingCheckpoint.findMany({ where: { result: 'MISS', evaluatedAt: { gte: new Date(now.getTime() - 14 * 86400000) } }, include: { user: { select: { id: true, name: true, role: true, seat: true } } } });
  sections.push({ key: 'onboarding', title: 'Onboarding checkpoints missed', hint: 'A pass line decided in advance was not met.', items: missed.filter((m) => canSeeScorecard(viewer, m.user)).map((m) => ({ title: `${m.user.name} · day ${m.day}`, detail: m.passLine, href: `/scorecards?user=${m.user.id}` })) });

  return sections;
}

export function countItems(sections: DigestSection[]) { return sections.reduce((s, x) => s + x.items.length, 0); }

function escapeHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

export function renderDigest(sections: DigestSection[], dateLabel: string, appUrl?: string) {
  const live = sections.filter((s) => s.items.length);
  const total = countItems(sections);
  const link = (href?: string) => (appUrl && href ? `${appUrl.replace(/\/$/, '')}${href}` : '');
  const text = [`Markwiz exceptions for ${dateLabel}: ${total} item${total === 1 ? '' : 's'}`, '', ...live.flatMap((s) => [`${s.title.toUpperCase()} (${s.items.length})`, ...s.items.map((i) => `- ${i.title}\n  ${i.detail}${link(i.href) ? `\n  ${link(i.href)}` : ''}`), ''])].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f8;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e3e6ee;border-radius:12px;padding:24px">
<div style="font-size:12px;color:#6b7385;margin-bottom:4px">Markwiz OS · ${escapeHtml(dateLabel)}</div>
<h1 style="font-size:20px;margin:0 0 6px">${total ? `${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} attention` : 'All clear'}</h1>
<p style="font-size:13px;color:#6b7385;margin:0 0 18px">Only reds. Anything green is running without you.</p>
${live.map((s) => `<h2 style="font-size:14px;margin:18px 0 8px;color:#b4233a">${escapeHtml(s.title)} (${s.items.length})</h2>
<table role="presentation" style="width:100%;border-collapse:collapse">${s.items.map((i) => `<tr><td style="padding:8px 0;border-top:1px solid #eef0f4;font-size:13px"><strong>${link(i.href) ? `<a href="${escapeHtml(link(i.href))}" style="color:#1d2433">${escapeHtml(i.title)}</a>` : escapeHtml(i.title)}</strong><br><span style="color:#6b7385">${escapeHtml(i.detail)}</span></td></tr>`).join('')}</table>`).join('')}
</div></body></html>`;
  return { text, html, total };
}

export function emailConfigured() { return !!process.env.SMTP_HOST; }

function transport() {
  if (process.env.SMTP_HOST === 'test') return nodemailer.createTransport({ jsonTransport: true });
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/** The 7 PM digest. Skips the email when nothing is red, unless forced. */
export async function sendDailyDigest(db: Db, now = new Date(), opts: { force?: boolean } = {}) {
  const mds = await mdUsers(db);
  const md = mds[0];
  if (!md) return { items: 0, emailed: false, note: 'No MD account' };
  const dateKey = istDateKey(now);
  const sections = await buildExceptions(db, { id: md.id, role: 'MD' }, now);
  const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
  const { text, html, total } = renderDigest(sections, dateLabel, process.env.APP_URL);
  let emailed = false; let error: string | null = null;
  const sendWhenClear = process.env.DIGEST_SEND_WHEN_CLEAR === 'true';
  if ((total > 0 || opts.force || sendWhenClear) && emailConfigured()) {
    try {
      const to = process.env.DIGEST_TO || mds.map((m) => m.email).join(',');
      const info = await transport().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER || 'markwiz-os@localhost', to, subject: `Markwiz exceptions · ${dateLabel} · ${total ? `${total} item${total === 1 ? '' : 's'}` : 'all clear'}`, text, html });
      emailed = !!info;
    } catch (e) { error = e instanceof Error ? e.message.slice(0, 300) : 'Email failed'; }
  } else if (!emailConfigured()) error = total ? 'Email not set up (SMTP_HOST missing). Shown in the app only.' : null;
  await db.digestLog.upsert({ where: { dateKey }, update: { items: total, html, text, emailed, error }, create: { dateKey, items: total, html, text, emailed, error } });
  if (total > 0) await notify(db, mds.map((m) => m.id), `Today's exceptions: ${total}`, `${sections.filter((s) => s.items.length).map((s) => `${s.title}: ${s.items.length}`).join(' · ')}. Open Exceptions for the list.`);
  return { items: total, emailed, error };
}
