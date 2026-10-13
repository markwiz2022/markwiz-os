import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  InvoiceForm,
  ExpenseForm,
  PaymentForm,
} from '@/components/finance-forms';

export default async function Finance() {
  await requirePageUser('finance');

  const now = new Date();

  const [
    invoices,
    expenses,
    clients,
    payrollRuns,
  ] = await Promise.all([
    db.invoice.findMany({
      include: { client: true },
      orderBy: { dueDate: 'asc' },
    }),

    db.expense.findMany({
      include: { client: true },
      orderBy: { date: 'desc' },
    }),

    db.client.findMany({
      where: { active: true, internal: false },
      orderBy: { name: 'asc' },
    }),

    db.payrollRun.findMany({
      where: { status: 'PAID' },
      orderBy: { monthStart: 'desc' },
    }),
  ]);

  const revenue = clients.reduce(
    (sum, client) => sum + client.retainer,
    0
  );

  const billed = invoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0
  );

  const collected = invoices.reduce(
    (sum, invoice) => sum + invoice.paid,
    0
  );

  const receivables = invoices.reduce(
    (sum, invoice) =>
      sum + Math.max(0, invoice.amount - invoice.paid),
    0
  );

  const overdue = invoices.filter(
    invoice =>
      invoice.amount > invoice.paid &&
      new Date(invoice.dueDate) < now
  );

  const overdueAmount = overdue.reduce(
    (sum, invoice) =>
      sum + (invoice.amount - invoice.paid),
    0
  );

  const payrollExpenses = payrollRuns.map(run => ({
    id: `payroll-${run.id}`,
    category: 'Payroll / Salaries',
    amount: run.totalNet,
    client: null,
    date: run.paidAt || run.monthEnd,
    note: `${run.monthKey} payroll`,
  }));

  const normalExpenses = expenses.map(expense => ({
    id: expense.id,
    category: expense.category,
    amount: expense.amount,
    client: expense.client,
    date: expense.date,
    note: expense.note || '',
  }));

  const allExpenses = [
    ...normalExpenses,
    ...payrollExpenses,
  ].sort(
    (a, b) =>
      new Date(b.date).getTime() -
      new Date(a.date).getTime()
  );

  const totalExpenses = allExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  const contribution = revenue - totalExpenses;

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="eyebrow">FINANCIAL CONTROL</div>
          <h1>Finance</h1>
          <p className="muted">
            Revenue, receivables, invoices, payroll and expenses.
          </p>
        </div>
      </div>

      <div className="grid">
        <K t="Monthly Retainers" v={revenue} />
        <K t="Billed" v={billed} />
        <K t="Collected" v={collected} />
        <K t="Receivables" v={receivables} />
        <K t="Overdue" v={overdueAmount} />
        <K t="Total Expenses" v={totalExpenses} />
        <K t="Contribution" v={contribution} />
      </div>

      <div className="grid3" style={{ marginTop: 18 }}>
        <InvoiceForm clients={clients} />
        <ExpenseForm clients={clients} />
        <PaymentForm invoices={invoices} />
      </div>

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="section-head">
            <div>
              <h3>Invoices</h3>
              <p className="muted">
                {overdue.length} overdue · ₹
                {overdueAmount.toLocaleString('en-IN')} overdue value
              </p>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {invoices.map(invoice => {
                const status =
                  invoice.amount <= invoice.paid
                    ? 'PAID'
                    : new Date(invoice.dueDate) < now
                      ? 'OVERDUE'
                      : invoice.paid > 0
                        ? 'PARTIAL'
                        : invoice.status;

                return (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td>{invoice.client.name}</td>
                    <td>
                      ₹{invoice.amount.toLocaleString('en-IN')}
                    </td>
                    <td>
                      ₹{invoice.paid.toLocaleString('en-IN')}
                    </td>
                    <td
                      className={
                        status === 'OVERDUE'
                          ? 'danger-text'
                          : ''
                      }
                    >
                      {new Date(
                        invoice.dueDate
                      ).toLocaleDateString('en-IN')}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          status === 'PAID'
                            ? 'green'
                            : status === 'OVERDUE'
                              ? 'red'
                              : 'amber'
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-head">
            <div>
              <h3>Expenses</h3>
              <p className="muted">
                Company costs, client costs and paid payroll.
              </p>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
                <th>Client</th>
                <th>Date</th>
              </tr>
            </thead>

            <tbody>
              {allExpenses.map(expense => (
                <tr key={expense.id}>
                  <td>
                    <b>{expense.category}</b>
                    {expense.note && (
                      <div className="muted">
                        {expense.note}
                      </div>
                    )}
                  </td>

                  <td>
                    ₹{expense.amount.toLocaleString('en-IN')}
                  </td>

                  <td>
                    {expense.client?.name || 'Company'}
                  </td>

                  <td>
                    {new Date(
                      expense.date
                    ).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {allExpenses.length === 0 && (
            <div className="empty-state">
              No expenses recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function K({
  t,
  v,
}: {
  t: string;
  v: number;
}) {
  return (
    <div className="card">
      <div className="label">{t}</div>
      <div className="kpi">
        ₹{v.toLocaleString('en-IN')}
      </div>
    </div>
  );
}
