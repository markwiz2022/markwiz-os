import { guard } from '@/lib/api';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';

export async function PATCH(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only Joseph/MD can update salaries.' }, { status: 403 });
  const b = await req.json();
  const amount = Number(b.monthlySalary);
  if (!b.userId || !Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Valid employee and salary are required.' }, { status: 400 });
  const out = await db.user.update({ where: { id: b.userId }, data: { monthlySalary: amount, employeeCode: b.employeeCode || undefined }, omit: { monthlySalary: false } });
  await audit(u.id, 'UPDATE_SALARY', 'User', b.userId, { monthlySalary: amount });
  return NextResponse.json({ id: out.id, name: out.name, monthlySalary: out.monthlySalary });
}
