'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent(true);
      } else {
        setErr(data.error || 'Failed to send reset link. Please check your email.');
      }
    } catch {
      setErr('An error occurred. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="eyebrow">MARKWIZ OS</div>
        <h1>Forgot Password</h1>
        <p className="muted">Enter your registered work email to receive a password reset link.</p>

        {sent ? (
          <div style={{ marginTop: 24 }}>
            <div
              style={{
                padding: '16px 18px',
                borderRadius: '13px',
                background: 'rgba(72,215,138,0.1)',
                border: '1px solid rgba(72,215,138,0.22)',
                color: '#64e49c',
                fontSize: '12px',
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              <strong>Check your inbox!</strong>
              <div style={{ marginTop: 6, color: '#e2e8f0' }}>
                If an account exists for <b>{email}</b>, we have sent instructions to reset your password. The link will expire in 1 hour.
              </div>
            </div>
            <Link href="/login" className="btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Return to Login
            </Link>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <label>
              Work email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@markwiz.com"
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <button className="btn" disabled={busy || !email}>
              {busy ? 'Sending link…' : 'Send Reset Link'}
            </button>
            {err && <p className="error">{err}</p>}
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <Link href="/login" className="back" style={{ color: '#8f9bb0', textDecoration: 'underline', fontSize: '11px' }}>
                ← Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
