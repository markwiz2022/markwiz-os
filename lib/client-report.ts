import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db';
import { effectiveStatus, CONTENT_STATUS_LABEL } from './content';
import { addDaysKey, dayEndOfKey, dayStartOfKey, istDateKey, mondayOfKey } from './workcalendar';

/** Put your logo at public/report-logo.png and it appears on reports and report emails. */
export const LOGO_PATH = '/report-logo.png';
export const hasLogo = () => existsSync(join(process.cwd(), 'public', 'report-logo.png'));

const HIDDEN_CATEGORIES = ['SYSTEM', 'ONBOARDING'];

export function weekKeyFor(date: Date) { return mondayOfKey(istDateKey(date)); }

const dayLabel = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export function weekLabel(weekKey: string) { return `${dayLabel(weekKey)} – ${dayLabel(addDaysKey(weekKey, 6))} ${weekKey.slice(0, 4)}`; }

export type ClientReport = Awaited<ReturnType<typeof buildClientReport>>;

/** Everything a client sees in their weekly update. Internal notes, health scores and money are never included. */
export async function buildClientReport(db: Db, clientId: string, weekKey: string) {
  const start = dayStartOfKey(weekKey);
  const end = dayEndOfKey(addDaysKey(weekKey, 6));
  const nextStart = dayStartOfKey(addDaysKey(weekKey, 7));
  const nextEnd = dayEndOfKey(addDaysKey(weekKey, 13));
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, email: true, internal: true } });
  if (!client) return null;

  const visible = { clientId, category: { notIn: HIDDEN_CATEGORIES } };
  const [delivered, waiting, inProgress, nextWeek, posts, nextPosts, sent] = await Promise.all([
    db.task.findMany({ where: { ...visible, deliveredAt: { gte: start, lte: end } }, select: { id: true, desc: true, deliveredAt: true, deliverableUrl: true }, orderBy: { deliveredAt: 'asc' } }),
    db.task.findMany({ where: { ...visible, status: 'CLIENT' }, select: { id: true, desc: true, lastSentAt: true }, orderBy: { lastSentAt: 'asc' } }),
    db.task.findMany({ where: { ...visible, status: { in: ['OPEN', 'IN_PROGRESS', 'REVIEW', 'APPROVAL', 'BLOCKED'] }, due: { lte: end } }, select: { id: true, desc: true, due: true }, orderBy: { due: 'asc' } }),
    db.task.findMany({ where: { ...visible, status: { in: ['OPEN', 'IN_PROGRESS', 'REVIEW', 'APPROVAL', 'BLOCKED'] }, due: { gte: nextStart, lte: nextEnd } }, select: { id: true, desc: true, due: true }, orderBy: { due: 'asc' } }),
    db.contentPost.findMany({ where: { clientId, date: { gte: start, lte: end } }, include: { task: { select: { status: true } } }, orderBy: { date: 'asc' } }),
    db.contentPost.findMany({ where: { clientId, date: { gte: nextStart, lte: nextEnd }, status: { not: 'SKIPPED' } }, select: { date: true, platform: true, format: true, title: true }, orderBy: { date: 'asc' } }),
    db.clientReport.findMany({ where: { clientId, weekKey }, orderBy: { sentAt: 'desc' }, take: 5 }),
  ]);

  return {
    client, weekKey, label: weekLabel(weekKey),
    delivered: delivered.map((t) => ({ title: t.desc, date: t.deliveredAt ? istDateKey(t.deliveredAt) : null, link: t.deliverableUrl })),
    waiting: waiting.map((t) => ({ title: t.desc, since: t.lastSentAt ? istDateKey(t.lastSentAt) : null })),
    inProgress: inProgress.map((t) => ({ title: t.desc, due: istDateKey(t.due) })),
    nextWeek: nextWeek.map((t) => ({ title: t.desc, due: istDateKey(t.due) })),
    posts: posts.map((p) => ({ date: p.date.toISOString().slice(0, 10), platform: p.platform, format: p.format, title: p.title, status: CONTENT_STATUS_LABEL[effectiveStatus(p, p.task?.status)], link: p.postedUrl })),
    nextPosts: nextPosts.map((p) => ({ date: p.date.toISOString().slice(0, 10), platform: p.platform, format: p.format, title: p.title })),
    sent,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? esc(u) : null);

/**
 * Email- and print-safe HTML (inline styles, light background). Plain language; no internal numbers.
 * appUrl is only used for the logo.
 */
export function renderClientReportHtml(r: NonNullable<ClientReport>, opts: { note?: string; senderName?: string; appUrl?: string; logo?: boolean } = {}) {
  const h2 = (t: string) => `<h2 style="font:600 15px Arial,sans-serif;color:#1d1b3a;margin:22px 0 8px;border-bottom:1px solid #e6e4f2;padding-bottom:6px">${t}</h2>`;
  const li = (main: string, side?: string | null) => `<li style="margin:0 0 7px;font:14px/1.5 Arial,sans-serif;color:#2b2b38">${main}${side ? ` <span style="color:#7a7890">· ${side}</span>` : ''}</li>`;
  const ul = (items: string[]) => `<ul style="padding-left:18px;margin:0">${items.join('')}</ul>`;
  const empty = (t: string) => `<p style="font:14px Arial,sans-serif;color:#7a7890;margin:0">${t}</p>`;
  const link = (title: string, url: string | null) => { const u = safeUrl(url); return u ? `<a href="${u}" style="color:#5b50c9">${esc(title)}</a>` : esc(title); };
  const logo = opts.logo ? `<img src="${esc((opts.appUrl ?? '').replace(/\/$/, ''))}${LOGO_PATH}" alt="Markwiz" style="height:34px;margin-bottom:10px">` : `<div style="font:800 16px Arial,sans-serif;letter-spacing:1px;color:#5b50c9;margin-bottom:8px">MARKWIZ</div>`;

  const parts = [
    `<div style="max-width:640px;margin:0 auto;padding:28px 24px;background:#ffffff">`,
    logo,
    `<h1 style="font:700 21px Arial,sans-serif;color:#1d1b3a;margin:0 0 4px">Weekly update · ${esc(r.client.name)}</h1>`,
    `<div style="font:13px Arial,sans-serif;color:#7a7890">${esc(r.label)}</div>`,
    opts.note?.trim() ? `<p style="font:14px/1.6 Arial,sans-serif;color:#2b2b38;margin:18px 0 0;white-space:pre-line">${esc(opts.note.trim())}</p>` : `<p style="font:14px/1.6 Arial,sans-serif;color:#2b2b38;margin:18px 0 0">Here’s what we worked on this week and what’s coming up next.</p>`,
    h2('Delivered this week'),
    r.delivered.length ? ul(r.delivered.map((d) => li(link(d.title, d.link), d.date ? dayLabel(d.date) : null))) : empty('Nothing was handed over this week.'),
  ];
  if (r.waiting.length) parts.push(h2('Waiting on your feedback'), ul(r.waiting.map((w) => li(esc(w.title), w.since ? `sent ${dayLabel(w.since)}` : null))));
  if (r.posts.length) parts.push(h2('Content this week'), ul(r.posts.map((p) => li(`${link(p.title, p.link)}`, `${p.platform} ${p.format.toLowerCase()} · ${dayLabel(p.date)} · ${p.status.toLowerCase()}`))));
  parts.push(h2('In progress'), r.inProgress.length ? ul(r.inProgress.map((t) => li(esc(t.title)))) : empty('Nothing outstanding.'));
  const coming = [...r.nextWeek.map((t) => li(esc(t.title), dayLabel(t.due))), ...r.nextPosts.map((p) => li(esc(p.title), `${p.platform} ${p.format.toLowerCase()} · ${dayLabel(p.date)}`))];
  parts.push(h2('Coming up next week'), coming.length ? ul(coming) : empty('We’ll share the plan for next week shortly.'));
  parts.push(
    `<p style="font:14px/1.6 Arial,sans-serif;color:#2b2b38;margin:24px 0 0">If anything needs changing, just reply to this email.${opts.senderName ? `<br>${esc(opts.senderName)}` : ''}<br>Markwiz</p>`,
    `</div>`,
  );
  return parts.join('\n');
}

export function renderClientReportText(r: NonNullable<ClientReport>, note?: string) {
  const lines = [`Weekly update · ${r.client.name}`, r.label, '', note?.trim() || 'Here’s what we worked on this week and what’s coming up next.', '', 'Delivered this week:'];
  lines.push(...(r.delivered.length ? r.delivered.map((d) => `- ${d.title}${d.link ? ` (${d.link})` : ''}`) : ['- Nothing was handed over this week.']));
  if (r.waiting.length) lines.push('', 'Waiting on your feedback:', ...r.waiting.map((w) => `- ${w.title}`));
  if (r.posts.length) lines.push('', 'Content this week:', ...r.posts.map((p) => `- ${p.title} (${p.platform}, ${p.status.toLowerCase()})`));
  lines.push('', 'In progress:', ...(r.inProgress.length ? r.inProgress.map((t) => `- ${t.title}`) : ['- Nothing outstanding.']));
  lines.push('', 'Coming up next week:', ...([...r.nextWeek.map((t) => `- ${t.title} (${t.due})`), ...r.nextPosts.map((p) => `- ${p.title} (${p.platform}, ${p.date})`)].length ? [...r.nextWeek.map((t) => `- ${t.title} (${t.due})`), ...r.nextPosts.map((p) => `- ${p.title} (${p.platform}, ${p.date})`)] : ['- Plan to follow.']));
  lines.push('', 'If anything needs changing, just reply to this email.', 'Markwiz');
  return lines.join('\n');
}
