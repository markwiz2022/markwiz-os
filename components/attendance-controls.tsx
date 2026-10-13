'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AttendanceControls({ active }: { active: boolean }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [late, setLate] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  async function call(action: string, extra: Record<string, string> = {}) {
    setBusy(true); setError('');
    const x = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
    const j = await x.json();
    setBusy(false);
    if (!x.ok) { setError(j.error || 'Unable to update attendance'); return; }
    setLate(false); setNote(''); r.refresh();
  }

  async function clockIn() {
    setBusy(true); setError('');
    const x = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clock-in' }) });
    const j = await x.json();
    setBusy(false);
    if (!x.ok) { setError(j.error || 'Unable to clock in'); return; }
    if (j.late) { setLate(true); return; }
    r.refresh();
  }

  if (active) return <button className="btn danger" disabled={busy} onClick={() => call('clock-out')}>Clock out</button>;

  return <div>
    <button className="btn" disabled={busy} onClick={clockIn}>Clock in</button>
    {error && <p className="error">{error}</p>}
    {late && <div className="late-box">
      <b>Late check-in</b>
      <p>You have passed the 9:00 AM check-in time.</p>
      <label>Regularisation note<input value={note} onChange={e => setNote(e.target.value)} placeholder="Explain why you are late" /></label>
      <div className="actions">
        <button className="btn" disabled={busy || !note.trim()} onClick={() => call('regularise', { note })}>Regularise</button>
        <button className="btn danger" disabled={busy} onClick={() => call('accept-deduction')}>Accept 0.5 day salary deduction</button>
        <button className="btn secondary" disabled={busy} onClick={() => setLate(false)}>Cancel</button>
      </div>
    </div>}
  </div>;
}
