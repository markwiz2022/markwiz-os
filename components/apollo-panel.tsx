'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Last = { at: string; created: number; linked: number; error?: string } | null;

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** Apollo connection status on the Sales CRM, with Sync now and (for the MD) who receives the leads. */
export default function ApolloPanel({ configured, last, ownerId, people, isMD }: { configured: boolean; last: Last; ownerId: string | null; people: { id: string; name: string }[]; isMD: boolean }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function post(body: unknown) {
    const x = await fetch('/api/apollo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await x.json().catch(() => ({}));
    if (!x.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  }
  async function sync() {
    setBusy(true); setError(''); setMsg('');
    try { const j = await post({ action: 'sync' }); setMsg(j.created || j.linked ? `${j.created} new lead${j.created === 1 ? '' : 's'} added${j.linked ? `, ${j.linked} matched to existing leads` : ''}.` : 'No new contacts in Apollo since the last sync.'); r.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function owner(id: string) {
    setBusy(true); setError(''); setMsg('');
    try { await post({ action: 'owner', ownerId: id }); setMsg('Saved.'); r.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!configured) return <div className="card apollo-panel" style={{ marginTop: 18 }}>
    <div className="section-head"><div><h3>Apollo</h3><p className="muted">Not connected. {isMD ? 'Add your Apollo API key as APOLLO_API_KEY in Vercel (Settings → Environment Variables) and redeploy. Contacts you save in Apollo will then appear here as new leads.' : 'Ask the MD to connect Apollo.'}</p></div></div>
  </div>;

  return <div className="card apollo-panel" style={{ marginTop: 18 }}>
    <div className="section-head">
      <div><h3>Apollo <span className="pill green">Connected</span></h3>
        <p className="muted">Every contact you save in Apollo becomes a NEW lead here with a follow-up for today. Checked about every 10 minutes while the app is in use. {last ? <>Last sync {when(last.at)}{last.error ? '' : `: ${last.created} added`}.</> : 'Not synced yet.'}</p>
        {last?.error && <p className="error">Last sync failed: {last.error}</p>}
      </div>
      <div className="row-actions">
        {isMD && <label className="inline-label">Leads go to<select value={ownerId ?? ''} disabled={busy} onChange={(e) => owner(e.target.value)}><option value="">First sales person</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <button className="btn small" disabled={busy} onClick={sync}>{busy ? 'Syncing…' : 'Sync now'}</button>
      </div>
    </div>
    {msg && <p className="muted">{msg}</p>}
    {error && <p className="error">{error}</p>}
  </div>;
}
