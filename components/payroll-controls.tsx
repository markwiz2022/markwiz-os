'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SalaryEditor({ userId, salary, code }: { userId: string; salary: number; code?: string | null }) {
  const r = useRouter(); const [amount, setAmount] = useState(String(salary || '')); const [employeeCode, setEmployeeCode] = useState(code || ''); const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); const x = await fetch('/api/payroll/salary', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userId,monthlySalary:Number(amount),employeeCode}) }); const j=await x.json(); setBusy(false); if(!x.ok) return alert(j.error||'Unable to save salary'); r.refresh(); }
  return <div className="actions"><input className="inline-input" value={employeeCode} onChange={e=>setEmployeeCode(e.target.value)} placeholder="Employee ID" /><input className="inline-input" type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Monthly salary" /><button className="btn small" disabled={busy} onClick={save}>Save</button></div>;
}

export function PayrollActions({ runId, locked, pending }: { runId: string; locked: boolean; pending: boolean }) {
  const r=useRouter(); const [busy,setBusy]=useState(false);
  async function pay(){ if(pending) return alert('Resolve all pending regularisation requests first.'); if(!confirm('Mark this payroll as paid and lock the payslips?')) return; setBusy(true); const x=await fetch(`/api/payroll/${runId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pay',paidAt:new Date().toISOString()})}); const j=await x.json(); setBusy(false); if(!x.ok)return alert(j.error||'Unable to mark payroll paid'); r.refresh(); }
  if(locked) return <span className="pill green">PAID · LOCKED</span>;
  return <button className="btn" disabled={busy || pending} onClick={pay}>{pending?'Resolve regularisations':'Mark salary paid'}</button>;
}

export function GeneratePayroll({ month }: { month: string }) {
  const r=useRouter(); const [busy,setBusy]=useState(false);
  async function generate(){ setBusy(true); const x=await fetch('/api/payroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month})}); const j=await x.json(); setBusy(false); if(!x.ok)return alert(j.error||'Unable to generate payroll'); r.refresh(); }
  return <button className="btn" disabled={busy} onClick={generate}>{busy?'Calculating…':'Calculate / Refresh payroll'}</button>;
}
