import { guard } from '@/lib/api';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only Joseph/MD can mark payroll as paid.' }, { status: 403 });
  const { id } = await params;
  const b = await req.json();
  if (b.action !== 'pay') return NextResponse.json({ error: 'Invalid payroll action.' }, { status: 400 });
  const run = await db.payrollRun.findUnique({ where: { id }, include: { items: true } });
  if (!run) return NextResponse.json({ error: 'Payroll run not found.' }, { status: 404 });
  if (run.status === 'PAID') return NextResponse.json({ error: 'Payroll is already paid and locked.' }, { status: 409 });
  if (run.items.some(i => i.pendingRegularisations > 0)) return NextResponse.json({ error: 'Resolve all pending regularisation requests before paying payroll.' }, { status: 409 });

  const paidAt = b.paidAt ? new Date(b.paidAt) : new Date();
  const updated = await db.payrollRun.update({ where: { id }, data: { status: 'PAID', paidAt, paidById: u.id } });
  await audit(u.id, 'PAYROLL_PAID', 'PayrollRun', id, { month: run.monthKey, paidAt: paidAt.toISOString() });

  const employees = await db.payrollItem.findMany({ where: { payrollRunId: id }, select: { userId: true } });
  for (const item of employees) {
    await db.notification.create({ data: { userId: item.userId, title: `Payslip ready · ${run.monthKey}`, body: `Your salary has been marked as paid. Your payslip is now available to download.` } });
  }
  return NextResponse.json(updated);
}
