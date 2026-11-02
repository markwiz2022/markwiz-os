import { guard } from '@/lib/api';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { generatePayroll } from '@/lib/payroll';

export async function GET(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  if (u.role !== 'MD' && u.role !== 'HR') {
    const rows = await db.payrollItem.findMany({ where: { userId: u.id }, include: { payrollRun: true }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json(rows);
  }
  const runs = await db.payrollRun.findMany({ include: { items: { include: { user: { select: { id: true, name: true, email: true, role: true, employeeCode: true } } }, orderBy: { user: { name: 'asc' } } } }, orderBy: { monthStart: 'desc' } });
  if (month) return NextResponse.json(runs.find(r => r.monthKey === month) || null);
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only Joseph/MD can generate payroll.' }, { status: 403 });
  const b = await req.json();
  if (!/^\d{4}-\d{2}$/.test(String(b.month || ''))) return NextResponse.json({ error: 'Month must be YYYY-MM.' }, { status: 400 });
  try {
    const run = await generatePayroll(b.month);
    await audit(u.id, 'GENERATE_PAYROLL', 'PayrollRun', run?.id, { month: b.month });
    return NextResponse.json(run);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unable to generate payroll.' }, { status: 409 });
  }
}
