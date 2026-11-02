import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { NewPostForm, PostCard } from '@/components/content-calendar';
import { CONTENT_STATUSES, CONTENT_STATUS_LABEL, effectiveStatus } from '@/lib/content';
import { parseMonthKey } from '@/lib/csv';
import { istDateKey, lastDayOfMonth, monthKeyIST, monthKeyOffset, monthLabel } from '@/lib/workcalendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function ContentCalendar({ searchParams }: { searchParams: Promise<{ client?: string; month?: string }> }) {
  const u = await requirePageUser('clients');
  const lead = u.role === 'MD' || u.role === 'DMM';
  const sp = await searchParams;
  const now = new Date();
  const month = parseMonthKey(sp.month) ?? monthKeyIST(now);
  const clients = await db.client.findMany({ where: { active: true, internal: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const clientId = clients.some((c) => c.id === sp.client) ? sp.client! : '';
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(`${month}-${String(lastDayOfMonth(month)).padStart(2, '0')}T23:59:59Z`);

  const [posts, people] = await Promise.all([
    db.contentPost.findMany({ where: { date: { gte: start, lte: end }, ...(clientId ? { clientId } : {}) }, include: { client: { select: { name: true } }, task: { select: { id: true, status: true, ownerId: true, owner: { select: { name: true } } } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const views = posts.map((p) => ({
    id: p.id, date: p.date.toISOString().slice(0, 10), platform: p.platform, format: p.format, title: p.title, caption: p.caption, notes: p.notes,
    status: effectiveStatus(p, p.task?.status), postedUrl: p.postedUrl, clientName: p.client.name, ownerId: p.task?.ownerId ?? null,
    task: p.task ? { id: p.task.id, owner: p.task.owner.name, status: p.task.status } : null,
  }));
  const counts = CONTENT_STATUSES.map((s) => ({ s, n: views.filter((v) => v.status === s).length })).filter((x) => x.n > 0);
  const notStarted = views.filter((v) => v.status === 'PLANNED' && !v.task && v.date <= istDateKey(new Date(now.getTime() + 5 * 86400000)));

  // Month grid, Monday first.
  const first = new Date(`${month}-01T12:00:00Z`);
  const lead0 = (first.getUTCDay() + 6) % 7;
  const days = lastDayOfMonth(month);
  const cells: (string | null)[] = [...Array(lead0).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const todayKey = istDateKey(now);
  const qs = (m: string, c = clientId) => `/content?month=${m}${c ? `&client=${c}` : ''}`;
  const defaultDate = month === monthKeyIST(now) ? todayKey : `${month}-01`;

  return <div className="page">
    <div className="header"><div>
      <div className="eyebrow">CONTENT CALENDAR · {monthLabel(month).toUpperCase()}</div>
      <h1>Content calendar</h1>
      <p className="muted">Every planned post by date. A post’s design task updates its status, so the calendar stays current without double entry.</p>
    </div>
      <div className="hero-status">
        <Link className="btn secondary small" href={qs(monthKeyOffset(month, -1))}>← {monthLabel(monthKeyOffset(month, -1)).split(' ')[0]}</Link>
        <Link className="btn secondary small" href={qs(monthKeyOffset(month, 1))}>{monthLabel(monthKeyOffset(month, 1)).split(' ')[0]} →</Link>
        {clientId && <a className="btn secondary small" href={`/api/content/export?client=${clientId}&month=${month}`}>Export plan (CSV)</a>}
      </div></div>

    <form className="card filter-bar" method="get" action="/content">
      <input type="hidden" name="month" value={month} />
      <select name="client" defaultValue={clientId}><option value="">All clients</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn secondary small" type="submit">Show</button>
      <span className="muted">{views.length} post{views.length === 1 ? '' : 's'}{counts.length ? ` · ${counts.map((c) => `${c.n} ${CONTENT_STATUS_LABEL[c.s].toLowerCase()}`).join(' · ')}` : ''}</span>
    </form>

    {lead && notStarted.length > 0 && <div className="card warn-card"><h3>{notStarted.length} post{notStarted.length === 1 ? '' : 's'} due within 5 days with no design task</h3><p className="muted">{notStarted.slice(0, 5).map((v) => `${v.clientName}: ${v.title}`).join(' · ')}{notStarted.length > 5 ? '…' : ''}</p></div>}

    {lead && clients.length > 0 && <div style={{ margin: '12px 0' }}><NewPostForm clients={clients} defaultClientId={clientId} defaultDate={defaultDate} /></div>}

    <div className="card cal-grid-card">
      <div className="cal-grid">
        {WEEKDAYS.map((d) => <div key={d} className="cal-head">{d}</div>)}
        {cells.map((key, i) => key === null ? <div key={`e${i}`} className="cal-cell empty" /> :
          <div key={key} className={`cal-cell ${key === todayKey ? 'today' : ''}`}>
            <span className="cal-day">{Number(key.slice(8))}</span>
            {views.filter((v) => v.date === key).map((v) => <a key={v.id} href={`#post-${v.id}`} className={`cal-chip status-${v.status.toLowerCase()}`} title={`${v.clientName}: ${v.title}`}>{clientId ? '' : `${v.clientName.split(' ')[0]} · `}{v.title}</a>)}
          </div>)}
      </div>
    </div>

    <div className="post-list">
      {views.length === 0 ? <div className="card empty-state">Nothing planned for {monthLabel(month)}{clientId ? ' for this client' : ''} yet.{lead ? ' Use “Plan a post” to start.' : ''}</div> :
        views.map((v) => <PostCard key={v.id} post={v} canEdit={lead} canMarkPosted={v.ownerId === u.id} people={people} />)}
    </div>
  </div>;
}
