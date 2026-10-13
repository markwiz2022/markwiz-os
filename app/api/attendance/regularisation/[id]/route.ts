import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('people');
  if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only Joseph/MD can resolve regularisation requests.' }, { status: 403 });

  const { id } = await params;
  const b = await req.json();
  if (b.status !== 'APPROVED' && b.status !== 'REJECTED') return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const request = await db.regularisationRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: 'Regularisation request not found' }, { status: 404 });
  if (request.status !== 'PENDING') return NextResponse.json({ error: 'Request already resolved' }, { status: 409 });

  if (b.status === 'REJECTED') {
    await db.user.update({ where: { id: request.userId }, data: { status: 'Active - 0.5 Day Salary Deduction' } });
    await db.attendanceLog.updateMany({
      where: { userId: request.userId, type: 'CLOCK_IN', at: request.attendanceAt },
      data: { note: `Regularisation rejected. 0.5 day salary deduction will apply. Original note: ${request.note}` },
    });
    await db.notification.create({ data: { userId: request.userId, title: 'Regularisation rejected', body: 'Your late attendance regularisation was rejected. A half-day salary deduction will apply in payroll.' } });
  } else {
    await db.user.update({ where: { id: request.userId }, data: { status: 'Active - Regularised' } });
    await db.attendanceLog.updateMany({
      where: { userId: request.userId, type: 'CLOCK_IN', at: request.attendanceAt },
      data: { note: `Regularised by ${u.name}. Original note: ${request.note}` },
    });
    await db.notification.create({ data: { userId: request.userId, title: 'Regularisation approved', body: 'Your late attendance regularisation was approved. No leave deduction was applied.' } });
  }

  const out = await db.regularisationRequest.update({
    where: { id },
    data: { status: b.status, resolvedAt: new Date(), resolverId: u.id, deductionApplied: b.status === 'REJECTED' },
  });
  await audit(u.id, `REGULARISATION_${b.status}`, 'RegularisationRequest', id, { employeeId: request.userId });
  return NextResponse.json(out);
}
