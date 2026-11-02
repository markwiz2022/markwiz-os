'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** MD only: archive / restore a client, or delete it permanently after typing its name. */
export default function ClientDangerZone({ client, counts, afterDelete = '/clients' }: { client: { id: string; name: string; active: boolean }; counts: { tasks: number; invoices: number }; afterDelete?: string }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function archive(active: boolean) {
    setBusy(true); setError('');
    try {
      const x = await fetch('/api/clients', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: client.id, active }) });
      if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'Unable to update');
      setOpen(false); r.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const x = await fetch(`/api/clients?id=${encodeURIComponent(client.id)}&confirm=${encodeURIComponent(confirmName)}`, { method: 'DELETE' });
      if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'Unable to delete');
      r.push(afterDelete); r.refresh();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  if (!open) return <button type="button" className="btn secondary small" onClick={() => setOpen(true)}>{client.active ? 'Archive / delete' : 'Restore / delete'}</button>;
  return <div className="inline-edit danger-zone">
    {client.active
      ? <><b>Archive {client.name}</b><p className="muted">Hides the client from lists, scopes, the calendar and reports. Tasks, invoices and history are kept. You can restore it any time.</p>
        <div className="row-actions"><button type="button" className="btn small" disabled={busy} onClick={() => archive(false)}>Archive client</button></div></>
      : <><b>{client.name} is archived</b><div className="row-actions"><button type="button" className="btn small" disabled={busy} onClick={() => archive(true)}>Restore client</button></div></>}
    <form onSubmit={remove} className="danger-delete">
      <b className="danger-text">Delete permanently</b>
      <p className="muted">Removes the client with its {counts.tasks} task{counts.tasks === 1 ? '' : 's'}, {counts.invoices} invoice{counts.invoices === 1 ? '' : 's'}, scope, content plan and meetings. This can’t be undone. Expenses stay in Finance as company costs. A full record is kept in the Audit Trail. Use Archive for clients who have simply left.</p>
      <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={`Type “${client.name}” to confirm`} />
      <div className="row-actions"><button className="btn danger small" disabled={busy || confirmName.trim() !== client.name.trim()}>{busy ? 'Deleting…' : 'Delete permanently'}</button><button type="button" className="btn secondary small" onClick={() => { setOpen(false); setConfirmName(''); }}>Cancel</button></div>
    </form>
    {error && <p className="error">{error}</p>}
  </div>;
}
