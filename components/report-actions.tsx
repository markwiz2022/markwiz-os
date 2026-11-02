'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PrintButton() {
  return <button type="button" className="btn secondary small" onClick={() => window.print()}>Print / Save as PDF</button>;
}

export function SendReport({ clientId, weekKey, defaultTo, emailReady }: { clientId: string; weekKey: string; defaultTo: string; emailReady: boolean }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  if (!emailReady) return <span className="muted">Email isn’t set up yet. Use Print / Save as PDF and send it yourself.</span>;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(`Send this report to ${to}?`)) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const x = await fetch('/api/reports/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, weekKey, to, note }) });
      const j = await x.json().catch(() => ({}));
      if (!x.ok) throw new Error(j.error || 'Unable to send');
      setMsg(`Sent to ${j.sentTo.join(', ')}.`); setOpen(false); r.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  if (!open) return <span className="row-actions"><button type="button" className="btn small" onClick={() => setOpen(true)}>Email to client</button>{msg && <span className="muted">{msg}</span>}</span>;
  return <form className="inline-edit" onSubmit={send}>
    <label className="inline-label">To<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com, second@example.com" required /></label>
    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Optional personal note. It replaces the opening line, e.g. Hi Priya, a good week. The shoot went well and the reels go live on Thursday." />
    <p className="muted">Replies come to your email. Sending is logged.</p>
    <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button><button type="button" className="btn secondary small" onClick={() => setOpen(false)}>Cancel</button></div>
    {error && <p className="error">{error}</p>}
  </form>;
}
