import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { csvResponse, istDay, parseMonthKey, toCsv } from '@/lib/csv';
import { monthBoundsIST } from '@/lib/workcalendar';

/** GET /api/finance/export?type=invoices|expenses[&month=YYYY-MM] */
export async function GET(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const month = parseMonthKey(url.searchParams.get('month'));
  const range = month ? monthBoundsIST(month) : null;

  if (type === 'invoices') {
    const rows = await db.invoice.findMany({ where: range ? { dueDate: { gte: range.start, lte: range.end } } : {}, include: { client: { select: { name: true } } }, orderBy: { dueDate: 'asc' } });
    return csvResponse(`invoices-${month ?? 'all'}.csv`, toCsv(
      ['Invoice', 'Client', 'Amount', 'Paid', 'Outstanding', 'Due date', 'Status', 'Note'],
      rows.map((i) => [i.number, i.client.name, i.amount, i.paid, Math.max(0, i.amount - i.paid), istDay(i.dueDate), i.status, i.note]),
    ));
  }

  if (type === 'expenses') {
    const [rows, payroll] = await Promise.all([
      db.expense.findMany({ where: range ? { date: { gte: range.start, lte: range.end } } : {}, include: { client: { select: { name: true } } }, orderBy: { date: 'asc' } }),
      db.payrollRun.findMany({ where: { status: 'PAID', ...(month ? { monthKey: month } : {}) }, orderBy: { monthStart: 'asc' } }),
    ]);
    return csvResponse(`expenses-${month ?? 'all'}.csv`, toCsv(
      ['Date', 'Category', 'Amount', 'Client', 'Note'],
      [
        ...rows.map((e) => [istDay(e.date), e.category, e.amount, e.client?.name ?? 'Company', e.note]),
        ...payroll.map((r) => [istDay(r.paidAt ?? r.monthEnd), 'Payroll / Salaries', r.totalNet, 'Company', `${r.monthKey} payroll`]),
      ],
    ));
  }

  return new Response('Unknown export type', { status: 400 });
}
