'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

export default function LeaveForm(){
  const [startDate,setStart]=useState('');
  const [endDate,setEnd]=useState('');
  const [halfDay,setHalf]=useState(false);
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const r=useRouter();

  async function add(e:React.FormEvent){
    e.preventDefault();setError('');setBusy(true);
    const x=await fetch('/api/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate:endDate||startDate,halfDay,reason})});
    setBusy(false);
    if(!x.ok){setError((await x.json()).error||'Unable to submit');return}
    setReason('');setStart('');setEnd('');setHalf(false);r.refresh();
  }

  return <form className="card form" onSubmit={add}>
    <div className="section-head"><div><h3>Request leave</h3><p className="muted">Pick the dates you will be away. Only working days are counted.</p></div></div>
    <div className="form-grid">
      <input type="date" value={startDate} onChange={e=>setStart(e.target.value)} required/>
      <input type="date" value={endDate} onChange={e=>setEnd(e.target.value)} min={startDate} placeholder="End date"/>
      <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason" required/>
      <button className="btn" disabled={busy}>{busy?'Submitting…':'Submit request'}</button>
    </div>
    <label className="muted" style={{display:'flex',alignItems:'center',gap:8,marginTop:10}}>
      <input type="checkbox" style={{width:'auto'}} checked={halfDay} onChange={e=>setHalf(e.target.checked)}/>
      Half day (single date only)
    </label>
    {error&&<p className="error">{error}</p>}
  </form>;
}
