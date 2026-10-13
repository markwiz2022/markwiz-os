import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';

const CHANNELS = ['CALL', 'WHATSAPP', 'EMAIL', 'LINKEDIN', 'MEETING'];

export async function POST(req: Request) {
  const g = await guard('crm'); if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json();
  const channel = String(b.channel || '');
  const count = Math.round(Number(b.count ?? 1));
  if (!CHANNELS.includes(channel)) return NextResponse.json({ error: 'Choose a channel.' }, { status: 400 });
  if (!(count >= 1 && count <= 100)) return NextResponse.json({ error: 'Log between 1 and 100 at a time.' }, { status: 400 });
  const leadId = b.leadId ? String(b.leadId) : null;
  if (leadId && !(await db.lead.findUnique({ where: { id: leadId }, select: { id: true } }))) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
  const log = await db.outreachLog.create({ data: { userId: u.id, channel, count: leadId ? 1 : count, leadId, note: b.note ? String(b.note).slice(0, 300) : null } });
  if (leadId) {
    await db.leadActivity.create({ data: { leadId, userId: u.id, type: channel, note: b.note ? String(b.note).slice(0, 300) : null } });
    await db.lead.update({ where: { id: leadId }, data: { lastContact: new Date() } });
  }
  return NextResponse.json(log);
}
