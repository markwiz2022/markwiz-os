import { db } from './db';
import { countWorkingDays, isLate, istDateKey, isWorkingDay, monthBoundsIST, workingDayKeys } from './workcalendar';

export function getMonthBounds(monthKey: string) { return monthBoundsIST(monthKey); }

export async function calculatePayrollItem(userId: string, monthKey: string) {
  const { start, end } = monthBoundsIST(monthKey);
  const user = await db.user.findUnique({ where: { id: userId }, omit: { monthlySalary: false } });
  if (!user) throw new Error('Employee not found');

  // Full month, used for the daily salary rate.
  const workingDays = countWorkingDays(start, end);

  // Only days that have already happened can count as an absence.
  const now = new Date();
  const elapsedEnd = now < end ? now : end;
  const elapsedKeys = new Set(workingDayKeys(start, elapsedEnd));

  // Days actually punched in.
  const logs = await db.attendanceLog.findMany({
    where: { userId, type: 'CLOCK_IN', at: { gte: start, lte: end } },
    orderBy: { at: 'asc' },
  });
  const punchedKeys = new Set<string>();
  for (const log of logs) {
    if (isWorkingDay(log.at)) punchedKeys.add(istDateKey(log.at));
  }
  const attendanceDays = punchedKeys.size;

  // Approved leave, counted only on working days inside this month.
  const leaves = await db.leaveRequest.findMany({
    where: { userId, status: 'APPROVED', startDate: { not: null }, endDate: { not: null }, NOT: [{ endDate: { lt: start } }, { startDate: { gt: end } }] },
  });
  const leaveKeys = new Set<string>();
  for (const leave of leaves) {
    const from = leave.startDate! < start ? start : leave.startDate!;
    const to = leave.endDate! > end ? end : leave.endDate!;
    for (const key of workingDayKeys(from, to)) leaveKeys.add(key);
  }
  const paidLeaveDays = leaveKeys.size;

  // Absent = an elapsed working day with no punch and no approved leave.
  let unpaidDays = 0;
  for (const key of elapsedKeys) {
    if (!punchedKeys.has(key) && !leaveKeys.has(key)) unpaidDays++;
  }

  // Late punches, ignoring any covered by an approved regularisation.
  const requests = await db.regularisationRequest.findMany({
    where: { userId, attendanceAt: { gte: start, lte: end } },
  });
  const regularisationsUsed = requests.length;
  const pendingRegularisations = requests.filter(r => r.status === 'PENDING').length;
  const regularisedDays = new Set(requests.filter(r => r.status === 'APPROVED').map(r => istDateKey(r.attendanceAt)));
  const latePunches = logs.filter(log => isLate(log.at) && !regularisedDays.has(istDateKey(log.at))).length;

  const monthlySalary = Math.max(0, user.monthlySalary || 0);
  const dailySalary = workingDays ? monthlySalary / workingDays : 0;
  const grossSalary = monthlySalary;

  // Deductions can never push a salary below zero.
  const attendanceDeduction = Math.min(grossSalary, unpaidDays * dailySalary);
  const lateDeduction = Math.min(
    Math.max(0, grossSalary - attendanceDeduction),
    latePunches * dailySalary * 0.5
  );

  // Money is rounded to whole rupees so payroll screens and payslips show clean figures.
  const rupees = (n: number) => Math.round(n);
  return {
    userId, monthKey, monthlySalary, workingDays, attendanceDays, paidLeaveDays,
    unpaidDays, latePunches, regularisationsUsed, pendingRegularisations,
    lateDeduction: rupees(lateDeduction), attendanceDeduction: rupees(attendanceDeduction), otherDeduction: 0,
    grossSalary: rupees(grossSalary),
    netSalary: Math.max(0, rupees(grossSalary) - rupees(attendanceDeduction) - rupees(lateDeduction)),
  };
}

export async function generatePayroll(monthKey: string) {
  const { start, end } = monthBoundsIST(monthKey);
  const existing = await db.payrollRun.findUnique({ where: { monthKey } });
  if (existing?.status === 'PAID') throw new Error('Payroll is already paid and locked.');

  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  const items = await Promise.all(users.map(u => calculatePayrollItem(u.id, monthKey)));
  const totalGross = items.reduce((s, x) => s + x.grossSalary, 0);
  const totalDeductions = items.reduce((s, x) => s + x.attendanceDeduction + x.lateDeduction + x.otherDeduction, 0);
  const totalNet = items.reduce((s, x) => s + x.netSalary, 0);
  const workingDays = countWorkingDays(start, end);

  const run = existing
    ? await db.payrollRun.update({ where: { id: existing.id }, data: { monthStart: start, monthEnd: end, workingDays, status: 'DRAFT', totalGross, totalDeductions, totalNet } })
    : await db.payrollRun.create({ data: { monthKey, monthStart: start, monthEnd: end, workingDays, totalGross, totalDeductions, totalNet } });

  await db.payrollItem.deleteMany({ where: { payrollRunId: run.id } });
  for (const item of items) {
    const { monthKey: _monthKey, ...payrollItem } = item;
    await db.payrollItem.create({
      data: { ...payrollItem, payrollRunId: run.id }
    });
  }
  return db.payrollRun.findUnique({ where: { id: run.id }, include: { items: { include: { user: true }, orderBy: { user: { name: 'asc' } } } } });
}
