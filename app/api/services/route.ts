import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { serviceData } from '@/lib/service-input';

/** Add one-time or periodic work to a client. MD and Finance. */
export async function POST(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json().catch(() => ({}));
  const client = await db.client.findUnique({ where: { id: String(b.clientId || '') }, select: { id: true, internal: true } });
  if (!client || client.internal) return NextResponse.json({ error: 'Choose a client.' }, { status: 400 });
  const { data, error } = serviceData(b);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const s = await db.clientService.create({ data: { ...(data as { name: string; amount: number; billing: string; startDate: Date }), clientId: client.id } });
  await audit(u.id, 'CREATE', 'ClientService', s.id, { clientId: client.id, name: s.name, billing: s.billing, amount: s.amount, startDate: s.startDate });
  return NextResponse.json(s);
}
