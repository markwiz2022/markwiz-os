import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('*'); if (g.error) return g.error;
  if (g.user!.role !== 'MD') return NextResponse.json({ error: 'Only the MD can resolve flags.' }, { status: 403 });
  const { id } = await params;
  const b = await req.json();
  const status = b.status === 'DISMISSED' ? 'DISMISSED' : 'ACTIONED';
  const flag = await db.performanceFlag.update({ where: { id }, data: { status, resolvedAt: new Date() } }).catch(() => null);
  if (!flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
  await audit(g.user!.id, 'FLAG_' + status, 'PerformanceFlag', id);
  return NextResponse.json(flag);
}
