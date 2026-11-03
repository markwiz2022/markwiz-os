'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Pos = { lat: number; lng: number; accuracy: number } | null;

/** Asks the browser for the current location. Resolves to null if the person refuses or it takes too long. */
function getPosition(): Promise<Pos> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export default function AttendanceControls({ active }: { active: boolean }) {
  const r = useRouter();
  const [busy, setBusy] = useState('');
  const [late, setLate] = useState(false);
  const [lateMsg, setLateMsg] = useState('');
  const [wfh, setWfh] = useState<{ message: string; pos: Pos } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pos, setPos] = useState<Pos>(null);

  async function post(body: Record<string, unknown>) {
    const x = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await x.json().catch(() => ({}));
    if (!x.ok) throw new Error(j.error || 'Unable to update attendance');
    return j;
  }

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy('Saving…'); setError('');
    try { await post({ action, position: pos, ...extra }); setLate(false); setWfh(null); setNote(''); r.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function clockIn(confirmWfh = false) {
    setError('');
    let p = pos;
    if (!confirmWfh) { setBusy('Checking your location…'); p = await getPosition(); setPos(p); }
    setBusy('Clocking in…');
    try {
      const j = await post({ action: 'clock-in', position: p, confirmWfh });
      if (j.wfhDetected) { setWfh({ message: j.message, pos: p }); return; }
      if (j.late) { setLate(true); setLateMsg(j.message || ''); return; }
      setWfh(null); r.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  if (active) return <button className="btn danger" disabled={!!busy} onClick={() => call('clock-out')}>{busy || 'Clock out'}</button>;

  return <div className="clock-box">
    {!wfh && !late && <button className="btn" disabled={!!busy} onClick={() => clockIn()}>{busy || 'Clock in'}</button>}
    {!wfh && !late && !busy && <p className="muted tiny-note">Your location is checked once, at clock-in, to confirm you are at the office.</p>}
    {error && <p className="error">{error}</p>}
    {wfh && <div className="wfh-box">
      <b>🏠 Work from home detected</b>
      <p>{wfh.message}</p>
      {!wfh.pos && <p className="muted">Your browser didn’t share your location. If you are at the office, allow location for this site (the icon next to the address bar) and try again.</p>}
      <div className="actions">
        <button className="btn" disabled={!!busy} onClick={() => clockIn(true)}>{busy || 'Clock in as work from home'}</button>
        <button className="btn secondary" disabled={!!busy} onClick={() => { setWfh(null); clockIn(); }}>Check location again</button>
        <button className="btn secondary" disabled={!!busy} onClick={() => setWfh(null)}>Cancel</button>
      </div>
    </div>}
    {late && <div className="late-box">
      <b>Late check-in</b>
      <p>{lateMsg || 'You are checking in after the grace time.'}</p>
      <label>Regularisation note<input value={note} onChange={e => setNote(e.target.value)} placeholder="Explain why you are late" /></label>
      <div className="actions">
        <button className="btn" disabled={!!busy || !note.trim()} onClick={() => call('regularise', { note })}>Regularise</button>
        <button className="btn danger" disabled={!!busy} onClick={() => call('accept-deduction')}>Accept 0.5 day salary deduction</button>
        <button className="btn secondary" disabled={!!busy} onClick={() => setLate(false)}>Cancel</button>
      </div>
    </div>}
  </div>;
}
