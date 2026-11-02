'use client';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');

    if (!token) {
      setErr('Invalid or missing reset token.');
      return;
    }

    if (password.length < 8) {
      setErr('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess(true);
      } else {
        setErr(data.error || 'Failed to reset password. Please try again or request a new link.');
      }
    } catch {
      setErr('A network error occurred. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="login-card">
        <div className="eyebrow">MARKWIZ OS</div>
        <h1>Invalid Link</h1>
        <p className="muted">This password reset link is missing a valid security token.</p>
        <div style={{ marginTop: 20 }}>
          <Link href="/forgot-password" className="btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Request New Reset Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="eyebrow">MARKWIZ OS</div>
      <h1>Create New Password</h1>
      <p className="muted">Enter and confirm your new password below (at least 8 characters).</p>

      {success ? (
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
            <strong>Password reset successful!</strong>
            <div style={{ marginTop: 6, color: '#e2e8f0' }}>
              Your account password has been updated. You can now log in with your new credentials.
            </div>
          </div>
          <Link href="/login" className="btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Sign In Now
          </Link>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
              autoComplete="new-password"
              required
            />
          </label>
          <button className="btn" disabled={busy || !password}>
            {busy ? 'Updating password…' : 'Reset Password'}
          </button>
          {err && <p className="error">{err}</p>}
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <Link href="/login" className="back" style={{ color: '#8f9bb0', textDecoration: 'underline', fontSize: '11px' }}>
              Cancel and Return to Login
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="login-page">
      <Suspense fallback={<div className="login-card"><div className="muted">Loading…</div></div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
