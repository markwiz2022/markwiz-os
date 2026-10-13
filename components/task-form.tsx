'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Cat = { key: string; label: string; copy: boolean; proof: boolean };

export default function TaskForm({ clients, users, tasks, categories, meId }: { clients: { id: string; name: string; internal?: boolean }[]; users: { id: string; name: string; role: string }[]; tasks: { id: string; desc: string; status: string }[]; categories: Cat[]; meId: string }) {
  const r = useRouter();
  const firstClient = clients.find((c) => !c.internal) ?? clients[0];
  const [f, setF] = useState({ clientId: firstClient?.id || '', ownerId: users[0]?.id || '', desc: '', due: '', priority: 'P2', approvalLevel: 'L1', blockedById: 'none', category: 'GENERAL', approvedCopy: '' });
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const cat = categories.find((c) => c.key === f.category);
  const internal = clients.find((c) => c.id === f.clientId)?.internal;
  async function add(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const x = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, approvalLevel: internal ? 'L0' : f.approvalLevel }) });
    if (!x.ok) { setError((await x.json()).error || 'Unable to create task'); return; }
    setF({ ...f, desc: '', due: '', blockedById: 'none', approvedCopy: '' });
    r.refresh();
  }
  if (!open) return <div className="toolbar-actions"><button className="btn" onClick={() => setOpen(true)}>Create & assign a task</button></div>;
  return <form className="card form" onSubmit={add} style={{ marginBottom: 18 }}>
    <div className="section-head"><div><h3>Create & assign a task</h3><p className="muted">Design, social and video tasks need approved copy before the designer can start, and a proof check by someone else before anything reaches the client.</p></div><button type="button" className="btn secondary small" onClick={() => setOpen(false)}>Close</button></div>
    <div className="form-grid">
      <select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="Specific deliverable" required />
      <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
      <select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select>
      <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} required />
      <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="P1">P1 · Urgent (max 3 per person)</option><option value="P2">P2 · Normal</option><option value="P3">P3 · Backlog</option></select>
      {!internal && <select value={f.approvalLevel} onChange={(e) => setF({ ...f, approvalLevel: e.target.value })}><option value="L0">L0 · maker releases</option><option value="L1">L1 · DMM releases</option><option value="L2">L2 · MD releases</option></select>}
      <select value={f.blockedById} onChange={(e) => setF({ ...f, blockedById: e.target.value })}><option value="none">No dependency</option>{tasks.filter((t) => !['DONE', 'CLIENT'].includes(t.status)).map((t) => <option key={t.id} value={t.id}>Waits for: {t.desc}</option>)}</select>
    </div>
    {cat?.copy && f.ownerId !== meId && <label className="copy-label">Approved copy (the designer pastes this, word for word)<textarea rows={4} value={f.approvedCopy} onChange={(e) => setF({ ...f, approvedCopy: e.target.value })} placeholder="Headline, body, CTA, phone, URL. Leave empty to add it later; the task can’t start until it’s here." /></label>}
    <div className="gate-hint">{cat?.copy ? 'Copy gate on · ' : ''}{cat?.proof ? 'Proof check by someone else · ' : ''}{cat?.key === 'WEB' ? 'QA checklist before hand-in · ' : ''}{internal ? 'Internal work' : `Released by ${f.approvalLevel === 'L0' ? 'the maker' : f.approvalLevel === 'L1' ? 'the DMM' : 'the MD'}`}</div>
    <div className="actions"><button className="btn">Assign task</button></div>
    {error && <p className="error">{error}</p>}
  </form>;
}
