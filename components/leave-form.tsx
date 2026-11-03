'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {countWorkingDays} from '@/lib/workcalendar';

const fmt=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(2).replace(/0$/,'');

/** Plan and request leave. Shows how many working days the dates use and what is left afterwards. */
export default function LeaveForm({canBook,left,total}:{canBook:number;left:number;total:number}){
  const [startDate,setStart]=useState('');
  const [endDate,setEnd]=useState('');
  const [halfDay,setHalf]=useState(false);
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const [done,setDone]=useState('');
  const [busy,setBusy]=useState(false);
  const r=useRouter();

  const end=endDate||startDate;
  let uses=0;
  if(startDate&&end>=startDate){
    const wd=countWorkingDays(new Date(`${startDate}T00:00:00+05:30`),new Date(`${end}T23:59:59+05:30`));
    uses=halfDay&&startDate===end?Math.min(0.5,wd):wd;
  }
  const over=uses>canBook;

  async function add(e:React.FormEvent){
    e.preventDefault();setError('');setDone('');setBusy(true);
    const x=await fetch('/api/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate:end,halfDay,reason})});
    setBusy(false);
    if(!x.ok){setError((await x.json().catch(()=>({}))).error||'Unable to submit');return}
    setReason('');setStart('');setEnd('');setHalf(false);setDone('Request sent. The MD has been notified.');r.refresh();
  }

  return <form className="card form" onSubmit={add}>
    <div className="section-head"><div><h3>Plan your leave</h3><p className="muted">Pick the dates you’ll be away. Only working days are counted. Check the team calendar below so you don’t clash with someone else.</p></div>
      <div className="balance-chip"><b>{fmt(left)}</b><span>of {fmt(total)} days left</span></div></div>
    <div className="form-grid">
      <label>From<input type="date" value={startDate} onChange={e=>setStart(e.target.value)} required/></label>
      <label>To<input type="date" value={endDate} onChange={e=>setEnd(e.target.value)} min={startDate}/></label>
      <label>Reason<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Family function, travel…" required/></label>
      <button className="btn" disabled={busy||over||(!!startDate&&uses===0)}>{busy?'Sending…':'Request leave'}</button>
    </div>
    <label className="check-label muted" style={{marginTop:10}}>
      <input type="checkbox" checked={halfDay} onChange={e=>setHalf(e.target.checked)}/>
      Half day (single date only)
    </label>
    {startDate&&<p className={over?'error':'muted'}>{uses===0?'Those dates are weekly offs: nothing to request.':`Uses ${fmt(uses)} working day${uses===1?'':'s'}. ${over?`You can book ${fmt(canBook)} more right now.`:`You’d have ${fmt(left-uses)} left once approved.`}`}</p>}
    {error&&<p className="error">{error}</p>}
    {done&&<p className="success-text">{done}</p>}
  </form>;
}
