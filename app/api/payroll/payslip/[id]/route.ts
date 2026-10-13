import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

function esc(s: string) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function money(n: number) { return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`; }

function makePdf(lines: string[]) {
  const content = ['BT', '/F1 11 Tf', '50 790 Td', ...lines.map((line, i) => `${i ? '0 -18 Td\n' : ''}(${esc(line)}) Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((obj, i) => { offsets[i + 1] = Buffer.byteLength(pdf, 'utf8'); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const item = await db.payrollItem.findUnique({ where: { id }, include: { user: true, payrollRun: true } });
  if (!item) return NextResponse.json({ error: 'Payslip not found.' }, { status: 404 });
  if (u.role !== 'MD' && u.role !== 'HR' && item.userId !== u.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (item.payrollRun.status !== 'PAID') return NextResponse.json({ error: 'Payslip is available after salary is marked paid.' }, { status: 409 });
  const lines = [
    'MARKWIZ MARKETING CONSULTANCY PVT LTD', 'SALARY PAYSLIP', `Salary month: ${item.payrollRun.monthKey}`,
    `Employee: ${item.user.name}`, `Employee ID: ${item.user.employeeCode || '—'}`, `Role: ${item.user.role}`, '',
    `Working days: ${item.workingDays}`, `Attendance days: ${item.attendanceDays}`, `Paid leave days: ${item.paidLeaveDays}`,
    `Unpaid days: ${item.unpaidDays}`, `Late punches: ${item.latePunches}`, `Regularisations used: ${item.regularisationsUsed}/2`, '',
    `Gross salary: ${money(item.grossSalary)}`, `Attendance deduction: ${money(item.attendanceDeduction)}`,
    `Late deduction: ${money(item.lateDeduction)}`, `Other deduction: ${money(item.otherDeduction)}`, `NET SALARY: ${money(item.netSalary)}`,
    '', `Paid on: ${item.payrollRun.paidAt ? new Date(item.payrollRun.paidAt).toLocaleDateString('en-IN') : '—'}`, 'Status: PAID',
  ];
  const pdf = makePdf(lines);
  return new NextResponse(pdf as any, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Markwiz-Payslip-${item.payrollRun.monthKey}-${item.user.name.replace(/[^a-z0-9]/gi, '-')}.pdf"`, 'Cache-Control': 'private, no-store' } });
}
