'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';

export default function Login(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const r=useRouter();

  async function submit(e:React.FormEvent){
    e.preventDefault();
    setBusy(true); setErr('');
    try{
      const x=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),password})});
      const data=await x.json().catch(()=>({}));
      if(x.ok){ r.push(data.redirect || '/'); r.refresh(); }
      else setErr(data.error==='inactive'?'Your account is inactive. Contact the MD or HR.':data.error==='locked'?`Too many failed attempts. Try again in ${data.minutes||15} minutes, or ask the MD to reset your password.`:'Invalid email or password.');
    }catch{ setErr('Unable to sign in. Please try again.'); }
    finally{ setBusy(false); }
  }

  return <div className="login-page">
    <div className="login-card">
      <div className="eyebrow">MARKWIZ</div>
      <h1>Employee Login</h1>
      <p className="muted">Secure access to the Markwiz operating system.</p>
      <form className="form" onSubmit={submit}>
        <label>Work email<input value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@markwiz.com" autoComplete="email" required/></label>
        <label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required/></label>
        <button className="btn" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
        {err&&<p className="error">{err}</p>}
      </form>
      <div style={{marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px'}}>
        <Link href="/forgot-password" style={{color: '#a59bff', textDecoration: 'none', fontWeight: 600}}>
          Forgot password?
        </Link>
        <span className="muted">Role-based access</span>
      </div>
    </div>
  </div>
}
