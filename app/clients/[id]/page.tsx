import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getClientHealthBreakdown } from '@/lib/client-health';
import ProjectForm from '@/components/project-form';
import { IncidentForm } from '@/components/ops';
import { INCIDENT_LABEL } from '@/lib/client-health';
import { describeCadence } from '@/lib/scope';
import { isOverdue, STATUS_LABEL } from '@/lib/task-flow';

function money(n:number){return `₹${n.toLocaleString('en-IN')}`}
function date(v:Date|string|null|undefined){return v?new Date(v).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}
function relativeDue(v:Date){const days=Math.ceil((new Date(v).getTime()-Date.now())/86400000);if(days<0)return `${Math.abs(days)}d overdue`;if(days===0)return 'Due today';if(days===1)return 'Due tomorrow';return `Due in ${days}d`}

export default async function ClientDetail({params}:{params:Promise<{id:string}>}){
  const u=await requirePageUser('clients');
  const {id}=await params;
  const c=await db.client.findUnique({where:{id},include:{
    projects:{include:{tasks:{include:{owner:true}}}},
    tasks:{include:{owner:true},orderBy:{due:'asc'}},
    invoices:{orderBy:{dueDate:'asc'}},
    expenses:{orderBy:{date:'desc'}},
    meetings:{orderBy:{date:'desc'}},
    scopeItems:{where:{active:true},orderBy:{createdAt:'asc'}},
    incidents:{orderBy:{createdAt:'desc'},take:10},
  }});
  if(!c)notFound();

  const health=await getClientHealthBreakdown(db,c.id);
  const openTasks=c.tasks.filter(t=>t.status!=='DONE'&&t.status!=='CLIENT');
  const overdue=c.tasks.filter(t=>isOverdue(t));
  const done=c.tasks.filter(t=>t.status==='DONE'||t.status==='CLIENT').length;
  const issuesShown=health.issues.filter(i=>u.role==='MD'||i.kind!=='INVOICE');
  const lead=u.role==='MD'||u.role==='DMM';
  const ar=c.invoices.reduce((s,i)=>s+Math.max(0,i.amount-i.paid),0);
  const billed=c.invoices.reduce((s,i)=>s+i.amount,0);
  const collected=c.invoices.reduce((s,i)=>s+i.paid,0);
  const recentActivity=[
    ...c.meetings.map(m=>({date:m.date,type:'Meeting',title:m.title,detail:m.notes||'Client meeting recorded'})),
    ...c.tasks.map(t=>({date:t.updatedAt,type:'Task',title:t.desc,detail:`${t.owner.name} · ${t.status}`})),
    ...(u.role==='MD'?c.invoices.map(i=>({date:i.updatedAt,type:'Invoice',title:i.number,detail:`${money(i.amount)} · ${i.status}`})):[]),
  ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,8);

  return <div className="page client-workspace">
    <div className="client-hero">
      <div>
        <Link href="/clients" className="back">← All clients</Link>
        <div className="eyebrow">CLIENT WORKSPACE</div>
        <div className="client-title-row">
          <div><h1>{c.name}</h1><p className="muted">{c.company||'No company'} · {c.industry||'No industry'}</p></div>
          <span className={`health-badge ${health.health.toLowerCase()}`}><i/>{health.health}<strong>{health.score}</strong></span>
        </div>
      </div>
      <div className="hero-actions"><Link className="btn secondary" href="/tasks">Open tasks</Link><Link className="btn" href="/crm">Open CRM</Link></div>
    </div>

    <div className="client-kpis">
      {u.role==='MD'&&<div className="metric-card"><span>Monthly retainer</span><strong>{money(c.retainer)}</strong><small>{c.accountManager||'No account manager'}</small></div>}
      <div className="metric-card"><span>Delivery</span><strong>{done}/{c.tasks.length}</strong><small>{overdue.length?`${overdue.length} overdue`:'No overdue tasks'}</small></div>
      {u.role==='MD'&&<div className="metric-card"><span>Receivables</span><strong>{money(ar)}</strong><small>{money(collected)} collected of {money(billed)}</small></div>}
      <div className="metric-card"><span>Renewal</span><strong>{date(c.renewalDate)}</strong><small>{c.startDate?`Client since ${date(c.startDate)}`:'Start date not set'}</small></div>
    </div>

    <div className="client-main-grid">
      <section className="card health-panel">
        <div className="panel-heading"><div><div className="eyebrow">ACCOUNT HEALTH</div><h2>What needs attention</h2><p className="muted">Every point below is tied to a specific delivery issue.</p></div><div className="health-score-large"><span>{health.score}</span><small>/100</small></div></div>
        <div className="health-progress"><span style={{width:`${Math.max(0,Math.min(100,health.score))}%`}}/></div>
        {issuesShown.length===0?<div className="clear-state"><span>✓</span><div><strong>Account is clear</strong><p>No overdue work, errors, complaints or late payments.</p></div></div>:<div className="health-issues">
          {issuesShown.map(issue=><div className="health-issue" key={issue.id}><div className="issue-icon">!</div><div className="issue-body"><strong>{issue.task}</strong><p>{issue.reason} · {relativeDue(issue.due)}</p><small>Owner <b>{issue.ownerName}</b> · {issue.ownerRole}</small></div><span className="impact">-{issue.deduction}</span></div>)}
        </div>}
        {Object.values(health.byOwner).length>0&&<div className="impact-section"><div className="mini-heading">TEAM IMPACT</div>{Object.values(health.byOwner).map(owner=><div className="impact-row" key={owner.ownerId||'unassigned'}><div><strong>{owner.ownerName}</strong><span>{owner.ownerRole}</span></div><b>{owner.deduction?`-${owner.deduction}`:'Clear'}</b></div>)}</div>}
      </section>

      {u.role==='MD'&&<section className="card account-panel">
        <div className="panel-heading"><div><div className="eyebrow">ACCOUNT</div><h2>Client profile</h2></div></div>
        <div className="profile-list">
          <div><span>Website</span><b>{c.website||'—'}</b></div><div><span>Phone</span><b>{c.phone||'—'}</b></div><div><span>Account manager</span><b>{c.accountManager||'Unassigned'}</b></div><div><span>Industry</span><b>{c.industry||'—'}</b></div><div><span>Started</span><b>{date(c.startDate)}</b></div><div><span>Renewal</span><b>{date(c.renewalDate)}</b></div>
        </div>
        {c.notes&&<div className="notes-box"><span>ACCOUNT NOTES</span><p>{c.notes}</p></div>}
      </section>}
    </div>

    <div className="client-secondary-grid">
      <section className="card"><div className="panel-heading"><div><div className="eyebrow">DELIVERY</div><h2>Projects</h2></div><span className="count-chip">{c.projects.length}</span></div><ProjectForm clientId={c.id}/><div className="project-list">{c.projects.length===0?<div className="empty-state">No projects yet.</div>:c.projects.map(p=>{const total=p.tasks.length;const complete=p.tasks.filter(t=>t.status==='DONE').length;const pct=total?Math.round(complete/total*100):0;return <div className="project-row" key={p.id}><div className="project-top"><div><strong>{p.name}</strong><span>{p.status} · {total} tasks</span></div><b>{pct}%</b></div><div className="project-progress"><span style={{width:`${pct}%`}}/></div></div>})}</div></section>

      <section className="card"><div className="panel-heading"><div><div className="eyebrow">ACTIVITY</div><h2>Recent activity</h2></div></div><div className="timeline">{recentActivity.length===0?<div className="empty-state">No activity recorded yet.</div>:recentActivity.map((a,i)=><div className="timeline-item" key={`${a.type}-${a.title}-${i}`}><div className="timeline-dot"/><div><div className="timeline-meta"><span>{a.type}</span><time>{date(a.date)}</time></div><strong>{a.title}</strong><p>{a.detail}</p></div></div>)}</div></section>
    </div>

    <section className="card delivery-panel"><div className="panel-heading"><div><div className="eyebrow">WORKSTREAM</div><h2>Task delivery</h2><p className="muted">The work currently determining this account's health.</p></div><span className="count-chip">{openTasks.length} open</span></div>
      {openTasks.length===0?<div className="clear-state"><span>✓</span><div><strong>All tasks completed</strong><p>There is no outstanding delivery work for this account.</p></div></div>:<div className="task-table"><div className="task-table-head"><span>Task</span><span>Owner</span><span>Due</span><span>Status</span></div>{openTasks.map(t=><div className="task-table-row" key={t.id}><div><strong>{t.desc}</strong><small>{t.priority} priority</small></div><span>{t.owner.name}</span><span className={new Date(t.due)<new Date()?'danger-text':''}>{relativeDue(t.due)}<small>{date(t.due)}</small></span><span className="pill">{STATUS_LABEL[t.status]??t.status}</span></div>)}</div>}
    </section>

    <div className="client-secondary-grid bottom-grid">
      <section className="card"><div className="panel-heading"><div><div className="eyebrow">SCOPE</div><h2>Recurring deliverables</h2></div><Link className="count-chip" href="/scopes">{c.scopeItems.length} active</Link></div>{c.scopeItems.length===0?<div className="empty-state">No scope loaded. {lead?'Add it on Client scopes so the work creates itself.':''}</div>:<div className="detail-list">{c.scopeItems.map(i=><div key={i.id}><span>{i.title}</span><b>{describeCadence(i)}</b></div>)}</div>}</section>
      <section className="card"><div className="panel-heading"><div><div className="eyebrow">QUALITY</div><h2>Errors and complaints</h2></div></div>{c.incidents.length===0?<div className="empty-state">Nothing logged.</div>:<div className="priority-list">{c.incidents.map(i=><div className="priority" key={i.id}><span className="pill red">{INCIDENT_LABEL[i.type]??i.type}</span><div>{i.description}<div className="muted">{date(i.createdAt)}</div></div></div>)}</div>}{lead&&!c.internal&&<div style={{marginTop:12}}><IncidentForm clientId={c.id} types={[{key:'COMPLAINT',label:'Client complaint'},{key:'ERROR',label:'Error reached the client'}]}/></div>}</section>
    </div>

    {u.role==='MD'&&<div className="client-secondary-grid bottom-grid">
      <section className="card"><div className="panel-heading"><div><div className="eyebrow">BILLING</div><h2>Invoices</h2></div></div>{c.invoices.length===0?<div className="empty-state">No invoices recorded.</div>:<div className="invoice-list">{c.invoices.map(i=><div className="invoice-row" key={i.id}><div><strong>{i.number}</strong><span>Due {date(i.dueDate)}</span></div><div><b>{money(i.amount)}</b><span>{money(i.paid)} paid</span></div><span className="pill">{i.status}</span></div>)}</div>}</section>
      <section className="card"><div className="panel-heading"><div><div className="eyebrow">MEETINGS</div><h2>Client conversations</h2></div></div>{c.meetings.length===0?<div className="empty-state">No meetings recorded.</div>:<div className="meeting-list">{c.meetings.slice(0,6).map(m=><div className="meeting-row" key={m.id}><div className="meeting-date">{new Date(m.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div><div><strong>{m.title}</strong><span>{m.notes||'No notes added'}</span></div></div>)}</div>}</section>
    </div>}
  </div>
}
