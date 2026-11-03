import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { csvResponse, parseMonthKey, toCsv } from '@/lib/csv';
import { audit } from '@/lib/audit';

/** GET /api/payroll/export?month=YYYY-MM — salary sheet for the accountant or bank. MD only. */
export async function GET(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only the MD can export payroll' }, { status: 403 });
  const month = parseMonthKey(new URL(req.url).searchParams.get('month'));
  if (!month) return NextResponse.json({ error: 'Month must be YYYY-MM' }, { status: 400 });
  const run = await db.payrollRun.findUnique({ where: { monthKey: month }, include: { items: { include: { user: { select: { name: true, email: true, role: true, employeeCode: true } } }, orderBy: { user: { name: 'asc' } } } } });
  if (!run) return NextResponse.json({ error: `No payroll calculated for ${month}` }, { status: 404 });
  await audit(u.id, 'EXPORT', 'PayrollRun', run.id, { month });
  return csvResponse(`payroll-${month}-${run.status.toLowerCase()}.csv`, toCsv(
    ['Employee ID', 'Name', 'Email', 'Role', 'Monthly salary', 'Working days', 'Days punched', 'Paid leave', 'Absent (unpaid)', 'Late punches', 'Work-from-home days', 'Attendance deduction', 'Late deduction', 'WFH half-day deduction', 'Other deduction', 'Gross', 'Net pay', 'Status'],
    run.items.map((i) => [i.user.employeeCode, i.user.name, i.user.email, i.user.role, i.monthlySalary, i.workingDays, i.attendanceDays, i.paidLeaveDays, i.unpaidDays, i.latePunches, i.wfhDays, i.attendanceDeduction, i.lateDeduction, i.wfhDeduction, i.otherDeduction, i.grossSalary, i.netSalary, run.status]),
  ));
}
