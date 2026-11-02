import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { auditWhere, describeMetadata } from '@/lib/audit-query';
import { csvResponse, toCsv } from '@/lib/csv';

/** GET /api/audit/export with the same filters as the Audit Trail page. MD only. Max 10,000 rows. */
export async function GET(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  if (g.user!.role !== 'MD') return NextResponse.json({ error: 'Only the MD can export the audit trail' }, { status: 403 });
  const p = new URL(req.url).searchParams;
  const where = auditWhere({ user: p.get('user') || undefined, action: p.get('action') || undefined, entity: p.get('entity') || undefined, from: p.get('from') || undefined, to: p.get('to') || undefined, q: p.get('q') || undefined });
  const logs = await db.auditLog.findMany({ where, include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 10000 });
  return csvResponse(`audit-trail-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(
    ['Time (IST)', 'User', 'Role', 'Action', 'Area', 'Record ID', 'What changed', 'Raw details'],
    logs.map((l) => [new Date(l.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), l.user?.name ?? 'System', l.user?.role ?? '', l.action, l.entity, l.entityId, describeMetadata(l.metadata), l.metadata ? JSON.stringify(l.metadata) : '']),
  ));
}
