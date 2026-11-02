'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ClientOpt = { id: string; name: string };

async function send(url: string, method: 'PATCH' | 'DELETE', body?: unknown) {
  const x = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'Something went wrong');
}

export function InvoiceRowActions({ invoice, clients, canDelete }: { invoice: { id: string; number: string; amount: number; paid: number; dueDate: string; clientId: string; note: string | null }; clients: ClientOpt[]; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ number: invoice.number, amount: String(invoice.amount), paid: String(invoice.paid), dueDate: invoice.dueDate.slice(0, 10), clientId: invoice.clientId, note: invoice.note ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const r = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await send('/api/finance/invoices', 'PATCH', { id: invoice.id, ...f, amount: Number(f.amount), paid: Number(f.paid || 0) }); setOpen(false); r.refresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete invoice ${invoice.number}? This can't be undone. The record stays in the audit trail.`)) return;
    setBusy(true); setError('');
    try { await send(`/api/finance/invoices?id=${encodeURIComponent(invoice.id)}`, 'DELETE'); r.refresh(); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }

  if (!open) return <div className="row-actions"><button type="button" className="btn secondary small" onClick={() => setOpen(true)}>Edit</button>{canDelete && <button type="button" className="btn danger small" onClick={remove} disabled={busy}>Delete</button>}{error && <p className="error">{error}</p>}</div>;
  return <form className="inline-edit" onSubmit={save}>
    <input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} placeholder="Invoice number" required />
    <select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} type="number" min="1" step="0.01" placeholder="Amount" required />
    <input value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} type="number" min="0" step="0.01" placeholder="Paid to date" />
    <input value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} type="date" required />
    <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note" />
    <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn secondary small" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
    {error && <p className="error">{error}</p>}
  </form>;
}

export function ExpenseRowActions({ expense, clients, canDelete }: { expense: { id: string; category: string; amount: number; date: string; clientId: string | null; note: string | null }; clients: ClientOpt[]; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: expense.category, amount: String(expense.amount), date: expense.date.slice(0, 10), clientId: expense.clientId ?? '', note: expense.note ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const r = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await send('/api/finance/expenses', 'PATCH', { id: expense.id, ...f, amount: Number(f.amount) }); setOpen(false); r.refresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete this ${expense.category} expense? This can't be undone. The record stays in the audit trail.`)) return;
    setBusy(true); setError('');
    try { await send(`/api/finance/expenses?id=${encodeURIComponent(expense.id)}`, 'DELETE'); r.refresh(); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }

  if (!open) return <div className="row-actions"><button type="button" className="btn secondary small" onClick={() => setOpen(true)}>Edit</button>{canDelete && <button type="button" className="btn danger small" onClick={remove} disabled={busy}>Delete</button>}{error && <p className="error">{error}</p>}</div>;
  return <form className="inline-edit" onSubmit={save}>
    <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Category" required />
    <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} type="number" min="1" step="0.01" placeholder="Amount" required />
    <input value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} type="date" required />
    <select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">Company expense</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
    <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note" />
    <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn secondary small" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
    {error && <p className="error">{error}</p>}
  </form>;
}
