'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Client-side building blocks for the autopilot screens. Every action calls the API
// and refreshes the page, so the server always decides what is allowed.

function useApi() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function call(url: string, method: string, body?: unknown, opts: { refresh?: boolean } = {}) {
    setBusy(true); setError('');
    try {
      const x = await fetch(url, { method, headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' }, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) });
      const j = await x.json().catch(() => ({}));
      if (!x.ok) { setError(j.error || 'That didn’t work. Try again.'); return null; }
      if (opts.refresh !== false) r.refresh();
      return j;
    } catch { setError('Network error. Check your connection and try again.'); return null; }
    finally { setBusy(false); }
  }
  return { call, busy, error, setError };
}

type Action = { key: string; label: string; tone: 'primary' | 'secondary' | 'danger'; needsNote?: boolean; disabledReason?: string };

export function TaskActionBar({ taskId, actions, aiFlags = 0, compact = false }: { taskId: string; actions: Action[]; aiFlags?: number; compact?: boolean }) {
  const { call, busy, error } = useApi();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  if (!actions.length) return null;
  async function run(a: Action) {
    if (a.needsNote && noteFor !== a.key) { setNoteFor(a.key); return; }
    const body: Record<string, unknown> = { action: a.key };
    if (a.needsNote) body.note = note;
    if (a.key === 'proof_pass' && aiFlags) body.acknowledge = ack;
    const ok = await call(`/api/tasks/${taskId}`, 'PATCH', body);
    if (ok) { setNoteFor(null); setNote(''); }
  }
  const noteAction = actions.find((a) => a.key === noteFor);
  return <div className="task-actions-block">
    {actions.some((a) => a.key === 'proof_pass') && aiFlags > 0 && <label className="ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I’ve checked every flagged item ({aiFlags}) against the design</label>}
    <div className="actions">
      {actions.map((a) => <button key={a.key} className={`btn ${a.tone === 'primary' ? '' : a.tone} ${compact ? 'small' : ''}`} disabled={busy || !!a.disabledReason} title={a.disabledReason} onClick={() => run(a)}>{a.label}</button>)}
    </div>
    {actions.filter((a) => a.disabledReason).slice(0, 1).map((a) => <p key={a.key} className="muted gate-note">{a.disabledReason}</p>)}
    {noteAction && <div className="note-box">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={noteAction.key === 'client_changes' ? 'What did the client ask to change?' : 'What needs to change? Be specific: quote the wrong word and the fix.'} rows={3} />
      <div className="actions"><button className="btn danger small" disabled={busy || note.trim().length < 5} onClick={() => run(noteAction)}>{noteAction.label}</button><button className="btn secondary small" onClick={() => { setNoteFor(null); setNote(''); }}>Cancel</button></div>
    </div>}
    {error && <p className="error">{error}</p>}
  </div>;
}

export function CopyEditor({ taskId, initial, canEdit, isOwner }: { taskId: string; initial: string; canEdit: boolean; isOwner: boolean }) {
  const { call, busy, error } = useApi();
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);
  if (!canEdit) return <div>
    {initial ? <pre className="copy-block">{initial}</pre> : <div className="empty-state">{isOwner ? 'Waiting for the approved copy. You can’t start until it’s here.' : 'No copy yet.'}</div>}
    {initial && isOwner && <button className="btn secondary small" onClick={async () => { await navigator.clipboard.writeText(initial); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy text to paste'}</button>}
  </div>;
  return <div className="form">
    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste the final, approved copy exactly as it should appear on the design: headline, body, CTA, phone, URL." />
    <div className="actions"><button className="btn small" disabled={busy || text.trim().length < 2 || text === initial} onClick={() => call(`/api/tasks/${taskId}`, 'PATCH', { copy: text })}>{initial ? 'Update copy' : 'Attach approved copy'}</button></div>
    {error && <p className="error">{error}</p>}
  </div>;
}

async function compress(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 900_000) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9));
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export function UploadPanel({ taskId, link, canEdit }: { taskId: string; link: string; canEdit: boolean }) {
  const { call, busy, error, setError } = useApi();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(link);
  if (!canEdit) return null;
  async function upload(f: File | undefined) {
    if (!f) return;
    try { const small = await compress(f); const fd = new FormData(); fd.append('file', small); await call(`/api/tasks/${taskId}/files`, 'POST', fd); }
    catch { setError('Could not read that image.'); }
    if (input.current) input.current.value = '';
  }
  return <div className="form upload-panel">
    <div className="actions"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => upload(e.target.files?.[0])} disabled={busy} /></div>
    <div className="inline-row"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Or a link: Drive, Canva, Figma, staging site" /><button className="btn secondary small" disabled={busy || url === link} onClick={() => call(`/api/tasks/${taskId}`, 'PATCH', { link: url })}>Save link</button></div>
    {busy && <p className="muted">Uploading…</p>}
    {error && <p className="error">{error}</p>}
  </div>;
}

export function RunAiCheck({ taskId, label = 'Run AI check' }: { taskId: string; label?: string }) {
  const { call, busy, error } = useApi();
  return <span><button className="btn secondary small" disabled={busy} onClick={() => call(`/api/tasks/${taskId}/ai-check`, 'POST')}>{busy ? 'Reading the design…' : label}</button>{error && <span className="error"> {error}</span>}</span>;
}

export function ChecklistPanel({ taskId, items, canEdit }: { taskId: string; items: { label: string; done: boolean; by?: string }[]; canEdit: boolean }) {
  const { call, busy, error } = useApi();
  return <div className="checklist">
    {items.map((it, i) => <label key={i} className={it.done ? 'done' : ''}><input type="checkbox" checked={it.done} disabled={!canEdit || busy} onChange={(e) => call(`/api/tasks/${taskId}`, 'PATCH', { check: i, done: e.target.checked })} /><span>{it.label}</span>{it.by && <small>{it.by}</small>}</label>)}
    {error && <p className="error">{error}</p>}
  </div>;
}

export function CommentForm({ taskId }: { taskId: string }) {
  const { call, busy, error } = useApi();
  const [body, setBody] = useState('');
  return <div className="form"><div className="inline-row"><input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" /><button className="btn secondary small" disabled={busy || !body.trim()} onClick={async () => { if (await call(`/api/tasks/${taskId}/comments`, 'POST', { body })) setBody(''); }}>Comment</button></div>{error && <p className="error">{error}</p>}</div>;
}

export function IncidentForm({ taskId, clientId, types }: { taskId?: string; clientId?: string; types: { key: string; label: string }[] }) {
  const { call, busy, error } = useApi();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(types[0]?.key ?? 'ERROR');
  const [description, setDescription] = useState('');
  const [done, setDone] = useState(false);
  if (!open) return <div>{done && <p className="muted">Logged.</p>}<button className="btn danger small" onClick={() => setOpen(true)}>{taskId ? 'Log an error or bug that reached the client' : 'Log a complaint or error'}</button></div>;
  return <div className="form note-box">
    <div className="inline-row"><select value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What happened? e.g. “Admissions” spelt “Admisions” on the Instagram post, client spotted it." />
    <div className="actions"><button className="btn danger small" disabled={busy || description.trim().length < 5} onClick={async () => { if (await call('/api/incidents', 'POST', { taskId, clientId, type, description })) { setOpen(false); setDescription(''); setDone(true); } }}>Log it</button><button className="btn secondary small" onClick={() => setOpen(false)}>Cancel</button></div>
    {error && <p className="error">{error}</p>}
  </div>;
}

export function TaskEditForm({ taskId, due, priority, level, ownerId, users, needsCopy, needsProof, isLead, isMD }: { taskId: string; due: string; priority: string; level: string; ownerId: string; users: { id: string; name: string }[]; needsCopy: boolean; needsProof: boolean; isLead: boolean; isMD: boolean }) {
  const { call, busy, error } = useApi();
  const [f, setF] = useState({ due, priority, approvalLevel: level, ownerId, needsCopy, needsProof });
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  return <div className="form">
    <div className="form-grid">
      <label>Due<input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
      <label>Owner<select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label>Priority<select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option>P1</option><option>P2</option><option>P3</option></select></label>
      <label>Release<select value={f.approvalLevel} onChange={(e) => setF({ ...f, approvalLevel: e.target.value })}><option value="L0">L0 · maker releases</option><option value="L1">L1 · DMM releases</option><option value="L2">L2 · MD releases</option></select></label>
      {isLead && <label className="check-label"><input type="checkbox" checked={f.needsCopy} onChange={(e) => setF({ ...f, needsCopy: e.target.checked })} />Needs approved copy</label>}
      {isLead && <label className="check-label"><input type="checkbox" checked={f.needsProof} onChange={(e) => setF({ ...f, needsProof: e.target.checked })} />Needs proof check</label>}
    </div>
    <div className="actions"><button className="btn small" disabled={busy} onClick={() => call(`/api/tasks/${taskId}`, 'PATCH', isLead ? f : { due: f.due, priority: f.priority, approvalLevel: f.approvalLevel, ownerId: f.ownerId })}>Save changes</button></div>
    {isMD && <div className="inline-row" style={{ marginTop: 12 }}>
      <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Override status (MD)…</option>{['OPEN', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'APPROVAL', 'CLIENT', 'DONE'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (logged)" />
      <button className="btn danger small" disabled={busy || !status || note.trim().length < 3} onClick={() => call(`/api/tasks/${taskId}`, 'PATCH', { override: status, note })}>Override</button>
    </div>}
    {error && <p className="error">{error}</p>}
  </div>;
}

// ---------- Today ----------

type Candidate = { id: string; desc: string; client: string; due: string; status: string; late: boolean };

export function TodayPlanner({ candidates, open, late, clients }: { candidates: Candidate[]; open: boolean; late: boolean; clients: { id: string; name: string }[] }) {
  const { call, busy, error } = useApi();
  const [picked, setPicked] = useState<string[]>([]);
  const [desc, setDesc] = useState('');
  const [clientId, setClientId] = useState('');
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return <div>
    {candidates.length === 0 ? <div className="empty-state">No open tasks in your name. Add what you’ll hand in today below.</div> :
      <div className="pick-list">{candidates.map((c) => <label key={c.id} className={picked.includes(c.id) ? 'picked' : ''}><input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} disabled={!open} /><span><b>{c.desc}</b><small>{c.client} · due {c.due}{c.late ? ' · overdue' : ''} · {c.status}</small></span></label>)}</div>}
    {open && <div className="form" style={{ marginTop: 12 }}><div className="inline-row">
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Something else you’ll finish today, e.g. Send proposal to Demo Builders" />
      <select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Internal</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn secondary small" disabled={busy || desc.trim().length < 3} onClick={async () => { const t = await call('/api/today', 'POST', { action: 'quick-add', desc, clientId: clientId || undefined }); if (t) { setDesc(''); setPicked((p) => [...p, t.id]); } }}>Add task</button>
    </div></div>}
    {open ? <div className="actions" style={{ marginTop: 14 }}>
      <button className="btn" disabled={busy || !picked.length} onClick={async () => { if (await call('/api/today', 'POST', { action: 'commit', taskIds: picked })) setPicked([]); }}>Commit to {picked.length || ''} task{picked.length === 1 ? '' : 's'}</button>
      {late && <span className="muted">It’s after 9:30, so today is marked as a late plan.</span>}
    </div> : <p className="muted">Plans lock at 11:00 AM.</p>}
    {error && <p className="error">{error}</p>}
  </div>;
}

export function ReasonsForm({ items }: { items: { id: string; title: string; date: string }[] }) {
  const { call, busy, error } = useApi();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const ready = items.every((i) => (reasons[i.id] || '').trim().length >= 3);
  return <div className="form">
    {items.map((i) => <label key={i.id} className="reason-row"><span><b>{i.title}</b><small>Committed {i.date}</small></span><input value={reasons[i.id] || ''} onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })} placeholder="Why didn’t it get handed in?" /></label>)}
    <div className="actions"><button className="btn" disabled={busy || !ready} onClick={() => call('/api/today', 'POST', { action: 'reasons', reasons: items.map((i) => ({ itemId: i.id, reason: reasons[i.id] })) })}>Save reasons</button></div>
    {error && <p className="error">{error}</p>}
  </div>;
}

// ---------- Scopes ----------

export function ScopeForm({ clients, users, categories, fixedClientId }: { clients: { id: string; name: string }[]; users: { id: string; name: string }[]; categories: { key: string; label: string; copy: boolean; proof: boolean }[]; fixedClientId?: string }) {
  const { call, busy, error } = useApi();
  const [msg, setMsg] = useState('');
  const blank = { clientId: fixedClientId ?? clients[0]?.id ?? '', title: '', category: 'SOCIAL', cadence: 'MONTHLY', dueDay: '5', ownerId: '', approvalLevel: 'L1', priority: 'P2', needsCopy: true, needsProof: true };
  const [f, setF] = useState(blank);
  const setCategory = (key: string) => { const c = categories.find((x) => x.key === key); setF({ ...f, category: key, needsCopy: !!c?.copy, needsProof: !!c?.proof }); };
  return <div className="card form">
    <div className="section-head"><div><h3>Add a recurring deliverable</h3><p className="muted">Tasks for the current period are created straight away if the due date hasn’t passed. After that, the system creates them on the 1st (monthly) or Monday (weekly).</p></div></div>
    <div className="form-grid">
      {!fixedClientId && <select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Deliverable, e.g. 3 social posts" />
      <select value={f.category} onChange={(e) => setCategory(e.target.value)}>{categories.filter((c) => !['ONBOARDING', 'SYSTEM'].includes(c.key)).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      <select value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value, dueDay: e.target.value === 'WEEKLY' ? '4' : '5' })}><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option></select>
      {f.cadence === 'MONTHLY' ? <input type="number" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} placeholder="Due day of month" /> :
        <select value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i + 1}>Due {d}</option>)}</select>}
      <select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}><option value="">Owner: DMM decides</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      <select value={f.approvalLevel} onChange={(e) => setF({ ...f, approvalLevel: e.target.value })}><option value="L0">L0 · maker releases</option><option value="L1">L1 · DMM releases</option><option value="L2">L2 · MD releases</option></select>
      <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select>
      <label className="check-label"><input type="checkbox" checked={f.needsCopy} onChange={(e) => setF({ ...f, needsCopy: e.target.checked })} />Needs approved copy</label>
      <label className="check-label"><input type="checkbox" checked={f.needsProof} onChange={(e) => setF({ ...f, needsProof: e.target.checked })} />Needs proof check</label>
      <button className="btn" disabled={busy || !f.title.trim()} onClick={async () => { const r = await call('/api/scopes', 'POST', { ...f, dueDay: Number(f.dueDay) }); if (r) { setF({ ...blank, clientId: f.clientId }); setMsg(r.created ? `Added. ${r.created} task created for this period.` : 'Added. Its first task will be created at the start of the next period.'); } }}>Add to scope</button>
    </div>
    {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
    {error && <p className="error">{error}</p>}
  </div>;
}

export function ScopeToggle({ id, active }: { id: string; active: boolean }) {
  const { call, busy } = useApi();
  return <button className="btn secondary small" disabled={busy} onClick={() => call(`/api/scopes/${id}`, 'PATCH', { active: !active })}>{active ? 'Pause' : 'Resume'}</button>;
}

export function GenerateNow() {
  const { call, busy, error } = useApi();
  const [msg, setMsg] = useState('');
  return <span><button className="btn secondary" disabled={busy} onClick={async () => { const r = await call('/api/scopes/generate', 'POST'); if (r) setMsg(r.created ? `${r.created} task${r.created === 1 ? '' : 's'} created` : 'Everything for this period already exists'); }}>Create this period’s tasks now</button>{msg && <span className="muted"> {msg}</span>}{error && <span className="error"> {error}</span>}</span>;
}

// ---------- Scorecards ----------

export function TargetEditor({ userId, metric, target, active }: { userId: string; metric: string; target: number | null; active: boolean }) {
  const { call, busy, error } = useApi();
  const [value, setValue] = useState(target === null ? '' : String(target));
  return <span className="target-edit">
    <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="—" />
    <button className="btn secondary small" disabled={busy || value === (target === null ? '' : String(target))} onClick={() => call('/api/kpi', 'POST', { userId, metric, target: value === '' ? null : Number(value), clearRamp: true })}>Save</button>
    <button className="btn secondary small" disabled={busy} onClick={() => call('/api/kpi', 'POST', { userId, metric, target: target, active: !active })}>{active ? 'Switch off' : 'Switch on'}</button>
    {error && <span className="error">{error}</span>}
  </span>;
}

export function AddKpi({ userId, options }: { userId: string; options: { key: string; label: string }[] }) {
  const { call, busy, error } = useApi();
  const [metric, setMetric] = useState(options[0]?.key ?? '');
  const [target, setTarget] = useState('');
  if (!options.length) return null;
  return <div className="inline-row form"><select value={metric} onChange={(e) => setMetric(e.target.value)}>{options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select><input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" /><button className="btn secondary small" disabled={busy || !metric} onClick={() => call('/api/kpi', 'POST', { userId, metric, target: target === '' ? null : Number(target), active: true })}>Add KPI</button>{error && <span className="error">{error}</span>}</div>;
}

export function ManualKpiForm({ userId, metric, monthKey, value }: { userId: string; metric: string; monthKey: string; value: number | null }) {
  const { call, busy, error } = useApi();
  const [v, setV] = useState(value === null ? '' : String(value));
  const [note, setNote] = useState('');
  return <span className="target-edit"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="%" /><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 4 of 5 accounts" /><button className="btn secondary small" disabled={busy || v === ''} onClick={() => call('/api/kpi', 'POST', { action: 'manual', userId, metric, monthKey, value: Number(v), note })}>Enter</button>{error && <span className="error">{error}</span>}</span>;
}

export function FlagActions({ id }: { id: string }) {
  const { call, busy } = useApi();
  return <span className="actions"><button className="btn small" disabled={busy} onClick={() => call(`/api/flags/${id}`, 'PATCH', { status: 'ACTIONED' })}>Mark actioned</button><button className="btn secondary small" disabled={busy} onClick={() => call(`/api/flags/${id}`, 'PATCH', { status: 'DISMISSED' })}>Dismiss</button></span>;
}

export function CheckpointActions({ id }: { id: string }) {
  const { call, busy, error } = useApi();
  return <span className="actions"><button className="btn small" disabled={busy} onClick={() => call(`/api/checkpoints/${id}`, 'PATCH', { result: 'PASS' })}>Confirm pass</button><button className="btn danger small" disabled={busy} onClick={() => call(`/api/checkpoints/${id}`, 'PATCH', { result: 'MISS' })}>Mark missed</button>{error && <span className="error">{error}</span>}</span>;
}

// ---------- Team ----------

export function TeamForm({ roles, seats }: { roles: string[]; seats: { key: string; label: string }[] }) {
  const { call, busy, error } = useApi();
  const blank = { name: '', email: '', role: 'DMM', seat: 'DMM', joiningDate: '', password: '', loadOnboarding: true, applyKpis: true };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState('');
  return <div className="card form">
    <div className="section-head"><div><h3>Add a team member</h3><p className="muted">Their seat sets their KPIs. Their 90-day plan loads as tasks with pass lines, before day one.</p></div></div>
    <div className="form-grid">
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" />
      <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@markwiz.com" />
      <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
      <select value={f.seat} onChange={(e) => setF({ ...f, seat: e.target.value })}><option value="">No seat</option>{seats.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
      <label>Joining date<input type="date" value={f.joiningDate} onChange={(e) => setF({ ...f, joiningDate: e.target.value })} /></label>
      <label>Temporary password<input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="10+ letters and numbers" /></label>
      <label className="check-label"><input type="checkbox" checked={f.applyKpis} onChange={(e) => setF({ ...f, applyKpis: e.target.checked })} />Set seat KPIs</label>
      <label className="check-label"><input type="checkbox" checked={f.loadOnboarding} onChange={(e) => setF({ ...f, loadOnboarding: e.target.checked })} />Load 90-day plan</label>
      <button className="btn" disabled={busy} onClick={async () => { const r = await call('/api/team', 'POST', f); if (r) { setMsg(`${r.name} added with ${r.kpis} KPIs and ${r.plan} onboarding tasks. Share the password privately.`); setF(blank); } }}>Add team member</button>
    </div>
    {msg && <p className="muted" style={{ marginTop: 8 }}>{msg}</p>}
    {error && <p className="error">{error}</p>}
  </div>;
}

export function TeamRow({ id, role, seat, joiningDate, active, roles, seats, hasPlan }: { id: string; role: string; seat: string; joiningDate: string; active: boolean; roles: string[]; seats: { key: string; label: string }[]; hasPlan: boolean }) {
  const { call, busy, error } = useApi();
  const [f, setF] = useState({ role, seat, joiningDate });
  const changed = f.role !== role || f.seat !== seat || f.joiningDate !== joiningDate;
  return <div className="team-row-edit">
    <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
    <select value={f.seat} onChange={(e) => setF({ ...f, seat: e.target.value })}><option value="">No seat</option>{seats.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
    <input type="date" value={f.joiningDate} onChange={(e) => setF({ ...f, joiningDate: e.target.value })} />
    <button className="btn secondary small" disabled={busy || !changed} onClick={() => call(`/api/team/${id}`, 'PATCH', { ...f, seat: f.seat || null, joiningDate: f.joiningDate || undefined })}>Save</button>
    <button className="btn secondary small" disabled={busy || !f.seat} onClick={() => { if (confirm('Replace this person’s KPI targets with the seat defaults?')) call(`/api/team/${id}`, 'PATCH', { action: 'apply-kpis', seat: f.seat }); }}>Reset KPIs to seat</button>
    {!hasPlan && <button className="btn secondary small" disabled={busy} onClick={() => call(`/api/team/${id}`, 'PATCH', { action: 'load-onboarding' })}>Load 90-day plan</button>}
    <button className="btn danger small" disabled={busy} onClick={() => { if (confirm(active ? 'Deactivate this person? They can no longer sign in.' : 'Reactivate this person?')) call(`/api/team/${id}`, 'PATCH', { active: !active }); }}>{active ? 'Deactivate' : 'Reactivate'}</button>
    {error && <span className="error">{error}</span>}
  </div>;
}

// ---------- CRM, digest ----------

export function OutreachLogger({ today, target }: { today: number; target: number | null }) {
  const { call, busy, error } = useApi();
  const [count, setCount] = useState('1');
  const channels = [['CALL', 'Call'], ['WHATSAPP', 'WhatsApp'], ['EMAIL', 'Email'], ['LINKEDIN', 'LinkedIn']];
  return <div className="card outreach">
    <div className="section-head"><div><h3>Log outreach</h3><p className="muted">Every call, WhatsApp, email and LinkedIn message counts toward your daily touches. Log in batches if you worked a list.</p></div><div className="big-number"><b>{today}</b><span>{target ? `of ${target} today` : 'today'}</span></div></div>
    <div className="actions">
      <input className="count-input" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} />
      {channels.map(([k, l]) => <button key={k} className="btn secondary small" disabled={busy} onClick={() => call('/api/outreach', 'POST', { channel: k, count: Number(count) || 1 })}>+ {l}</button>)}
    </div>
    {error && <p className="error">{error}</p>}
  </div>;
}

export function LeadTouch({ leadId }: { leadId: string }) {
  const { call, busy } = useApi();
  return <select className="touch-select" disabled={busy} value="" onChange={(e) => e.target.value && call('/api/outreach', 'POST', { channel: e.target.value, leadId })}><option value="">Log a touch…</option><option value="CALL">Called</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Emailed</option><option value="LINKEDIN">LinkedIn</option><option value="MEETING">Meeting held</option></select>;
}

export function SendDigest() {
  const { call, busy, error } = useApi();
  const [msg, setMsg] = useState('');
  return <span><button className="btn secondary small" disabled={busy} onClick={async () => { const r = await call('/api/digest', 'POST'); if (r) setMsg(r.emailed ? `Emailed (${r.items} items)` : r.error || `Saved (${r.items} items)`); }}>Send today’s digest now</button>{msg && <span className="muted"> {msg}</span>}{error && <span className="error"> {error}</span>}</span>;
}
