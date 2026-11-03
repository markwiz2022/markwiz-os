import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { serviceData } from '@/lib/service-input';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  const s = await db.clientService.findUnique({ where: { id } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const { data, error } = serviceData({ startDate: s.startDate.toISOString().slice(0, 10), ...b }, true);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const out = await db.clientService.update({ where: { id }, data: data! });
  await audit(u.id, 'UPDATE', 'ClientService', id, { before: { name: s.name, amount: s.amount, billing: s.billing, startDate: s.startDate, endDate: s.endDate, status: s.status }, after: data });
  return NextResponse.json(out);
}

/** Remove a mistaken entry. MD only; the record is kept in the audit trail. To stop a renewal, set an end date or Cancelled instead. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only the MD can delete. Set it to Cancelled instead.' }, { status: 403 });
  const { id } = await params;
  const s = await db.clientService.findUnique({ where: { id } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await db.clientService.delete({ where: { id } });
  await audit(u.id, 'DELETE', 'ClientService', id, { deleted: s });
  return NextResponse.json({ ok: true });
}
