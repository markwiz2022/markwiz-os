'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEAD_SOURCES, LEAD_STAGES, LOST_REASONS } from '@/lib/crm';

async function patchLead(id: string, body: unknown) {
  const x = await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!x.ok) throw new Error((await x.json().catch(() => ({}))).error || 'Unable to update lead');
}

/** Stage dropdown + Advance. Moving to LOST asks for a reason first. */
export default function LeadStageActions({ id, stage }: { id: string; stage: string }) {
  const r = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState<string>(LOST_REASONS[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function move(next: string, extra: Record<string, string> = {}) {
    if (next === 'LOST' && !extra.lostReason) { setAsking(true); return; }
    setBusy(true); setError('');
    try { await patchLead(id, { stage: next, ...extra }); setAsking(false); setNote(''); r.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const i = LEAD_STAGES.indexOf(stage as (typeof LEAD_STAGES)[number]);

  return <div className="actions">
    <select value={stage} disabled={busy} onChange={(e) => move(e.target.value)}>{LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
    {i >= 0 && i < LEAD_STAGES.length - 2 && <button className="btn small" disabled={busy} onClick={() => move(LEAD_STAGES[i + 1])}>Advance</button>}
    {asking && <div className="inline-edit">
      <b>Why was it lost?</b>
      <select value={reason} onChange={(e) => setReason(e.target.value)}>{LOST_REASONS.map((x) => <option key={x}>{x}</option>)}</select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note (optional)" />
      <div className="row-actions"><button className="btn danger small" disabled={busy} onClick={() => move('LOST', { lostReason: note.trim() ? `${reason}: ${note.trim()}` : reason })}>Mark lost</button><button className="btn secondary small" disabled={busy} onClick={() => setAsking(false)}>Cancel</button></div>
    </div>}
    {error && <p className="error">{error}</p>}
  </div>;
}

/** Shown on won leads: open the client record, or create it for leads won before this feature. */
export function LeadClientLink({ id, clientId, clientName }: { id: string; clientId: string | null; clientName: string | null }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (clientId) return <div className="won-link"><a className="client-link" href={`/clients/${clientId}`}>Client: {clientName ?? 'open'} →</a> <a className="client-link" href="/scopes">Load scope →</a></div>;
  return <div className="won-link"><button className="btn small" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await patchLead(id, { convert: true }); r.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{busy ? 'Creating…' : 'Create client record'}</button>{error && <p className="error">{error}</p>}</div>;
}

/** Edit the details sales update most: value, probability, source, next action and follow-up. */
export function LeadEdit({ lead }: { lead: { id: string; name: string; company: string | null; value: number; probability: number; source: string | null; nextAction: string | null; nextFollowUp: string | null; billing: string; email: string | null; phone: string | null; notes: string | null } }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const blank = () => ({ company: lead.company ?? '', value: String(lead.value), billing: lead.billing || 'MONTHLY', probability: String(lead.probability), source: lead.source ?? '', nextAction: lead.nextAction ?? '', nextFollowUp: lead.nextFollowUp ?? '', email: lead.email ?? '', phone: lead.phone ?? '', notes: lead.notes ?? '' });
  const [f, setF] = useState(blank);
  const sources: string[] = [...LEAD_SOURCES];
  if (f.source && !sources.includes(f.source)) sources.push(f.source);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await patchLead(lead.id, { ...f, value: Number(f.value || 0), probability: Number(f.probability || 0), nextFollowUp: f.nextFollowUp || null }); setOpen(false); r.refresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="btn secondary small" onClick={() => { setF(blank()); setOpen(true); }}>Edit lead</button>;
  return <form className="inline-edit" onSubmit={save}>
    <input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Company" />
    <select value={f.billing} onChange={(e) => setF({ ...f, billing: e.target.value })}><option value="MONTHLY">Monthly retainer</option><option value="ONE_TIME">One-time project</option><option value="QUARTERLY">Quarterly</option><option value="YEARLY">Yearly</option></select>
    <input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} type="number" min="0" placeholder={f.billing === 'MONTHLY' ? 'Monthly value' : f.billing === 'ONE_TIME' ? 'Project value' : 'Value per period'} />
    <input value={f.probability} onChange={(e) => setF({ ...f, probability: e.target.value })} type="number" min="0" max="100" placeholder="Probability %" />
    <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Source not set</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
    <input value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} placeholder="Next action" />
    <label className="inline-label">Follow-up<input value={f.nextFollowUp} onChange={(e) => setF({ ...f, nextFollowUp: e.target.value })} type="date" /></label>
    <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" placeholder="Email" />
    <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" />
    <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes" rows={2} />
    <div className="row-actions"><button className="btn small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="btn secondary small" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
    {error && <p className="error">{error}</p>}
  </form>;
}
