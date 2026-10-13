import type { Task } from '@prisma/client';
import type { Db } from './db';
import { deliveryLeads, mdUsers, notify } from './team';
import { isPastDue } from './workcalendar';

// ---------------------------------------------------------------------------
// Markwiz delivery rules
//
//   Copy → Work → Hand in → Proof check → Review / release → With client → Done
//
// - Copy gate: tasks that carry text (design, social, video) can't start until someone
//   other than the maker attaches the final approved copy. Makers paste, they never type.
// - Proof check: someone other than the maker checks every word against the approved copy.
//   The AI check flags spelling and copy mismatches; ignoring a flag has to be ticked.
// - Release: L0 the maker (or DMM) releases, L1 the DMM, L2 the MD. The MD can always release.
// - Anything returned counts as a revision. On-time is measured on hand-in (makers)
//   and on delivery to the client (DMM and company).
// ---------------------------------------------------------------------------

export type Actor = { id: string; name: string; role: string };

export const CATEGORIES: Record<string, { label: string; copy: boolean; proof: boolean; qa?: boolean }> = {
  DESIGN: { label: 'Design', copy: true, proof: true },
  SOCIAL: { label: 'Social post', copy: true, proof: true },
  VIDEO: { label: 'Video / motion', copy: true, proof: true },
  CONTENT: { label: 'Content / copywriting', copy: false, proof: true },
  REPORT: { label: 'Client report', copy: false, proof: true },
  WEB: { label: 'Website', copy: false, proof: false, qa: true },
  ADS: { label: 'Ads & campaigns', copy: false, proof: false },
  SEO: { label: 'SEO', copy: false, proof: false },
  GENERAL: { label: 'General', copy: false, proof: false },
  SYSTEM: { label: 'Markwiz OS fix', copy: false, proof: false },
  ONBOARDING: { label: 'Onboarding', copy: false, proof: false },
};

export const QA_CHECKLIST = [
  'Forms submit and reach the right inbox',
  'Works on mobile, tablet and desktop',
  'Tracking fires (GA4, Meta pixel, conversions)',
  'Every link and button works',
  'Page speed checked',
  'All text proofread against the approved copy',
  'Meta titles, descriptions and favicon set',
  'Backup taken before go-live',
];

export const STATUS_LABEL: Record<string, string> = {
  OPEN: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  REVIEW: 'In proof check',
  APPROVAL: 'In review',
  CLIENT: 'With client',
  DONE: 'Done',
};

export const HANDED_IN = ['REVIEW', 'APPROVAL', 'CLIENT', 'DONE'];

export type ChecklistItem = { label: string; done: boolean; by?: string; at?: string };

export function readChecklist(json: unknown): ChecklistItem[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ label: String(x.label ?? ''), done: Boolean(x.done), by: x.by ? String(x.by) : undefined, at: x.at ? String(x.at) : undefined }))
    .filter((x) => x.label);
}

export function defaultChecklist(category: string) {
  return CATEGORIES[category]?.qa ? QA_CHECKLIST.map((label) => ({ label, done: false })) : undefined;
}

type FlowTask = Pick<Task, 'id' | 'status' | 'ownerId' | 'assignerId' | 'approvalLevel' | 'clientFacing' | 'needsCopy' | 'needsProof' | 'approvedCopy' | 'due' | 'category' | 'checklist' | 'deliverableUrl'>;

export function isDelivered(t: { status: string }) { return t.status === 'CLIENT' || t.status === 'DONE'; }
export function isHandedIn(t: { status: string }) { return HANDED_IN.includes(t.status); }
export function isOverdue(t: { status: string; due: Date }, now = new Date()) { return !isDelivered(t) && isPastDue(t.due, now); }

export class FlowError extends Error {
  status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

const isMD = (a: Actor) => a.role === 'MD';
const isDMM = (a: Actor) => a.role === 'DMM';

export function canProof(t: FlowTask, a: Actor) { return a.id !== t.ownerId; }

export function canRelease(t: FlowTask, a: Actor) {
  if (isMD(a)) return true;
  if (t.approvalLevel === 'L2') return false;
  if (t.approvalLevel === 'L1') return isDMM(a) && a.id !== t.ownerId;
  return a.id === t.ownerId || isDMM(a);
}

export function canManage(t: FlowTask, a: Actor) { return isMD(a) || isDMM(a) || a.id === t.assignerId; }

export function canView(t: FlowTask, a: Actor) {
  return isMD(a) || isDMM(a) || a.id === t.ownerId || a.id === t.assignerId || t.status === 'REVIEW' || (t.status === 'APPROVAL' && canRelease(t, a));
}

export function canCloseWithClient(t: FlowTask, a: Actor) { return isMD(a) || isDMM(a) || a.id === t.ownerId || a.id === t.assignerId; }

/** Copy can be written by anyone except the maker. */
export function canWriteCopy(t: FlowTask, a: Actor) { return a.id !== t.ownerId && ['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(t.status); }

export type ActionKey = 'start' | 'pause' | 'hand_in' | 'proof_pass' | 'proof_return' | 'release' | 'release_return' | 'client_approved' | 'client_changes';

export type AvailableAction = { key: ActionKey; label: string; tone: 'primary' | 'secondary' | 'danger'; needsNote?: boolean; disabledReason?: string };

/** The buttons a person sees on a task. */
export function availableActions(t: FlowTask & { runningSince?: Date | null }, a: Actor): AvailableAction[] {
  const out: AvailableAction[] = [];
  const owner = a.id === t.ownerId;
  const qa = readChecklist(t.checklist);
  switch (t.status) {
    case 'OPEN':
    case 'IN_PROGRESS':
      if (owner) {
        if (t.status === 'IN_PROGRESS' && t.runningSince) out.push({ key: 'pause', label: 'Pause', tone: 'secondary' });
        else out.push({ key: 'start', label: 'Start', tone: 'secondary', disabledReason: t.needsCopy && !t.approvedCopy ? 'Waiting for the approved copy' : undefined });
        let reason: string | undefined;
        if (t.needsCopy && !t.approvedCopy) reason = 'Waiting for the approved copy';
        else if (qa.length && qa.some((x) => !x.done)) reason = 'Tick every QA item first';
        out.push({ key: 'hand_in', label: t.needsProof ? 'Hand in for proof check' : 'Hand in', tone: 'primary', disabledReason: reason });
      }
      break;
    case 'REVIEW':
      if (canProof(t, a)) {
        out.push({ key: 'proof_pass', label: 'Passed proof check', tone: 'primary' });
        out.push({ key: 'proof_return', label: 'Send back with corrections', tone: 'danger', needsNote: true });
      }
      break;
    case 'APPROVAL':
      if (canRelease(t, a)) {
        out.push({ key: 'release', label: t.clientFacing ? (owner ? 'Send to client' : 'Approve and send to client') : 'Approve and close', tone: 'primary' });
        if (!owner) out.push({ key: 'release_return', label: 'Send back', tone: 'danger', needsNote: true });
      }
      break;
    case 'CLIENT':
      if (canCloseWithClient(t, a)) {
        out.push({ key: 'client_approved', label: 'Client approved', tone: 'primary' });
        out.push({ key: 'client_changes', label: 'Client asked for changes', tone: 'danger', needsNote: true });
      }
      break;
  }
  return out;
}

async function event(db: Db, taskId: string, userId: string | null, type: string, note?: string) {
  await db.taskEvent.create({ data: { taskId, userId, type, note: note ?? null } });
}

async function stopTimer(db: Db, t: Task, userId: string) {
  if (!t.runningSince) return {};
  const seconds = Math.max(0, Math.floor((Date.now() - t.runningSince.getTime()) / 1000));
  await db.timeEntry.create({ data: { userId, taskId: t.id, seconds, startedAt: t.runningSince, endedAt: new Date() } });
  return { timeSeconds: t.timeSeconds + seconds, runningSince: null };
}

/** Delivery leads other than the maker; falls back to the MD when the maker is the only DMM. */
async function checkers(db: Db, excludeId: string) {
  const leads = (await deliveryLeads(db)).filter((u) => u.id !== excludeId).map((u) => u.id);
  return leads.length ? leads : (await mdUsers(db)).filter((u) => u.id !== excludeId).map((u) => u.id);
}

async function releasers(db: Db, t: Task) {
  if (t.approvalLevel === 'L2') return (await mdUsers(db)).map((u) => u.id);
  if (t.approvalLevel === 'L0') return [t.ownerId];
  return checkers(db, t.ownerId);
}

async function unblockDependents(db: Db, taskId: string) {
  await db.task.updateMany({ where: { blockedById: taskId, status: 'BLOCKED' }, data: { status: 'OPEN', blockedById: null } });
}

export async function assertP1Cap(db: Db, ownerId: string, excludeTaskId?: string) {
  const open = await db.task.count({ where: { ownerId, priority: 'P1', status: { notIn: ['CLIENT', 'DONE'] }, ...(excludeTaskId ? { NOT: { id: excludeTaskId } } : {}) } });
  if (open >= 3) {
    const person = await db.user.findUnique({ where: { id: ownerId }, select: { name: true } });
    throw new FlowError(`${person?.name ?? 'This person'} already has 3 open P1 tasks. Finish or downgrade one first.`);
  }
}

function requireNote(note: unknown) {
  const text = String(note ?? '').trim();
  if (text.length < 5) throw new FlowError('Add a short note saying what needs to change.', 400);
  return text.slice(0, 2000);
}

/** Applies one workflow action. Throws FlowError with a message the person can act on. */
export async function applyAction(db: Db, taskId: string, a: Actor, action: string, payload: Record<string, unknown> = {}) {
  const t = await db.task.findUnique({ where: { id: taskId }, include: { client: { select: { name: true } } } });
  if (!t) throw new FlowError('Task not found.', 404);
  const now = new Date();
  const owner = a.id === t.ownerId;
  const key = action === 'finish' ? 'hand_in' : action;

  switch (key) {
    case 'start': {
      if (!owner) throw new FlowError('Only the owner can start this task.', 403);
      if (!['OPEN', 'IN_PROGRESS'].includes(t.status)) throw new FlowError('This task can’t be started in its current state.');
      if (t.needsCopy && !t.approvedCopy) throw new FlowError('Waiting for the approved copy. Designers paste copy, they don’t type it. Ask the person who assigned this to add it.');
      const running = await db.task.findFirst({ where: { ownerId: a.id, runningSince: { not: null }, status: { notIn: ['DONE', 'CLIENT'] }, NOT: { id: t.id } } });
      if (running) throw new FlowError('Single-tasking rule: pause the active task first.');
      const updated = await db.task.update({ where: { id: t.id }, data: { status: 'IN_PROGRESS', runningSince: now } });
      if (t.status === 'OPEN' && !(await db.taskEvent.findFirst({ where: { taskId: t.id, type: 'STARTED' } }))) await event(db, t.id, a.id, 'STARTED');
      return updated;
    }
    case 'pause': {
      if (!owner) throw new FlowError('Only the owner can pause this task.', 403);
      const timer = await stopTimer(db, t, a.id);
      return db.task.update({ where: { id: t.id }, data: { ...timer, runningSince: null, status: 'OPEN' } });
    }
    case 'hand_in': {
      if (!owner) throw new FlowError('Only the owner can hand this in.', 403);
      if (!['OPEN', 'IN_PROGRESS'].includes(t.status)) throw new FlowError('This task has already been handed in.');
      if (t.needsCopy && !t.approvedCopy) throw new FlowError('This task needs approved copy before it can be handed in.');
      const qa = readChecklist(t.checklist);
      if (qa.length && qa.some((x) => !x.done)) throw new FlowError(`Tick every QA item before handing in (${qa.filter((x) => !x.done).length} left).`);
      if (t.needsProof) {
        const files = await db.taskFile.count({ where: { taskId: t.id } });
        if (!files && !t.deliverableUrl) throw new FlowError('Upload the final design or add a link to it before handing in, so it can be proofed.');
      }
      const timer = await stopTimer(db, t, a.id);
      const base = { ...timer, runningSince: null, firstSubmittedAt: t.firstSubmittedAt ?? now };
      await event(db, t.id, a.id, 'HANDED_IN', qa.length ? 'QA checklist complete' : undefined);
      if (t.needsProof) {
        const updated = await db.task.update({ where: { id: t.id }, data: { ...base, status: 'REVIEW' } });
        await notify(db, await checkers(db, t.ownerId), 'Proof check needed', `${a.name} handed in "${t.desc}" (${t.client.name}). Check every word against the approved copy.`);
        return updated;
      }
      if (t.approvalLevel === 'L0') {
        const saved = await db.task.update({ where: { id: t.id }, data: base, include: { client: { select: { name: true } } } });
        return release(db, saved, a, now, true);
      }
      const updated = await db.task.update({ where: { id: t.id }, data: { ...base, status: 'APPROVAL' } });
      await notify(db, await releasers(db, updated), 'Ready for your review', `${a.name} handed in "${t.desc}" (${t.client.name}).`);
      return updated;
    }
    case 'proof_pass': {
      if (t.status !== 'REVIEW') throw new FlowError('This task isn’t waiting for a proof check.');
      if (!canProof(t, a)) throw new FlowError('Someone other than the maker has to do the proof check.', 403);
      const latestFile = await db.taskFile.findFirst({ where: { taskId: t.id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      const check = latestFile ? await db.proofCheck.findFirst({ where: { taskId: t.id, fileId: latestFile.id }, orderBy: { createdAt: 'desc' } }) : null;
      const flagged = check?.status === 'ISSUES' ? (Array.isArray(check.issues) ? check.issues.length : 1) : 0;
      if (flagged && payload.acknowledge !== true) {
        throw new FlowError(`The AI check flagged ${flagged} item${flagged === 1 ? '' : 's'}. Tick "I’ve checked every flagged item" to pass it, or send it back.`);
      }
      if (flagged && check) await db.proofCheck.update({ where: { id: check.id }, data: { acknowledgedById: a.id, acknowledgedAt: now } });
      await event(db, t.id, a.id, 'PROOF_PASSED', flagged ? `Passed after checking ${flagged} AI flag${flagged === 1 ? '' : 's'}` : undefined);
      const updated = await db.task.update({ where: { id: t.id }, data: { proofById: a.id, proofAt: now, status: 'APPROVAL' } });
      await notify(db, await releasers(db, updated), 'Ready for your review', `"${t.desc}" (${t.client.name}) passed the proof check.`);
      return updated;
    }
    case 'proof_return': {
      if (t.status !== 'REVIEW') throw new FlowError('This task isn’t waiting for a proof check.');
      if (!canProof(t, a)) throw new FlowError('Someone other than the maker has to do the proof check.', 403);
      const note = requireNote(payload.note);
      await event(db, t.id, a.id, 'PROOF_RETURNED', note);
      await db.comment.create({ data: { taskId: t.id, authorId: a.id, body: `Proof check: ${note}` } });
      const updated = await db.task.update({ where: { id: t.id }, data: { status: 'OPEN', internalReturns: { increment: 1 } } });
      await notify(db, [t.ownerId], 'Corrections needed', `${a.name} sent back "${t.desc}": ${note}`);
      return updated;
    }
    case 'release': {
      if (t.status !== 'APPROVAL') throw new FlowError('This task isn’t waiting for review.');
      if (!canRelease(t, a)) throw new FlowError(t.approvalLevel === 'L2' ? 'Only the MD can release L2 work.' : 'Only the DMM or MD can release this.', 403);
      return release(db, t, a, now, false);
    }
    case 'release_return': {
      if (t.status !== 'APPROVAL') throw new FlowError('This task isn’t waiting for review.');
      if (!canRelease(t, a) || owner) throw new FlowError('Only the reviewer can send this back.', 403);
      const note = requireNote(payload.note);
      await event(db, t.id, a.id, 'REVIEW_RETURNED', note);
      await db.comment.create({ data: { taskId: t.id, authorId: a.id, body: `Review: ${note}` } });
      const updated = await db.task.update({ where: { id: t.id }, data: { status: 'OPEN', internalReturns: { increment: 1 }, proofById: null, proofAt: null } });
      await notify(db, [t.ownerId], 'Changes requested', `${a.name} sent back "${t.desc}": ${note}`);
      return updated;
    }
    case 'client_approved': {
      if (t.status !== 'CLIENT') throw new FlowError('This task isn’t with the client.');
      if (!canCloseWithClient(t, a)) throw new FlowError('Only the owner, the person who assigned it, the DMM or the MD can close this.', 403);
      await event(db, t.id, a.id, 'CLIENT_APPROVED');
      return db.task.update({ where: { id: t.id }, data: { status: 'DONE', completedAt: now } });
    }
    case 'client_changes': {
      if (t.status !== 'CLIENT') throw new FlowError('This task isn’t with the client.');
      if (!canCloseWithClient(t, a)) throw new FlowError('Only the owner, the person who assigned it, the DMM or the MD can log client changes.', 403);
      const note = requireNote(payload.note);
      await event(db, t.id, a.id, 'CLIENT_CHANGES', note);
      await db.comment.create({ data: { taskId: t.id, authorId: a.id, body: `Client changes: ${note}` } });
      const updated = await db.task.update({ where: { id: t.id }, data: { status: 'OPEN', clientReturns: { increment: 1 }, proofById: null, proofAt: null, reviewedById: null, reviewedAt: null } });
      if (t.ownerId !== a.id) await notify(db, [t.ownerId], 'Client asked for changes', `"${t.desc}" (${t.client.name}): ${note}`);
      return updated;
    }
    default:
      throw new FlowError('Unknown action.', 400);
  }
}

async function release(db: Db, t: Task & { client: { name: string } }, a: Actor, now: Date, selfRelease: boolean) {
  const data = t.clientFacing
    ? { status: 'CLIENT' as const, deliveredAt: t.deliveredAt ?? now, lastSentAt: now, reviewedById: selfRelease ? null : a.id, reviewedAt: selfRelease ? null : now }
    : { status: 'DONE' as const, deliveredAt: t.deliveredAt ?? now, completedAt: now, reviewedById: selfRelease ? null : a.id, reviewedAt: selfRelease ? null : now };
  await event(db, t.id, a.id, t.clientFacing ? 'SENT_TO_CLIENT' : 'RELEASED');
  const updated = await db.task.update({ where: { id: t.id }, data });
  if (!t.deliveredAt) await unblockDependents(db, t.id);
  if (t.ownerId !== a.id) await notify(db, [t.ownerId], t.clientFacing ? 'Sent to client' : 'Approved', `"${t.desc}" (${t.client.name}) was ${t.clientFacing ? 'sent to the client' : 'approved and closed'} by ${a.name}.`);
  return updated;
}

/** Adds or changes the approved copy. The maker can't write their own copy. */
export async function setCopy(db: Db, taskId: string, a: Actor, copy: string) {
  const t = await db.task.findUnique({ where: { id: taskId }, include: { client: { select: { name: true } } } });
  if (!t) throw new FlowError('Task not found.', 404);
  if (a.id === t.ownerId) throw new FlowError('Copy has to come from someone other than the maker. Ask the person who assigned this task.', 403);
  if (!['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(t.status)) throw new FlowError('Copy is locked once the work is handed in. Send it back first if the copy must change.');
  const text = copy.trim();
  if (text.length < 2) throw new FlowError('Paste the final copy.', 400);
  if (text.length > 8000) throw new FlowError('Copy is too long (8,000 characters maximum).', 400);
  const changed = !!t.approvedCopy;
  const updated = await db.task.update({ where: { id: t.id }, data: { approvedCopy: text, copyById: a.id, copyAt: new Date() } });
  const started = t.status !== 'OPEN' || !!t.firstSubmittedAt || !!(await db.taskEvent.findFirst({ where: { taskId: t.id, type: 'STARTED' }, select: { id: true } }));
  await event(db, t.id, a.id, changed ? 'COPY_CHANGED' : 'COPY_ADDED', changed && started ? 'Changed after work began' : undefined);
  await notify(db, [t.ownerId], changed ? 'Copy updated' : 'Copy is ready', `${a.name} ${changed ? 'updated' : 'added'} the approved copy for "${t.desc}" (${t.client.name}).`);
  return updated;
}

export async function toggleChecklist(db: Db, taskId: string, a: Actor, index: number, done: boolean) {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) throw new FlowError('Task not found.', 404);
  if (!(a.id === t.ownerId || canManage(t, a))) throw new FlowError('Only the owner can tick QA items.', 403);
  if (!['OPEN', 'IN_PROGRESS'].includes(t.status)) throw new FlowError('The QA checklist is locked after hand-in.');
  const list = readChecklist(t.checklist);
  if (!list[index]) throw new FlowError('Checklist item not found.', 404);
  list[index] = { ...list[index], done, by: done ? a.name : undefined, at: done ? new Date().toISOString() : undefined };
  return db.task.update({ where: { id: t.id }, data: { checklist: list } });
}

export async function setDeliverableLink(db: Db, taskId: string, a: Actor, url: string) {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) throw new FlowError('Task not found.', 404);
  if (!(a.id === t.ownerId || canManage(t, a))) throw new FlowError('Only the owner can set the deliverable link.', 403);
  if (!['OPEN', 'IN_PROGRESS'].includes(t.status)) throw new FlowError('The deliverable is locked after hand-in.');
  const clean = url.trim();
  if (clean && !/^https?:\/\/\S+$/i.test(clean)) throw new FlowError('Paste a full link starting with https://', 400);
  await event(db, t.id, a.id, 'LINK_SET', clean || 'Link removed');
  return db.task.update({ where: { id: t.id }, data: { deliverableUrl: clean || null } });
}

/** Changes to due date, owner, priority, level and checks. Makers can't move their own deadlines or remove checks. */
export async function editTask(db: Db, taskId: string, a: Actor, b: Record<string, unknown>) {
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) throw new FlowError('Task not found.', 404);
  const manage = canManage(t, a);
  const data: Record<string, unknown> = {};
  const notes: string[] = [];
  if (b.desc !== undefined && String(b.desc).trim() && String(b.desc).trim() !== t.desc) {
    if (!manage && a.id !== t.ownerId) throw new FlowError('Not allowed.', 403);
    data.desc = String(b.desc).trim().slice(0, 300);
  }
  if (b.due) {
    if (!manage || (a.id === t.ownerId && !['MD', 'DMM'].includes(a.role))) throw new FlowError('Only the person who assigned this, the DMM or the MD can move a due date.', 403);
    const due = new Date(String(b.due));
    if (isNaN(due.getTime())) throw new FlowError('Invalid due date.', 400);
    if (due.getTime() !== t.due.getTime()) { data.due = due; notes.push(`Due date moved from ${t.due.toISOString().slice(0, 10)} to ${String(b.due).slice(0, 10)}`); data.overdueNotifiedAt = null; data.escalatedAt = null; }
  }
  if (b.ownerId && b.ownerId !== t.ownerId) {
    if (!manage) throw new FlowError('Only the person who assigned this, the DMM or the MD can reassign it.', 403);
    const next = await db.user.findUnique({ where: { id: String(b.ownerId) }, select: { id: true, name: true, active: true } });
    if (!next?.active) throw new FlowError('Choose an active team member.', 400);
    if ((b.priority ?? t.priority) === 'P1') await assertP1Cap(db, next.id, t.id);
    data.ownerId = next.id; data.runningSince = null; notes.push(`Reassigned to ${next.name}`);
    await notify(db, [next.id], 'Task reassigned to you', `${a.name} gave you "${t.desc}".`);
  }
  if (b.priority && b.priority !== t.priority) {
    if (!['P1', 'P2', 'P3'].includes(String(b.priority))) throw new FlowError('Invalid priority.', 400);
    if (!manage && a.id !== t.ownerId) throw new FlowError('Not allowed.', 403);
    if (b.priority === 'P1') await assertP1Cap(db, String(data.ownerId ?? t.ownerId), t.id);
    data.priority = b.priority; notes.push(`Priority ${t.priority} → ${b.priority}`);
  }
  if (b.approvalLevel && b.approvalLevel !== t.approvalLevel) {
    if (!manage || (a.id === t.ownerId && !['MD', 'DMM'].includes(a.role))) throw new FlowError('Only the DMM, the MD or the person who assigned this can change the approval level.', 403);
    if (!['L0', 'L1', 'L2'].includes(String(b.approvalLevel))) throw new FlowError('Invalid approval level.', 400);
    data.approvalLevel = b.approvalLevel; notes.push(`Approval ${t.approvalLevel} → ${b.approvalLevel}`);
  }
  for (const flag of ['needsCopy', 'needsProof'] as const) {
    if (b[flag] !== undefined && Boolean(b[flag]) !== t[flag]) {
      if (!['MD', 'DMM'].includes(a.role)) throw new FlowError('Only the DMM or MD can switch checks on or off.', 403);
      data[flag] = Boolean(b[flag]); notes.push(`${flag === 'needsCopy' ? 'Copy gate' : 'Proof check'} ${b[flag] ? 'on' : 'off'}`);
    }
  }
  if (!Object.keys(data).length) return t;
  const updated = await db.task.update({ where: { id: t.id }, data });
  if (notes.length) await event(db, t.id, a.id, 'EDITED', notes.join(' · '));
  return updated;
}

/** MD-only escape hatch. Logged. */
export async function overrideStatus(db: Db, taskId: string, a: Actor, status: string, note: string) {
  if (a.role !== 'MD') throw new FlowError('Only the MD can override a status.', 403);
  const allowed = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'APPROVAL', 'CLIENT', 'DONE'];
  if (!allowed.includes(status)) throw new FlowError('Invalid status.', 400);
  const t = await db.task.findUnique({ where: { id: taskId } });
  if (!t) throw new FlowError('Task not found.', 404);
  const now = new Date();
  const data: Record<string, unknown> = { status, runningSince: null };
  if ((status === 'CLIENT' || status === 'DONE') && !t.deliveredAt) data.deliveredAt = now;
  if (status === 'CLIENT') data.lastSentAt = now;
  if (status === 'DONE') data.completedAt = now;
  await event(db, t.id, a.id, 'STATUS_OVERRIDE', `${t.status} → ${status}${note ? `: ${note}` : ''}`);
  const updated = await db.task.update({ where: { id: t.id }, data });
  if ((status === 'CLIENT' || status === 'DONE') && !t.deliveredAt) await unblockDependents(db, t.id);
  return updated;
}

export type NewTaskInput = {
  clientId: string; ownerId: string; desc: string; due: string; priority?: string; approvalLevel?: string;
  category?: string; needsCopy?: boolean; needsProof?: boolean; approvedCopy?: string; blockedById?: string | null; projectId?: string | null;
};

export async function createTask(db: Db, a: Actor, b: NewTaskInput) {
  if (!b.clientId || !b.ownerId || !String(b.desc || '').trim() || !b.due) throw new FlowError('Client, owner, description and due date are required.', 400);
  const [client, owner] = await Promise.all([
    db.client.findUnique({ where: { id: b.clientId }, select: { id: true, name: true, internal: true } }),
    db.user.findUnique({ where: { id: b.ownerId }, select: { id: true, name: true, active: true } }),
  ]);
  if (!client) throw new FlowError('Client not found.', 400);
  if (!owner?.active) throw new FlowError('Choose an active team member as owner.', 400);
  const due = new Date(b.due);
  if (isNaN(due.getTime())) throw new FlowError('Invalid due date.', 400);
  const category = CATEGORIES[b.category ?? ''] ? String(b.category) : 'GENERAL';
  const priority = ['P1', 'P2', 'P3'].includes(String(b.priority)) ? String(b.priority) : 'P2';
  if (priority === 'P1') await assertP1Cap(db, owner.id);
  const clientFacing = !client.internal && category !== 'ONBOARDING' && category !== 'SYSTEM';
  const needsCopy = b.needsCopy ?? CATEGORIES[category].copy;
  const needsProof = b.needsProof ?? CATEGORIES[category].proof;
  const level = ['L0', 'L1', 'L2'].includes(String(b.approvalLevel)) ? String(b.approvalLevel) : clientFacing ? 'L1' : 'L0';
  const blockedById = b.blockedById && b.blockedById !== 'none' ? b.blockedById : null;
  const copy = String(b.approvedCopy ?? '').trim();
  const t = await db.task.create({
    data: {
      clientId: client.id, projectId: b.projectId || null, ownerId: owner.id, assignerId: a.id, desc: String(b.desc).trim().slice(0, 300), due,
      priority: priority as 'P1' | 'P2' | 'P3', approvalLevel: level, blockedById, status: blockedById ? 'BLOCKED' : 'OPEN',
      category, clientFacing, needsCopy, needsProof, checklist: defaultChecklist(category),
      ...(copy && owner.id !== a.id ? { approvedCopy: copy.slice(0, 8000), copyById: a.id, copyAt: new Date() } : {}),
    },
  });
  await event(db, t.id, a.id, 'CREATED');
  if (copy && owner.id !== a.id) await event(db, t.id, a.id, 'COPY_ADDED');
  if (owner.id !== a.id) await notify(db, [owner.id], 'New task assigned', `${a.name} assigned you: ${t.desc} (${client.name})${needsCopy && !(copy && owner.id !== a.id) ? '. Copy to follow.' : ''}`);
  return t;
}
