import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { InvoiceForm, ExpenseForm, PaymentForm } from '@/components/finance-forms';
import { ExpenseRowActions, InvoiceRowActions } from '@/components/finance-row-actions';
import { istDay, parseMonthKey } from '@/lib/csv';
import { istDateKey, monthBoundsIST, monthKeyIST, monthKeyOffset, monthLabel } from '@/lib/workcalendar';
import { BILLING_LABEL, isBilling, nextDueKey, serviceAmountInMonth } from '@/lib/services';

export default async function Finance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requirePageUser('finance');
  const isMD = u.role === 'MD';
  const sp = await searchParams;
  const now = new Date();
  const currentMonth = monthKeyIST(now);
  const month = parseMonthKey(sp.month) && sp.month! <= currentMonth ? sp.month! : currentMonth;
  const { start, end } = monthBoundsIST(month);

  const [invoices, monthExpenses, clients, monthPayroll, services] = await Promise.all([
    db.invoice.findMany({ include: { client: { select: { id: true, name: true } } }, orderBy: { dueDate: 'asc' } }),
    db.expense.findMany({ where: { date: { gte: start, lte: end } }, include: { client: { select: { id: true, name: true } } }, orderBy: { date: 'desc' } }),
    db.client.findMany({ where: { active: true, internal: false }, orderBy: { name: 'asc' } }),
    db.payrollRun.findMany({ where: { status: 'PAID', monthKey: month } }),
    db.clientService.findMany({ where: { status: { in: ['ACTIVE', 'COMPLETED'] }, client: { internal: false } }, include: { client: { select: { id: true, name: true, active: true } } }, orderBy: { startDate: 'asc' } }),
  ]);
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));

  // Money in for the month: active monthly retainers. Money out for the same month:
  // expenses dated in the month plus that month's paid payroll. Same period on both sides.
  const retainers = clients.reduce((s, c) => s + c.retainer, 0);
  // One-time and periodic work counts only in the month it is billed or renews (lib/services.ts).
  const billedThisMonth = services.map((s) => ({ s, amount: serviceAmountInMonth(s, month) })).filter((x) => x.amount > 0);
  const otherWork = billedThisMonth.reduce((sum, x) => sum + x.amount, 0);
  const revenue = retainers + otherWork;
  const expenseTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const payrollTotal = monthPayroll.reduce((s, r) => s + r.totalNet, 0);
  const contribution = revenue - expenseTotal - payrollTotal;

  // 12-month planner from the current month, assuming today's retainers continue.
  const planner = Array.from({ length: 12 }, (_, i) => monthKeyOffset(currentMonth, i)).map((m) => {
    const items = services.map((s) => serviceAmountInMonth(s, m)).filter((a) => a > 0);
    const other = items.reduce((a, b) => a + b, 0);
    return { m, retainers, other, items: items.length, total: retainers + other };
  });
  const todayKey = istDateKey(now);
  const in60 = istDateKey(new Date(now.getTime() + 60 * 86400000));
  const renewals = services.filter((s) => s.billing !== 'ONE_TIME' && s.client.active).map((s) => ({ s, due: nextDueKey(s, todayKey) })).filter((x): x is { s: typeof x.s; due: string } => !!x.due && x.due <= in60).sort((a, b) => a.due.localeCompare(b.due));
  const dayLabel = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

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
        <K t="One-time & yearly work" v={otherWork} note={`${billedThisMonth.length} item${billedThisMonth.length === 1 ? '' : 's'} billed this month`} />
        <K t="Expenses" v={expenseTotal} note={`${monthExpenses.length} recorded`} />
        <K t="Payroll paid" v={payrollTotal} note={monthPayroll.length ? 'Marked paid' : 'Not paid yet'} />
        <K t="Contribution" v={contribution} note={`Revenue ₹${Math.round(revenue).toLocaleString('en-IN')} less expenses and payroll`} bad={contribution < 0} />
      </div>

      <div className="mini-heading" style={{ marginTop: 18 }}>INVOICES TO DATE</div>
      <div className="grid">
        <K t="Billed" v={billed} />
        <K t="Collected" v={collected} />
        <K t="Receivables" v={receivables} />
        <K t="Overdue" v={overdueAmount} note={`${overdue.length} invoice${overdue.length === 1 ? '' : 's'}`} bad={overdue.length > 0} />
      </div>

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="section-head"><div><h3>Revenue planner · next 12 months</h3><p className="muted">Retainers every month (assuming current clients continue) plus one-time and yearly work only in the month it’s billed or renews. Add that work on each client’s page.</p></div></div>
          <div className="table-wrap"><table className="table planner"><thead><tr><th>Month</th><th className="num">Retainers</th><th className="num">One-time & yearly</th><th className="num">Expected total</th></tr></thead><tbody>
            {planner.map((p) => <tr key={p.m} className={p.m === month ? 'current' : ''}><td><Link className="client-link" href={`/finance?month=${p.m}`}>{monthLabel(p.m)}</Link></td><td className="num">₹{Math.round(p.retainers).toLocaleString('en-IN')}</td><td className="num">{p.other ? `₹${Math.round(p.other).toLocaleString('en-IN')} (${p.items})` : '—'}</td><td className="num"><b>₹{Math.round(p.total).toLocaleString('en-IN')}</b></td></tr>)}
            <tr><td><b>12-month total</b></td><td className="num">₹{Math.round(planner.reduce((s, p) => s + p.retainers, 0)).toLocaleString('en-IN')}</td><td className="num">₹{Math.round(planner.reduce((s, p) => s + p.other, 0)).toLocaleString('en-IN')}</td><td className="num"><b>₹{Math.round(planner.reduce((s, p) => s + p.total, 0)).toLocaleString('en-IN')}</b></td></tr>
          </tbody></table></div>
        </div>
        <div className="card">
          <div className="section-head"><div><h3>Billed beyond retainers · {monthLabel(month)}</h3><p className="muted">One-time and periodic work counted in this month. Remember to raise the invoice.</p></div></div>
          {billedThisMonth.length === 0 ? <div className="empty-state">Nothing beyond retainers this month.</div> : <div className="detail-list">{billedThisMonth.map(({ s, amount }) => <div key={s.id}><span><Link className="client-link" href={`/clients/${s.client.id}`}>{s.client.name}</Link> · {s.name}<br /><small>{isBilling(s.billing) ? BILLING_LABEL[s.billing] : s.billing}</small></span><b>₹{Math.round(amount).toLocaleString('en-IN')}</b></div>)}</div>}
          <div className="section-head" style={{ marginTop: 16 }}><div><h3>Renewals due in the next 60 days</h3><p className="muted">Hosting, domains, email, AMC and other yearly or quarterly items. Invoice before they lapse.</p></div></div>
          {renewals.length === 0 ? <div className="empty-state">No renewals due in the next 60 days.</div> : <div className="detail-list">{renewals.map(({ s, due }) => <div key={s.id}><span><Link className="client-link" href={`/clients/${s.client.id}`}>{s.client.name}</Link> · {s.name}<br /><small>{dayLabel(due)}{due < todayKey ? ' · overdue' : ''}</small></span><b>₹{Math.round(s.amount).toLocaleString('en-IN')}</b></div>)}</div>}
        </div>
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
