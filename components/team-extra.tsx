'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function call(url: string, body: unknown) {
  const x = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'Unable to save');
}

/** Change a person's display name or sign-in email (MD only). */
export function PersonDetailsEdit({ id, name, email }: { id: string; name: string; email: string }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name, email });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (f.email.trim().toLowerCase() !== email && !window.confirm(`Change the sign-in email to ${f.email.trim().toLowerCase()}? They will sign in with the new email from now on.`)) { setBusy(false); return; }
      await call(`/api/team/${id}`, { name: f.name, email: f.email }); setOpen(false); r.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!open) return <button type="button" className="link-button" onClick={() => { setF({ name, email }); setOpen(true); }}>Edit name / email</button>;
  return <form className="inline-edit" onSubmit={save}>
    <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" required />
    <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" placeholder="Work email" required />
    <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn secondary small" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
    {error && <p className="error">{error}</p>}
  </form>;
}

/** Choose who (besides the MD) can add client records. */
export function ClientCreatorsSetting({ people, selected }: { people: { id: string; name: string; role: string }[]; selected: string[] }) {
  const r = useRouter();
  const [ids, setIds] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const changed = [...ids].sort().join() !== [...selected].sort().join();
  async function save() {
    setBusy(true); setError(''); setMsg('');
    try { await call('/api/settings', { clientCreators: ids }); setMsg('Saved.'); r.refresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className="card" style={{ marginTop: 14 }}>
    <div className="section-head"><div><h3>Who can add clients</h3><p className="muted">You can always add clients. Tick anyone else who should be able to. Everyone can still view and edit existing clients.</p></div>
      <button className="btn small" disabled={busy || !changed} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
    <div className="check-grid">{people.filter((p) => p.role !== 'MD').map((p) => <label key={p.id} className="check-label"><input type="checkbox" checked={ids.includes(p.id)} onChange={(e) => setIds(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))} />{p.name} <span className="muted">· {p.role}</span></label>)}</div>
    {msg && <p className="muted">{msg}</p>}
    {error && <p className="error">{error}</p>}
  </div>;
}
