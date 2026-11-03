'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

/** MD/HR: approve or reject a pending request. */
export default function LeaveActions({id}:{id:string}){
  const r=useRouter();const [busy,setBusy]=useState(false);
  async function act(status:string){setBusy(true);const x=await fetch(`/api/leave/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});setBusy(false);if(!x.ok)alert((await x.json().catch(()=>({}))).error||'Unable to resolve');else r.refresh()}
  return <div className="actions"><button className="btn small" disabled={busy} onClick={()=>act('APPROVED')}>Approve</button><button className="btn danger small" disabled={busy} onClick={()=>act('REJECTED')}>Reject</button></div>;
}

/** Withdraw your own pending request, or (MD/HR) cancel leave, which returns the days. */
export function LeaveCancel({id,label='Withdraw'}:{id:string;label?:string}){
  const r=useRouter();const [busy,setBusy]=useState(false);
  async function cancel(){if(!confirm(`${label} this leave?`))return;setBusy(true);const x=await fetch(`/api/leave/${id}`,{method:'DELETE'});setBusy(false);if(!x.ok)alert((await x.json().catch(()=>({}))).error||'Unable to cancel');else r.refresh()}
  return <button className="btn secondary small" disabled={busy} onClick={cancel}>{busy?'…':label}</button>;
}

/** MD/HR: change someone's leave quota or days taken. */
export function LeaveBalanceEdit({userId,quota,taken}:{userId:string;quota:number;taken:number}){
  const r=useRouter();const [open,setOpen]=useState(false);const [q,setQ]=useState(String(quota));const [t,setT]=useState(String(taken));const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
  async function save(){setBusy(true);setErr('');const x=await fetch('/api/leave/balance',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,leaveQuota:Number(q),leavesTaken:Number(t)})});setBusy(false);if(!x.ok){setErr((await x.json().catch(()=>({}))).error||'Unable to save');return}setOpen(false);r.refresh()}
  if(!open)return <button className="link-button" onClick={()=>{setQ(String(quota));setT(String(taken));setOpen(true)}}>Edit</button>;
  return <div className="inline-edit">
    <label className="inline-label">Total<input type="number" min="0" step="0.5" value={q} onChange={e=>setQ(e.target.value)} style={{width:70}}/></label>
    <label className="inline-label">Taken<input type="number" min="0" step="0.5" value={t} onChange={e=>setT(e.target.value)} style={{width:70}}/></label>
    <div className="row-actions"><button className="btn small" disabled={busy} onClick={save}>Save</button><button className="btn secondary small" onClick={()=>setOpen(false)}>Cancel</button></div>
    {err&&<p className="error">{err}</p>}
  </div>;
}
