'use client';
import { useState } from 'react';

export function ChangePassword() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('');
    if (newPassword !== confirm) { setError('The two new passwords do not match.'); return; }
    setBusy(true);
    const x = await fetch('/api/auth/password', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
    const j = await x.json(); setBusy(false);
    if (!x.ok) { setError(j.error || 'Unable to change password'); return; }
    setCurrent(''); setNew(''); setConfirm(''); setMsg('Password changed. Use it the next time you sign in.');
  }

  return <form className="card form" onSubmit={save}>
    <div className="section-head"><div><h3>Change my password</h3><p className="muted">At least 10 characters, with letters and numbers.</p></div></div>
    <div className="form-grid">
      <input type="password" value={currentPassword} onChange={e => setCurrent(e.target.value)} placeholder="Current password" required autoComplete="current-password" />
      <input type="password" value={newPassword} onChange={e => setNew(e.target.value)} placeholder="New password" required autoComplete="new-password" />
      <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" required autoComplete="new-password" />
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </div>
    {error && <p className="error">{error}</p>}
    {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
  </form>;
}

export function ResetPassword({ users }: { users: { id: string; name: string; role: string }[] }) {
  const [userId, setUser] = useState(users[0]?.id || '');
  const [newPassword, setNew] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg(''); setBusy(true);
    const x = await fetch('/api/auth/password', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, newPassword }) });
    const j = await x.json(); setBusy(false);
    if (!x.ok) { setError(j.error || 'Unable to reset password'); return; }
    setNew(''); setMsg(`Password reset for ${j.name}. Share it privately and ask them to change it.`);
  }

  return <form className="card form" onSubmit={save} style={{ marginTop: 18 }}>
    <div className="section-head"><div><h3>Reset a team member's password</h3><p className="muted">Only you can do this. They are notified in the app.</p></div></div>
    <div className="form-grid">
      <select value={userId} onChange={e => setUser(e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select>
      <input type="password" value={newPassword} onChange={e => setNew(e.target.value)} placeholder="New password" required autoComplete="new-password" />
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
    </div>
    {error && <p className="error">{error}</p>}
    {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
  </form>;
}
