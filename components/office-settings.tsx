'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';

type Office={name:string;lat:number;lng:number;radiusM:number};

/** MD: the office used for clock-in, with a button to use where you are standing right now. */
export default function OfficeSettings({office}:{office:Office}){
  const r=useRouter();
  const [open,setOpen]=useState(false);
  const [f,setF]=useState({name:office.name,lat:String(office.lat),lng:String(office.lng),radiusM:String(office.radiusM)});
  const [msg,setMsg]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);

  async function save(body:Record<string,unknown>){
    setBusy(true);setErr('');setMsg('');
    const x=await fetch('/api/office',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    setBusy(false);
    if(!x.ok){setErr((await x.json().catch(()=>({}))).error||'Unable to save');return}
    setMsg('Saved.');setOpen(false);r.refresh();
  }
  function useHere(){
    if(!navigator.geolocation){setErr('This browser cannot share location.');return}
    setBusy(true);setErr('');
    navigator.geolocation.getCurrentPosition(p=>{setBusy(false);setF({...f,lat:p.coords.latitude.toFixed(7),lng:p.coords.longitude.toFixed(7)});setMsg(`Location found (accurate to about ${Math.round(p.coords.accuracy)} m). Press Save.`)},()=>{setBusy(false);setErr('Location was blocked. Allow location for this site and try again.')},{enableHighAccuracy:true,timeout:15000});
  }

  const map=`https://www.google.com/maps?q=${office.lat},${office.lng}`;
  return <div className="card">
    <div className="section-head"><div><h3>Office location</h3><p className="muted">Clock-ins within {office.radiusM} m of <b>{office.name}</b> count as office. Anywhere else is work from home (a half day). <a className="client-link" href={map} target="_blank" rel="noopener noreferrer">Check on Google Maps ↗</a></p></div>
      {!open&&<button className="btn secondary small" onClick={()=>setOpen(true)}>Change</button>}</div>
    {open&&<div className="inline-edit">
      <input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Office name"/>
      <div className="row-actions"><input value={f.lat} onChange={e=>setF({...f,lat:e.target.value})} placeholder="Latitude"/><input value={f.lng} onChange={e=>setF({...f,lng:e.target.value})} placeholder="Longitude"/><label className="inline-label">Radius (m)<input type="number" min="50" max="2000" value={f.radiusM} onChange={e=>setF({...f,radiusM:e.target.value})} style={{width:90}}/></label></div>
      <div className="row-actions">
        <button className="btn secondary small" disabled={busy} onClick={useHere}>Use my current location</button>
        <button className="btn small" disabled={busy} onClick={()=>save({name:f.name,lat:Number(f.lat),lng:Number(f.lng),radiusM:Number(f.radiusM)})}>Save</button>
        <button className="btn secondary small" disabled={busy} onClick={()=>save({reset:true})}>Reset to Novel Office</button>
        <button className="btn secondary small" onClick={()=>setOpen(false)}>Cancel</button>
      </div>
      <p className="muted">Tip: stand inside the office and press “Use my current location” for the most accurate point. 150 m suits most buildings; raise it if people inside are being marked WFH.</p>
    </div>}
    {msg&&<p className="success-text">{msg}</p>}{err&&<p className="error">{err}</p>}
  </div>;
}
