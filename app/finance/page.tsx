import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { InvoiceForm, ExpenseForm, PaymentForm } from '@/components/finance-forms';
import { ExpenseRowActions, InvoiceRowActions } from '@/components/finance-row-actions';
import { istDay, parseMonthKey } from '@/lib/csv';
import { monthBoundsIST, monthKeyIST, monthKeyOffset, monthLabel } from '@/lib/workcalendar';

export default async function Finance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requirePageUser('finance');
  const isMD = u.role === 'MD';
  const sp = await searchParams;
  const now = new Date();
  const currentMonth = monthKeyIST(now);
  const month = parseMonthKey(sp.month) && sp.month! <= currentMonth ? sp.month! : currentMonth;
  const { start, end } = monthBoundsIST(month);

  const [invoices, monthExpenses, clients, monthPayroll] = await Promise.all([
    db.invoice.findMany({ include: { client: { select: { id: true, name: true } } }, orderBy: { dueDate: 'asc' } }),
    db.expense.findMany({ where: { date: { gte: start, lte: end } }, include: { client: { select: { id: true, name: true } } }, orderBy: { date: 'desc' } }),
    db.client.findMany({ where: { active: true, internal: false }, orderBy: { name: 'asc' } }),
    db.payrollRun.findMany({ where: { status: 'PAID', monthKey: month } }),
  ]);
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));

  // Money in for the month: active monthly retainers. Money out for the same month:
  // expenses dated in the month plus that month's paid payroll. Same period on both sides.
  const retainers = clients.reduce((s, c) => s + c.retainer, 0);
  const expenseTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const payrollTotal = monthPayroll.reduce((s, r) => s + r.totalNet, 0);
  const contribution = retainers - expenseTotal - payrollTotal;

  // Invoices are tracked to date, not by month.
  const billed = invoices.reduce((s, i) => s + i.amount, 0);
  const collected = invoices.reduce((s, i) => s + i.paid, 0);
  const receivables = invoices.reduce((s, i) => s + Math.max(0, i.amount - i.paid), 0);
  const overdue = invoices.filter((i) => i.amount > i.paid && new Date(i.dueDate) < now);
  const overdueAmount = overdue.reduce((s, i) => s + (i.amount - i.paid), 0);

  const rows = [
    ...monthExpenses.map((e) => ({ id: e.id, category: e.category, amount: e.amount, client: e.client?.name ?? 'Company', clientId: e.clientId, date: e.date, note: e.note ?? '', editable: true })),
    ...monthPayroll.map((r) => ({ id: `payroll-${r.id}`, category: 'Payroll / Salaries', amount: r.totalNet, client: 'Company', clientId: null, date: r.paidAt ?? r.monthEnd, note: `${r.monthKey} payroll · managed in Payroll`, editable: false })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const prev = monthKeyOffset(month, -1);
  const next = monthKeyOffset(month, 1);

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="eyebrow">FINANCIAL CONTROL · {monthLabel(month).toUpperCase()}</div>
          <h1>Finance</h1>
          <p className="muted">Contribution compares this month’s retainers with this month’s expenses and payroll. Invoices and receivables are shown to date.</p>
        </div>
        <div className="hero-status">
          <Link className="btn secondary small" href={`/finance?month=${prev}`}>← {monthLabel(prev).split(' ')[0]}</Link>
          {month < currentMonth && <Link className="btn secondary small" href={`/finance?month=${next}`}>{monthLabel(next).split(' ')[0]} →</Link>}
          {month !== currentMonth && <Link className="btn secondary small" href="/finance">This month</Link>}
        </div>
      </div>

      <div className="mini-heading">{monthLabel(month).toUpperCase()}</div>
      <div className="grid">
        <K t="Monthly retainers" v={retainers} note={`${clients.length} active clients`} />
        <K t="Expenses" v={expenseTotal} note={`${monthExpenses.length} recorded`} />
        <K t="Payroll paid" v={payrollTotal} note={monthPayroll.length ? 'Marked paid' : 'Not paid yet'} />
        <K t="Contribution" v={contribution} note="Retainers less expenses and payroll" bad={contribution < 0} />
      </div>

      <div className="mini-heading" style={{ marginTop: 18 }}>INVOICES TO DATE</div>
      <div className="grid">
        <K t="Billed" v={billed} />
        <K t="Collected" v={collected} />
        <K t="Receivables" v={receivables} />
        <K t="Overdue" v={overdueAmount} note={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`} bad={overdue.length > 0} />
      </div>

      <div className="grid3" style={{ marginTop: 18 }}>
        <InvoiceForm clients={clients} />
        <ExpenseForm clients={clients} />
        <PaymentForm invoices={invoices} />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-head">
          <div><h3>Invoices</h3><p className="muted">{overdue.length} overdue · ₹{overdueAmount.toLocaleString('en-IN')} overdue value. Edit to correct a mistake{isMD ? ', or delete it' : ''}.</p></div>
          <div className="row-actions"><a className="btn secondary small" href="/api/finance/export?type=invoices">Export all (CSV)</a></div>
        </div>
        {invoices.length === 0 ? <div className="empty-state">No invoices yet.</div> :
          <table className="table">
            <thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Paid</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {invoices.map((invoice) => {
                const status = invoice.amount <= invoice.paid ? 'PAID' : new Date(invoice.dueDate) < now ? 'OVERDUE' : invoice.paid > 0 ? 'PARTIAL' : invoice.status;
                return (
                  <tr key={invoice.id}>
                    <td>{invoice.number}{invoice.note && <div className="muted">{invoice.note}</div>}</td>
                    <td>{invoice.client.name}</td>
                    <td>₹{invoice.amount.toLocaleString('en-IN')}</td>
                    <td>₹{invoice.paid.toLocaleString('en-IN')}</td>
                    <td className={status === 'OVERDUE' ? 'danger-text' : ''}>{new Date(invoice.dueDate).toLocaleDateString('en-IN')}</td>
                    <td><span className={`pill ${status === 'PAID' ? 'green' : status === 'OVERDUE' ? 'red' : 'amber'}`}>{status}</span></td>
                    <td><InvoiceRowActions invoice={{ id: invoice.id, number: invoice.number, amount: invoice.amount, paid: invoice.paid, dueDate: istDay(invoice.dueDate), clientId: invoice.clientId, note: invoice.note }} clients={clientOpts} canDelete={isMD} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="section-head">
          <div><h3>Expenses · {monthLabel(month)}</h3><p className="muted">Company costs, client costs and paid payroll for this month. Payroll is changed in Payroll, not here.</p></div>
          <div className="row-actions"><a className="btn secondary small" href={`/api/finance/export?type=expenses&month=${month}`}>Export month (CSV)</a><a className="btn secondary small" href="/api/finance/export?type=expenses">Export all</a></div>
        </div>
        {rows.length === 0 ? <div className="empty-state">No expenses recorded for {monthLabel(month)}.</div> :
          <table className="table">
            <thead><tr><th>Category</th><th>Amount</th><th>Client</th><th>Date</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.category}</b>{e.note && <div className="muted">{e.note}</div>}</td>
                  <td>₹{e.amount.toLocaleString('en-IN')}</td>
                  <td>{e.client}</td>
                  <td>{e.date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td>{e.editable ? <ExpenseRowActions expense={{ id: e.id, category: e.category, amount: e.amount, date: istDay(e.date), clientId: e.clientId, note: e.note || null }} clients={clientOpts} canDelete={isMD} /> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  );
}

function K({ t, v, note, bad }: { t: string; v: number; note?: string; bad?: boolean }) {
  return (
    <div className="card">
      <div className="label">{t}</div>
      <div className={`kpi ${bad ? 'danger-text' : ''}`}>{v < 0 ? '−' : ''}₹{Math.abs(Math.round(v)).toLocaleString('en-IN')}</div>
      {note && <div className="muted">{note}</div>}
    </div>
  );
}
