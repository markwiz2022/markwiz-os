import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {getClientHealthBreakdown} from '@/lib/client-health';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {isOverdue} from '@/lib/task-flow';
import {istDateKey,istMinutes} from '@/lib/workcalendar';

export default async function Home(){
  const u=await currentUser();
  if(!u)redirect('/login');
  const now=new Date();
  const hour=Math.floor(istMinutes(now)/60);
  const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  const todayKey=istDateKey(now);
  const [clients,tasks,leads,invoices,users,leave,plans,sayDoPeople,openFlags,confirms]=await Promise.all([
    db.client.findMany({where:{active:true,internal:false},include:{tasks:{select:{status:true}}},orderBy:{healthScore:'asc'}}),
    db.task.findMany({where:{status:{notIn:['DONE','CLIENT']}},include:{client:true,owner:true},orderBy:{due:'asc'}}),
    db.lead.findMany({where:{stage:{not:'LOST'}},include:{owner:true}}),
    db.invoice.findMany({include:{client:true}}),
    db.user.findMany({where:{active:true}}),
    db.leaveRequest.count({where:{status:'PENDING'}}),
    db.dailyPlan.count({where:{dateKey:todayKey,noPlan:false}}),
    db.kpiTarget.count({where:{metric:'say_do',active:true,user:{active:true}}}),
    db.performanceFlag.count({where:{status:'OPEN'}}),
    db.onboardingCheckpoint.count({where:{result:'CONFIRM'}})
  ]);

  const healthClients=await Promise.all(clients.map(async c=>({client:c,health:await getClientHealthBreakdown(db,c.id)})));
  const green=healthClients.filter(x=>x.health.health==='GREEN').length;
  const amber=healthClients.filter(x=>x.health.health==='AMBER').length;
  const red=healthClients.filter(x=>x.health.health==='RED').length;
  const atRisk=healthClients.filter(x=>x.health.health!=='GREEN');
  const revenue=clients.reduce((s,c)=>s+c.retainer,0);
  const receivables=invoices.reduce((s,i)=>s+Math.max(0,i.amount-i.paid),0);
  const collected=invoices.reduce((s,i)=>s+i.paid,0);
  const overdueAmount=invoices.filter(i=>i.amount>i.paid&&new Date(i.dueDate)<new Date()).reduce((s,i)=>s+(i.amount-i.paid),0);
  const pipeline=leads.reduce((s,l)=>s+l.value*l.probability/100,0);
  const overdueTasks=tasks.filter(t=>isOverdue(t,now)).length;
  const todayTasks=tasks.filter(t=>istDateKey(t.due)===istDateKey(now)).length;
  const lateClient=tasks.filter(t=>t.clientFacing&&!t.client.internal&&isOverdue(t,now)).length;
  const noNextAction=leads.filter(l=>!['WON','LOST'].includes(l.stage)&&!l.nextAction).length;
  const overdueInvoices=invoices.filter(i=>i.amount>i.paid&&new Date(i.dueDate)<now);
  const working=users.filter(x=>x.checkInAt&&!x.checkOutAt).length;
  const attention=[
    ...healthClients.filter(x=>x.health.health==='RED').slice(0,3).map(x=>({tone:'red',title:x.client.name,body:x.health.issues[0]?`${x.health.issues[0].reason}: ${x.health.issues[0].task}`:'Client health is critical.'})),
    ...tasks.filter(t=>isOverdue(t,now)).slice(0,3).map(t=>({tone:'amber',title:t.desc,body:`${t.client.name} · ${t.owner.name} · overdue`})),
    ...(u.role==='MD'?overdueInvoices.slice(0,2).map(i=>({tone:'red',title:`Invoice overdue · ${i.client.name}`,body:`₹${Math.max(0,i.amount-i.paid).toLocaleString('en-IN')} outstanding` })):[]),
  ].slice(0,6);

  return <div className="page">
    <section className="command-hero">
      <div className="hero-row">
        <div>
          <div className="eyebrow">MARKWIZ OS · COMMAND CENTRE</div>
          <h1>{greeting}, {u.name.split(' ')[0]}.</h1>
          <div className="muted">Your executive view of clients, delivery, sales and cash.</div>
        </div>
        <div className="hero-status">
          <span className="hero-chip">{now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}</span>
          <span className="hero-chip">{users.length} active people</span>
          <span className="hero-chip">{green} healthy · {amber} watch · {red} critical</span>
        </div>
      </div>
    </section>

    {u.role==='MD'&&<div className="card autopilot-strip">
      <div><div className="label">Autopilot</div><b>Only reds reach you.</b><span className="muted">The rest runs on rules.</span></div>
      <Link href="/exceptions"><b className={lateClient?'danger-text':''}>{lateClient}</b><span>late client work</span></Link>
      <Link href="/exceptions"><b className={red?'danger-text':''}>{red}</b><span>Red clients</span></Link>
      <Link href="/today"><b>{plans}/{sayDoPeople}</b><span>plans committed today</span></Link>
      <Link href="/scorecards"><b className={openFlags?'danger-text':''}>{openFlags+confirms}</b><span>flags and checkpoints to decide</span></Link>
      <Link className="btn" href="/exceptions">Open exceptions</Link>
    </div>}

    <div className="grid">
      {u.role==='MD'&&<K t="Monthly retainers" v={`₹${revenue.toLocaleString('en-IN')}`} note={`${clients.length} active clients`}/>}
      {['MD','SALES'].includes(u.role)&&<K t="Weighted pipeline" v={`₹${Math.round(pipeline).toLocaleString('en-IN')}`} note={`${leads.length} open opportunities`}/>}
      {u.role==='MD'&&<K t="Receivables" v={`₹${receivables.toLocaleString('en-IN')}`} note={`${overdueInvoices.length} overdue`} bad={overdueInvoices.length>0}/>}
      {u.role!=='MD'&&<div className="card kpi-card"><div className="label">My pay</div><div className="kpi">Private</div><Link className="secondary btn" href="/my-pay">Open payslips</Link></div>}
      {u.role==='MD'&&<K t="Collected" v={`₹${collected.toLocaleString('en-IN')}`} note="Paid to date"/>}
    </div>

    <div className="grid2" style={{marginTop:14}}>
      <div className="card">
        <div className="section-head"><div><h3>Client health</h3><p className="muted">The accounts that need attention, before they become problems.</p></div><Link className="secondary btn" href="/clients">Open clients</Link></div>
        <div className="health-distribution"><span className="health-green" style={{width:`${clients.length?green/clients.length*100:0}%`}}/><span className="health-amber" style={{width:`${clients.length?amber/clients.length*100:0}%`}}/><span className="health-red" style={{width:`${clients.length?red/clients.length*100:0}%`}}/></div>
        <div className="hero-status" style={{marginBottom:8}}><span className="pill green">{green} GREEN</span><span className="pill amber">{amber} AMBER</span><span className="pill red">{red} RED</span></div>
        <table className="table"><thead><tr><th>Client</th><th>Health</th><th>Impact</th><th>Owner</th></tr></thead><tbody>
          {healthClients.slice(0,7).map(({client,health})=>{const issue=health.issues[0];return <tr key={client.id}><td><Link href={`/clients/${client.id}`}><b>{client.name}</b></Link><div className="muted">{client.company||client.industry||'Client account'}</div></td><td><span className={`pill ${health.health.toLowerCase()}`}>{health.health} · {health.score}</span></td><td>{issue?`${issue.reason} · -${issue.deduction}`:'On track'}</td><td>{issue?.ownerName||client.accountManager||'—'}</td></tr>})}
        </tbody></table>
      </div>

      <div className="card">
        <div className="section-head"><div><h3>Needs your attention</h3><p className="muted">A focused queue instead of another dashboard full of noise.</p></div>{u.role==='MD'&&<Link className="secondary btn" href="/ai-coo">AI COO</Link>}</div>
        {attention.length===0?<div className="empty-state">No material operating exceptions detected.</div>:<div>{attention.map((a,i)=><div className="attention-item" key={i}><span className="attention-dot" style={{color:a.tone==='red'?'#ff667d':'#f5bd55',background:a.tone==='red'?'#ff667d':'#f5bd55'}}/><div className="attention-copy"><strong>{a.title}</strong><span>{a.body}</span></div></div>)}</div>}
        <div className="subtle-line"/>
        <div className="summary-grid compact two"><div><b>{overdueTasks}</b><span>overdue tasks</span></div><div><b>{todayTasks}</b><span>due today</span></div><div><b>{noNextAction}</b><span>sales gaps</span></div><div><b>{leave}</b><span>leave requests</span></div></div>
      </div>
    </div>

    <div className="grid3" style={{marginTop:14}}>
      <div className="card"><div className="section-head"><div><h3>Delivery pulse</h3><p className="muted">Where the team is spending attention.</p></div><span className="score-ring"><b>{Math.max(0,100-Math.min(100,overdueTasks*8))}</b></span></div><div className="summary-grid compact two"><div><b>{tasks.length}</b><span>open work</span></div><div><b>{working}</b><span>working now</span></div><div><b>{users.length}</b><span>active team</span></div><div><b>{overdueTasks}</b><span>at risk</span></div></div></div>
      {['MD','SALES'].includes(u.role)&&<div className="card"><h3>Sales pulse</h3><p className="muted">The next opportunities worth attention.</p><div className="summary-grid compact two" style={{marginTop:14}}><div><b>{leads.length}</b><span>open leads</span></div><div><b>₹{Math.round(pipeline).toLocaleString('en-IN')}</b><span>weighted value</span></div><div><b>{noNextAction}</b><span>missing next step</span></div><div><b>{leads.filter(l=>l.stage==='WON').length}</b><span>won</span></div></div></div>}
      {u.role==='MD'&&<div className="card"><h3>Cash pulse</h3><p className="muted">Money that needs to move.</p><div className="summary-grid compact two" style={{marginTop:14}}><div><b>₹{receivables.toLocaleString('en-IN')}</b><span>receivable</span></div><div><b>₹{collected.toLocaleString('en-IN')}</b><span>collected</span></div><div><b>{overdueInvoices.length}</b><span>overdue</span></div><div><b>₹{overdueAmount.toLocaleString('en-IN')}</b><span>overdue amount</span></div></div></div>}
      {u.role!=='MD'&&<div className="card"><h3>My Pay</h3><p className="muted">Your private salary and payslip history.</p><Link className="secondary btn" href="/my-pay">Open My Pay</Link></div>}
    </div>

    <div className="card" style={{marginTop:14}}><div className="section-head"><div><h3>Priority actions</h3><p className="muted">The shortest list of things worth doing next.</p></div><Link className="secondary btn" href="/tasks">Work queue</Link></div><div className="priority-list">
      {overdueTasks>0&&<div className="priority"><span className="pill red">DELIVERY</span><div><b>Clear {overdueTasks} overdue task{overdueTasks>1?'s':''}</b><div className="muted">Resolve the delivery risk before taking on additional commitments.</div></div></div>}
      {red>0&&<div className="priority"><span className="pill red">CLIENT</span><div><b>Recover {red} critical client{red>1?'s':''}</b><div className="muted">Review the health breakdown and assign a recovery action.</div></div></div>}
      {u.role==='MD'&&overdueInvoices.length>0&&<div className="priority"><span className="pill amber">CASH</span><div><b>Follow up {overdueInvoices.length} overdue invoice{overdueInvoices.length>1?'s':''}</b><div className="muted">Collections are now an operating priority.</div></div></div>}
      {noNextAction>0&&<div className="priority"><span className="pill amber">SALES</span><div><b>Give {noNextAction} opportunity{noNextAction>1?'ies':''} a next action</b><div className="muted">Every active lead should have a clear next step.</div></div></div>}
      {overdueTasks===0&&red===0&&overdueInvoices.length===0&&noNextAction===0&&<div className="priority"><span className="pill green">CLEAR</span><div><b>No material operating exception detected.</b><div className="muted">The operating dashboard is currently clear.</div></div></div>}
    </div></div>
  </div>
}
function K({t,v,note,bad}:{t:string,v:string,note:string,bad?:boolean}){return <div className="card kpi-card"><div className="label">{t}</div><div className="kpi">{v}</div><div className={bad?'kpi-trend danger-text':'kpi-trend'}>{note}</div></div>}
