'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Edit a recurring deliverable. Changes apply from the next task it creates; tasks already created stay as they are. */
export default function ScopeEdit({ item, users }: { item: { id: string; title: string; cadence: string; dueDay: number; ownerId: string | null; approvalLevel: string; priority: string; needsCopy: boolean; needsProof: boolean }; users: { id: string; name: string }[] }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blank = () => ({ title: item.title, cadence: item.cadence, dueDay: String(item.dueDay), ownerId: item.ownerId ?? '', approvalLevel: item.approvalLevel, priority: item.priority, needsCopy: item.needsCopy, needsProof: item.needsProof });
  const [f, setF] = useState(blank);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const x = await fetch(`/api/scopes/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, title: f.title.trim(), dueDay: Number(f.dueDay), ownerId: f.ownerId || null }) });
      if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'Unable to save');
      setOpen(false); r.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="btn secondary small" onClick={() => { setF(blank()); setOpen(true); }}>Edit</button>;
  return <form className="inline-edit" onSubmit={save}>
    <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Deliverable" required />
    <select value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value, dueDay: e.target.value === 'WEEKLY' ? '4' : '5' })}><option value="MONTHLY">Monthly</option><option value="WEEKLY">Weekly</option></select>
    {f.cadence === 'MONTHLY'
      ? <input type="number" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} placeholder="Due day of month" />
      : <select value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i + 1}>Due {d}</option>)}</select>}
    <select value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}><option value="">Owner: DMM decides</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
    <select value={f.approvalLevel} onChange={(e) => setF({ ...f, approvalLevel: e.target.value })}><option value="L0">L0 · maker releases</option><option value="L1">L1 · DMM releases</option><option value="L2">L2 · MD releases</option></select>
    <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select>
    <label className="check-label"><input type="checkbox" checked={f.needsCopy} onChange={(e) => setF({ ...f, needsCopy: e.target.checked })} />Needs approved copy</label>
    <label className="check-label"><input type="checkbox" checked={f.needsProof} onChange={(e) => setF({ ...f, needsProof: e.target.checked })} />Needs proof check</label>
    <p className="muted">Applies from the next task this creates. Tasks already created don’t change.</p>
    <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn secondary small" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
    {error && <p className="error">{error}</p>}
  </form>;
}
