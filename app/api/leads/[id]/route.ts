import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';

const STAGES = ['NEW', 'QUALIFIED', 'MEETING', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('crm'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  const b = await req.json();
  const l = await db.lead.findUnique({ where: { id } });
  if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (b.stage !== undefined) { if (!STAGES.includes(String(b.stage))) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 }); data.stage = b.stage; }
  for (const k of ['nextAction', 'source', 'company', 'email', 'phone', 'website', 'industry', 'notes']) if (b[k] !== undefined) data[k] = b[k];
  if (b.value !== undefined) data.value = Number(b.value);
  if (b.probability !== undefined) data.probability = Math.max(0, Math.min(100, Number(b.probability)));
  if (b.nextFollowUp !== undefined) data.nextFollowUp = b.nextFollowUp ? new Date(b.nextFollowUp) : null;
  if (b.lastContact) data.lastContact = new Date(b.lastContact);
  const updated = await db.lead.update({ where: { id }, data });
  // Stage changes are recorded by the server so sales KPIs can't drift from the pipeline.
  if (b.stage !== undefined && b.stage !== l.stage) await db.leadActivity.create({ data: { leadId: id, userId: u.id, type: 'STAGE_CHANGE', note: `Moved to ${b.stage}`, toStage: String(b.stage) } });
  if (b.activity && b.activity.type !== 'STAGE_CHANGE') await db.leadActivity.create({ data: { leadId: id, userId: u.id, type: String(b.activity.type), note: b.activity.note || null } });
  await audit(u.id, 'UPDATE', 'Lead', id, data);
  return NextResponse.json(updated);
}
