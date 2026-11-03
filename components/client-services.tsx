'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BILLINGS, BILLING_LABEL, DEFAULT_BILLING, SERVICE_CATEGORIES, SERVICE_STATUSES, SERVICE_STATUS_LABEL, type Billing, type ServiceStatus } from '@/lib/services';

export type ServiceView = { id: string; name: string; category: string; billing: Billing; amount: number; startDate: string; endDate: string | null; status: ServiceStatus; notes: string | null; nextDue: string | null };

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const day = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

async function send(url: string, method: string, body?: unknown) {
  const x = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'That didn’t work. Try again.');
}

type FormState = { name: string; category: string; billing: Billing; amount: string; startDate: string; endDate: string; status: ServiceStatus; notes: string };

function Fields({ f, setF }: { f: FormState; setF: (f: FormState) => void }) {
  const dateLabel = f.billing === 'ONE_TIME' ? 'Billing date' : 'First billing / renewal date';
  return <>
    <select value={f.category} onChange={(e) => { const c = e.target.value; setF({ ...f, category: c, billing: DEFAULT_BILLING[c] ?? f.billing, name: f.name || c }); }}>{SERVICE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
    <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name, e.g. Website redesign or Hosting 2026–27" required />
    <select value={f.billing} onChange={(e) => setF({ ...f, billing: e.target.value as Billing })}>{BILLINGS.map((b) => <option key={b} value={b}>{BILLING_LABEL[b]}</option>)}</select>
    <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} type="number" min="1" step="1" placeholder={f.billing === 'ONE_TIME' ? 'Amount (₹)' : `Amount per ${f.billing === 'YEARLY' ? 'year' : f.billing === 'QUARTERLY' ? 'quarter' : 'month'} (₹)`} required />
    <label className="inline-label">{dateLabel}<input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required /></label>
    {f.billing !== 'ONE_TIME' && <label className="inline-label">Ends (optional)<input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>}
    <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ServiceStatus })}>{SERVICE_STATUSES.map((s) => <option key={s} value={s}>{SERVICE_STATUS_LABEL[s]}</option>)}</select>
    <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes (optional)" />
  </>;
}

function toBody(f: FormState) {
  return { ...f, amount: Number(f.amount), endDate: f.billing === 'ONE_TIME' ? null : (f.endDate || null) };
}

export function ServicesPanel({ clientId, services, canDelete }: { clientId: string; services: ServiceView[]; canDelete: boolean }) {
  const r = useRouter();
  const blank: FormState = { name: '', category: 'Website build', billing: 'ONE_TIME', amount: '', startDate: today(), endDate: '', status: 'ACTIVE', notes: '' };
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<FormState>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await send('/api/services', 'POST', { clientId, ...toBody(f) }); setF(blank); setAdding(false); r.refresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const open = services.filter((s) => s.status === 'ACTIVE' || s.status === 'QUOTED');
  const closed = services.filter((s) => s.status === 'COMPLETED' || s.status === 'CANCELLED');

  return <div>
    {services.length === 0 && !adding && <div className="empty-state">No one-time or yearly work yet. Add website builds, branding, hosting, domains, AMC and so on here. They count in Finance only in the month they’re billed.</div>}
    {[...open, ...closed].map((s) => <ServiceRow key={s.id} s={s} canDelete={canDelete} />)}
    {adding ? <form className="inline-edit" onSubmit={add} style={{ marginTop: 10 }}>
      <b>Add work</b>
      <Fields f={f} setF={setF} />
      <p className="muted">One-time work counts once, in the month of its billing date. Yearly and quarterly items count in each renewal month. Quoted items don’t count until you set them Active.</p>
      <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button><button type="button" className="btn secondary small" onClick={() => setAdding(false)}>Cancel</button></div>
      {error && <p className="error">{error}</p>}
    </form> : <div className="row-actions" style={{ marginTop: 10 }}><button className="btn small" onClick={() => setAdding(true)}>+ Add one-time or yearly work</button></div>}
  </div>;
}

function ServiceRow({ s, canDelete }: { s: ServiceView; canDelete: boolean }) {
  const r = useRouter();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<FormState>({ name: s.name, category: s.category, billing: s.billing, amount: String(s.amount), startDate: s.startDate, endDate: s.endDate ?? '', status: s.status, notes: s.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); setEditing(false); r.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }

  return <div className={`service-row ${s.status === 'CANCELLED' || s.status === 'COMPLETED' ? 'done' : ''}`}>
    <div className="service-main">
      <div><b>{s.name}</b> <span className="muted">· {s.category}</span></div>
      <div className="muted">
        {rupees(s.amount)} {s.billing === 'ONE_TIME' ? `one-time · billed ${day(s.startDate)}` : `${BILLING_LABEL[s.billing].toLowerCase()} · from ${day(s.startDate)}${s.endDate ? ` to ${day(s.endDate)}` : ''}`}
        {s.nextDue && s.billing !== 'ONE_TIME' && <> · <b>next {day(s.nextDue)}</b></>}
      </div>
      {s.notes && <div className="muted">{s.notes}</div>}
    </div>
    <span className={`pill ${s.status === 'ACTIVE' ? 'green' : s.status === 'QUOTED' ? 'amber' : ''}`}>{SERVICE_STATUS_LABEL[s.status]}</span>
    {!editing ? <div className="row-actions">
      <button className="btn secondary small" onClick={() => setEditing(true)}>Edit</button>
      {s.status === 'ACTIVE' && s.billing === 'ONE_TIME' && <button className="btn secondary small" disabled={busy} onClick={() => run(() => send(`/api/services/${s.id}`, 'PATCH', { status: 'COMPLETED' }))}>Mark completed</button>}
      {s.status === 'ACTIVE' && s.billing !== 'ONE_TIME' && !s.endDate && <button className="btn secondary small" disabled={busy} onClick={() => { if (window.confirm(`Stop renewing ${s.name}? Past billing stays in the figures; nothing new counts after today.`)) run(() => send(`/api/services/${s.id}`, 'PATCH', { endDate: today() })); }}>Stop renewing</button>}
      {canDelete && <button className="btn danger small" disabled={busy} onClick={() => { if (window.confirm(`Delete ${s.name}? Use this only for mistakes; it is kept in the Audit Trail.`)) run(() => send(`/api/services/${s.id}`, 'DELETE')); }}>Delete</button>}
    </div> : <form className="inline-edit" onSubmit={(e) => { e.preventDefault(); run(() => send(`/api/services/${s.id}`, 'PATCH', toBody(f))); }}>
      <Fields f={f} setF={setF} />
      <div className="row-actions"><button className="btn small" disabled={busy}>Save</button><button type="button" className="btn secondary small" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}
    {error && <p className="error">{error}</p>}
  </div>;
}
