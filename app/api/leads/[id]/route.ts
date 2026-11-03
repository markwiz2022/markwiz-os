import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { LEAD_STAGES } from '@/lib/crm';
import { convertLeadToClient } from '@/lib/lead-convert';

const STAGES: readonly string[] = LEAD_STAGES;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('crm'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const l = await db.lead.findUnique({ where: { id } });
  if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  // Turn an already-won lead into a client: { convert: true }
  if (b.convert === true) {
    if (l.stage !== 'WON') return NextResponse.json({ error: 'Only won leads become clients' }, { status: 400 });
    return NextResponse.json(await convertLeadToClient(db, l, u));
  }
  const data: Record<string, unknown> = {};
  if (b.stage !== undefined) {
    if (!STAGES.includes(String(b.stage))) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    data.stage = b.stage;
    // A lost lead must say why, so win/loss reporting is possible.
    if (b.stage === 'LOST' && b.stage !== l.stage) {
      const reason = String(b.lostReason || '').trim();
      if (!reason) return NextResponse.json({ error: 'Give a reason before marking a lead lost' }, { status: 400 });
      data.lostReason = reason.slice(0, 300);
    }
    if (b.stage !== 'LOST') data.lostReason = null;
  }
  for (const k of ['nextAction', 'source', 'company', 'email', 'phone', 'website', 'industry', 'notes']) if (b[k] !== undefined) data[k] = b[k] === '' ? null : b[k];
  if (b.value !== undefined) { const v = Number(b.value); if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Value must be zero or more' }, { status: 400 }); data.value = v; }
  if (b.billing !== undefined) { if (!['MONTHLY', 'ONE_TIME', 'QUARTERLY', 'YEARLY'].includes(String(b.billing))) return NextResponse.json({ error: 'Invalid billing' }, { status: 400 }); data.billing = b.billing; }
  if (b.probability !== undefined) data.probability = Math.max(0, Math.min(100, Number(b.probability)));
  if (b.nextFollowUp !== undefined) data.nextFollowUp = b.nextFollowUp ? new Date(b.nextFollowUp) : null;
  if (b.lastContact) data.lastContact = new Date(b.lastContact);
  const updated = await db.lead.update({ where: { id }, data });
  // Stage changes are recorded by the server so sales KPIs can't drift from the pipeline.
  if (b.stage !== undefined && b.stage !== l.stage) await db.leadActivity.create({ data: { leadId: id, userId: u.id, type: 'STAGE_CHANGE', note: `Moved to ${b.stage}`, toStage: String(b.stage) } });
  if (b.activity && b.activity.type !== 'STAGE_CHANGE') await db.leadActivity.create({ data: { leadId: id, userId: u.id, type: String(b.activity.type), note: b.activity.note || null } });
  await audit(u.id, 'UPDATE', 'Lead', id, data);
  // A won lead becomes a client automatically.
  if (b.stage === 'WON' && l.stage !== 'WON') {
    const conversion = await convertLeadToClient(db, updated, u);
    return NextResponse.json({ ...updated, ...conversion });
  }
  return NextResponse.json(updated);
}
