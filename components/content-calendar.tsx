'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONTENT_FORMATS, CONTENT_PLATFORMS, CONTENT_STATUSES, CONTENT_STATUS_LABEL, designDueKey, type ContentStatus } from '@/lib/content';

async function send(url: string, method: string, body?: unknown) {
  const x = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await x.json().catch(() => ({}));
  if (!x.ok) throw new Error(j.error || 'That didn’t work. Try again.');
  return j;
}

export function NewPostForm({ clients, defaultClientId, defaultDate }: { clients: { id: string; name: string }[]; defaultClientId: string; defaultDate: string }) {
  const r = useRouter();
  const blank = { clientId: defaultClientId || clients[0]?.id || '', date: defaultDate, platform: 'Instagram', format: 'Static post', title: '', caption: '', notes: '' };
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMsg('');
    try { await send('/api/content', 'POST', f); setF({ ...blank, clientId: f.clientId, date: f.date, platform: f.platform, format: f.format }); setMsg('Added to the calendar.'); r.refresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>+ Plan a post</button>;
  return <form className="card form" onSubmit={add}>
    <div className="section-head"><div><h3>Plan a post</h3><p className="muted">Add the topic now. Create the design task when you’re ready; the caption goes to the designer as approved copy.</p></div><button type="button" className="btn secondary small" onClick={() => setOpen(false)}>Close</button></div>
    <div className="form-grid">
      <select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
      <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>{CONTENT_PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
      <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{CONTENT_FORMATS.map((p) => <option key={p}>{p}</option>)}</select>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Topic, e.g. Before and after: Whitefield villa" required />
      <textarea value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} placeholder="Caption / on-screen text (optional)" rows={3} />
      <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes for the designer (optional)" />
      <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add to calendar'}</button>
    </div>
    {msg && <p className="muted">{msg}</p>}
    {error && <p className="error">{error}</p>}
  </form>;
}

type PostView = { id: string; date: string; platform: string; format: string; title: string; caption: string | null; notes: string | null; status: ContentStatus; postedUrl: string | null; clientName: string; task: { id: string; owner: string; status: string } | null };

export function PostCard({ post, canEdit, canMarkPosted, people }: { post: PostView; canEdit: boolean; canMarkPosted: boolean; people: { id: string; name: string }[] }) {
  const r = useRouter();
  const [mode, setMode] = useState<'view' | 'edit' | 'task' | 'posted'>('view');
  const [f, setF] = useState({ date: post.date, platform: post.platform, format: post.format, title: post.title, caption: post.caption ?? '', notes: post.notes ?? '' });
  const [taskF, setTaskF] = useState({ ownerId: people[0]?.id ?? '', due: designDueKey(post.date) });
  const [url, setUrl] = useState(post.postedUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(body: unknown, method = 'PATCH') {
    setBusy(true); setError('');
    try { await send(`/api/content/${post.id}`, method, body); setMode('view'); r.refresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return <div className={`post-card status-${post.status.toLowerCase()}`} id={`post-${post.id}`}>
    <div className="post-head">
      <span className="post-date">{new Date(`${post.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
      <span className="pill">{post.platform} · {post.format}</span>
      <span className={`pill ${post.status === 'POSTED' || post.status === 'APPROVED' ? 'green' : post.status === 'IN_DESIGN' || post.status === 'IN_REVIEW' ? 'amber' : ''}`}>{CONTENT_STATUS_LABEL[post.status]}</span>
    </div>
    <b className="post-title">{post.title}</b>
    <div className="muted">{post.clientName}</div>
    {post.caption && mode === 'view' && <p className="post-caption">{post.caption}</p>}
    {post.notes && mode === 'view' && <div className="muted">Note: {post.notes}</div>}
    {post.task && <div className="muted">Task: <a className="client-link" href={`/tasks/${post.task.id}`}>{post.task.owner} · {post.task.status.replace('_', ' ').toLowerCase()}</a></div>}
    {post.postedUrl && <div className="muted"><a className="client-link" href={post.postedUrl} target="_blank" rel="noreferrer">View live post ↗</a></div>}

    {mode === 'view' && <div className="row-actions">
      {canEdit && <button className="btn secondary small" onClick={() => setMode('edit')}>Edit</button>}
      {canEdit && !post.task && post.status !== 'POSTED' && post.status !== 'SKIPPED' && <button className="btn small" onClick={() => setMode('task')}>Create design task</button>}
      {(canEdit || canMarkPosted) && post.status !== 'POSTED' && <button className="btn secondary small" onClick={() => setMode('posted')}>Mark posted</button>}
      {canEdit && <select className="status-select" value={post.status} disabled={busy} onChange={(e) => run({ status: e.target.value })}>{CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}</select>}
    </div>}

    {mode === 'edit' && <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); run(f); }}>
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
      <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>{CONTENT_PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
      <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{CONTENT_FORMATS.map((p) => <option key={p}>{p}</option>)}</select>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
      <textarea value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} placeholder="Caption" rows={3} />
      <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" />
      <div className="row-actions"><button className="btn small" disabled={busy}>Save</button><button type="button" className="btn secondary small" onClick={() => setMode('view')}>Cancel</button>
        <button type="button" className="btn danger small" disabled={busy} onClick={() => { if (window.confirm('Remove this post from the calendar?')) run(undefined, 'DELETE'); }}>Remove</button></div>
    </form>}

    {mode === 'task' && <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); run({ action: 'task', ...taskF }); }}>
      <b>Who designs it, and by when?</b>
      <select value={taskF.ownerId} onChange={(e) => setTaskF({ ...taskF, ownerId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <label className="inline-label">Due<input type="date" value={taskF.due} onChange={(e) => setTaskF({ ...taskF, due: e.target.value })} required /></label>
      <p className="muted">The caption becomes the approved copy. The task follows the normal proof check and review.</p>
      <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Creating…' : 'Create task'}</button><button type="button" className="btn secondary small" onClick={() => setMode('view')}>Cancel</button></div>
    </form>}

    {mode === 'posted' && <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); run({ status: 'POSTED', postedUrl: url }); }}>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to the live post (optional)" />
      <div className="row-actions"><button className="btn small" disabled={busy}>Mark posted</button><button type="button" className="btn secondary small" onClick={() => setMode('view')}>Cancel</button></div>
    </form>}
    {error && <p className="error">{error}</p>}
  </div>;
}
