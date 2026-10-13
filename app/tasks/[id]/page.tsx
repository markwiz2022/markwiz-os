import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiProofEnabled, type ProofIssue } from '@/lib/proof-ai';
import { availableActions, canManage, canView, canWriteCopy, CATEGORIES, isOverdue, readChecklist, STATUS_LABEL } from '@/lib/task-flow';
import { dateTime, dueLabel } from '@/lib/format';
import { istDateKey } from '@/lib/workcalendar';
import { ChecklistPanel, CommentForm, CopyEditor, IncidentForm, RunAiCheck, TaskActionBar, TaskEditForm, UploadPanel } from '@/components/ops';

const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Created', STARTED: 'Started', COPY_ADDED: 'Approved copy attached', COPY_CHANGED: 'Copy changed', FILE_UPLOADED: 'Design uploaded', LINK_SET: 'Link updated',
  HANDED_IN: 'Handed in', PROOF_PASSED: 'Passed proof check', PROOF_RETURNED: 'Sent back by proof check', REVIEW_RETURNED: 'Sent back in review',
  SENT_TO_CLIENT: 'Sent to client', RELEASED: 'Approved and closed', CLIENT_APPROVED: 'Client approved', CLIENT_CHANGES: 'Client asked for changes',
  AUTO_CLOSED: 'Closed automatically', OVERDUE: 'Went overdue', ESCALATED: 'Escalated to the MD', EDITED: 'Edited', STATUS_OVERRIDE: 'Status overridden by MD', INCIDENT: 'Incident logged',
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePageUser('tasks');
  const { id } = await params;
  const t = await db.task.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, internal: true } }, owner: { select: { id: true, name: true } }, assigner: { select: { id: true, name: true } },
      files: { select: { id: true, name: true, size: true, createdAt: true, mime: true }, orderBy: { createdAt: 'desc' } },
      proofChecks: { orderBy: { createdAt: 'desc' }, take: 1 }, events: { orderBy: { createdAt: 'asc' } }, comments: { orderBy: { createdAt: 'asc' } }, incidents: true,
    },
  });
  if (!t) notFound();
  if (!canView(t, u)) redirect('/tasks');
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const nameOf = (id: string | null | undefined) => users.find((x) => x.id === id)?.name ?? (id ? 'Former member' : 'System');
  const owner = t.ownerId === u.id;
  const lead = u.role === 'MD' || u.role === 'DMM';
  const latestFile = t.files[0];
  const check = t.proofChecks[0];
  const checkIsCurrent = !!check && !!latestFile && check.fileId === latestFile.id;
  const issues = (checkIsCurrent && Array.isArray(check.issues) ? check.issues : []) as ProofIssue[];
  const actions = availableActions(t, u);
  const checklist = readChecklist(t.checklist);
  const editable = ['OPEN', 'IN_PROGRESS'].includes(t.status);
  const timeline = [
    ...t.events.map((e) => ({ at: e.createdAt, who: nameOf(e.userId), text: EVENT_LABEL[e.type] ?? e.type, note: e.note, kind: e.type })),
    ...t.comments.map((c) => ({ at: c.createdAt, who: nameOf(c.authorId), text: 'Comment', note: c.body, kind: 'COMMENT' })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return <div className="page task-page">
    <Link href="/tasks" className="back">← Work & Tasks</Link>
    <div className="header"><div>
      <div className="eyebrow">{t.client.name.toUpperCase()} · {(CATEGORIES[t.category]?.label ?? t.category).toUpperCase()}</div>
      <h1>{t.desc}</h1>
      <p className="muted">Made by <b>{t.owner.name}</b> · assigned by {t.assigner.name} · {t.priority} · {t.approvalLevel === 'L0' ? 'maker releases' : t.approvalLevel === 'L1' ? 'DMM releases' : 'MD releases'}{t.proofById ? ` · proofed by ${nameOf(t.proofById)}` : ''}</p>
    </div><div className="hero-status"><span className={`pill ${t.status === 'CLIENT' || t.status === 'DONE' ? 'green' : isOverdue(t) ? 'red' : 'amber'}`}>{STATUS_LABEL[t.status]}</span><span className={`pill ${isOverdue(t) ? 'red' : ''}`}>{dueLabel(t.due, new Date(), t.status === 'CLIENT' || t.status === 'DONE')}</span></div></div>

    {actions.length > 0 && <div className="card action-card"><TaskActionBar taskId={t.id} actions={actions} aiFlags={issues.length} /></div>}

    <div className="grid2" style={{ marginTop: 14 }}>
      {(t.needsCopy || t.approvedCopy) && <section className="card"><div className="section-head"><div><h3>Approved copy</h3><p className="muted">{t.copyById ? `From ${nameOf(t.copyById)}${t.copyAt ? `, ${dateTime(t.copyAt)}` : ''}. ` : ''}The design must match this word for word.</p></div></div>
        <CopyEditor taskId={t.id} initial={t.approvedCopy ?? ''} canEdit={canWriteCopy(t, u)} isOwner={owner} /></section>}

      <section className="card"><div className="section-head"><div><h3>Deliverable</h3><p className="muted">{t.needsProof ? 'Upload the final design (or link it) before handing in. The proof check works from this.' : 'Attach the final file or link.'}</p></div></div>
        {latestFile && latestFile.mime.startsWith('image/') && <a href={`/api/files/${latestFile.id}`} target="_blank"><img className="proof-image" src={`/api/files/${latestFile.id}`} alt={latestFile.name} /></a>}
        {t.deliverableUrl && <p className="muted"><a className="client-link" href={t.deliverableUrl} target="_blank" rel="noreferrer">{t.deliverableUrl}</a></p>}
        {!latestFile && !t.deliverableUrl && <div className="empty-state">Nothing uploaded yet.</div>}
        {t.files.length > 1 && <p className="muted">{t.files.length} versions: {t.files.map((f, i) => <a key={f.id} href={`/api/files/${f.id}`} target="_blank" className="client-link">{i === 0 ? 'latest' : `v${t.files.length - i}`} </a>)}</p>}
        <UploadPanel taskId={t.id} link={t.deliverableUrl ?? ''} canEdit={editable && (owner || canManage(t, u))} />
      </section>

      {latestFile && latestFile.mime.startsWith('image/') && <section className="card"><div className="section-head"><div><h3>AI spell and copy check</h3><p className="muted">Reads every word off the design and compares it with the approved copy. It flags; a person decides.</p></div>{aiProofEnabled() && <RunAiCheck taskId={t.id} label={checkIsCurrent ? 'Run again' : 'Run AI check'} />}</div>
        {!aiProofEnabled() ? <div className="empty-state">AI check isn’t switched on. Gopi needs to add ANTHROPIC_API_KEY to the server settings.</div>
          : !checkIsCurrent ? <div className="empty-state">{check && !checkIsCurrent ? 'A new version was uploaded. Run the check again.' : 'Runs automatically on hand-in, or run it now.'}</div>
          : check.status === 'CLEAR' ? <div className="clear-state"><span>✓</span><div><strong>No spelling errors or copy mismatches found</strong><p>Still read it yourself before passing.</p></div></div>
          : check.status === 'ISSUES' ? <div className="issue-list">{issues.map((i, k) => <div className="issue" key={k}><span className="pill red">{i.type}</span><div><b>“{i.found}”</b> → {i.suggestion}{i.note && <small>{i.note}</small>}</div></div>)}{check.acknowledgedById && <p className="muted">Checked and accepted by {nameOf(check.acknowledgedById)}.</p>}</div>
          : <div className="empty-state">{check.error}</div>}
        {checkIsCurrent && check.extracted && <details className="extracted"><summary>Text read from the design</summary><pre>{check.extracted}</pre></details>}
      </section>}

      {checklist.length > 0 && <section className="card"><div className="section-head"><div><h3>QA checklist</h3><p className="muted">Every item must be ticked before hand-in.</p></div><span className="count-chip">{checklist.filter((c) => c.done).length}/{checklist.length}</span></div>
        <ChecklistPanel taskId={t.id} items={checklist} canEdit={editable && (owner || canManage(t, u))} /></section>}

      <section className="card"><div className="section-head"><div><h3>History</h3><p className="muted">{t.internalReturns} internal revision{t.internalReturns === 1 ? '' : 's'} · {t.clientReturns} from the client{t.firstSubmittedAt ? ` · first handed in ${dateTime(t.firstSubmittedAt)}` : ''}{t.deliveredAt ? ` · delivered ${dateTime(t.deliveredAt)}` : ''}</p></div></div>
        <div className="timeline">{timeline.map((e, i) => <div className="timeline-item" key={i}><div className="timeline-dot" /><div><div className="timeline-meta"><span>{e.who}</span><time>{dateTime(e.at)}</time></div><strong>{e.text}</strong>{e.note && <p>{e.note}</p>}</div></div>)}</div>
        <CommentForm taskId={t.id} />
      </section>

      {(canManage(t, u) || owner) && t.status !== 'DONE' && <section className="card"><div className="section-head"><div><h3>Change task</h3><p className="muted">Makers can’t move their own due dates or switch off checks. Every change is logged.</p></div></div>
        <TaskEditForm taskId={t.id} due={istDateKey(t.due)} priority={t.priority} level={t.approvalLevel} ownerId={t.ownerId} users={users} needsCopy={t.needsCopy} needsProof={t.needsProof} isLead={lead} isMD={u.role === 'MD'} /></section>}

      {!t.client.internal && (t.deliveredAt || t.status === 'CLIENT' || t.status === 'DONE') && (lead || t.assignerId === u.id) && !owner && <section className="card"><div className="section-head"><div><h3>Something went wrong after delivery?</h3><p className="muted">Logged against this task, its maker and its proof check. It counts on scorecards and client health.</p></div></div>
        {t.incidents.map((i) => <div className="priority" key={i.id}><span className="pill red">{i.type}</span><div>{i.description}</div></div>)}
        <IncidentForm taskId={t.id} types={t.category === 'WEB' ? [{ key: 'BUG', label: 'Client-reported bug' }, { key: 'ERROR', label: 'Error reached the client' }] : [{ key: 'ERROR', label: 'Error reached the client' }]} /></section>}
    </div>
  </div>;
}
