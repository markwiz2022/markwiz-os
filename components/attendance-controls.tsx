'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AttendanceControls({ active, isWfh }: { active: boolean; isWfh?: boolean }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [late, setLate] = useState(false);
  const [lateMsg, setLateMsg] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [pendingMode, setPendingMode] = useState<'office' | 'wfh'>('office');

  async function call(action: string, extra: Record<string, any> = {}) {
    setBusy(true);
    setError('');
    const x = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await x.json();
    setBusy(false);
    if (!x.ok) {
      setError(j.error || 'Unable to update attendance');
      return;
    }
    setLate(false);
    setNote('');
    r.refresh();
  }

  async function handleClockIn(mode: 'office' | 'wfh') {
    setBusy(true);
    setError('');
    setPendingMode(mode);
    const x = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clock-in', mode }),
    });
    const j = await x.json();
    setBusy(false);
    if (!x.ok) {
      setError(j.error || 'Unable to clock in');
      return;
    }
    if (j.late) {
      setLate(true);
      setLateMsg(j.message || '');
      return;
    }
    r.refresh();
  }

  if (active) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isWfh && <span className="pill cyan">🏠 WFH</span>}
        <button className="btn danger" disabled={busy} onClick={() => call('clock-out')}>
          Clock out
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" disabled={busy} onClick={() => handleClockIn('office')}>
          Clock in
        </button>
        <button
          className="btn secondary"
          style={{ borderColor: 'rgba(94, 234, 212, 0.4)', color: '#5eead4', fontWeight: 700 }}
          disabled={busy}
          onClick={() => handleClockIn('wfh')}
          title="Work from home"
        >
          🏠 WFH
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {late && (
        <div className="late-box">
          <b>Late check-in {pendingMode === 'wfh' ? '(Work From Home)' : ''}</b>
          <p>{lateMsg || 'You are checking in after the grace time.'}</p>
          <label>
            Regularisation note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why you are checking in late"
            />
          </label>
          <div className="actions">
            <button
              className="btn"
              disabled={busy || !note.trim()}
              onClick={() => call('regularise', { note, mode: pendingMode })}
            >
              Regularise
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => call('accept-deduction', { mode: pendingMode })}
            >
              Accept 0.5 day salary deduction
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => setLate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
