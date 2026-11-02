import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { HOURS_PER_DAY, loadProfitability } from '@/lib/profitability';
import { parseMonthKey } from '@/lib/csv';
import { monthKeyIST, monthKeyOffset, monthLabel } from '@/lib/workcalendar';

const rupees = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const hrs = (h: number) => (h < 10 ? h.toFixed(1) : Math.round(h).toString());

export default async function Profitability({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requirePageUser();
  if (u.role !== 'MD') redirect('/');
  const sp = await searchParams;
  const now = new Date();
  const current = monthKeyIST(now);
  const month = parseMonthKey(sp.month) && sp.month! <= current ? sp.month! : current;
  const p = await loadProfitability(db, month, now);
  const prev = monthKeyOffset(month, -1);
  const next = monthKeyOffset(month, 1);
  const lowCoverage = p.coverage.filter((c) => c.pct !== null && c.pct < 60);
  const losing = p.clients.filter((c) => c.profit < 0);

  return <div className="page">
    <div className="header"><div>
      <div className="eyebrow">MD · PROFITABILITY · {monthLabel(month).toUpperCase()}</div>
      <h1>Client profitability</h1>
      <p className="muted">Each client’s retainer against the team time logged on their tasks and the expenses tagged to them. Time is costed at salary ÷ ({HOURS_PER_DAY} hours × working days).</p>
    </div>
      <div className="hero-status">
        <Link className="btn secondary small" href={`/profitability?month=${prev}`}>← {monthLabel(prev).split(' ')[0]}</Link>
        {month < current && <Link className="btn secondary small" href={`/profitability?month=${next}`}>{monthLabel(next).split(' ')[0]} →</Link>}
      </div></div>

    {lowCoverage.length > 0 && <div className="card warn-card"><h3>Time logging is low, so costs are understated</h3><p className="muted">{lowCoverage.map((c) => `${c.name} (${Math.round(c.pct!)}%)`).join(', ')} logged under 60% of their working hours so far. Ask the team to run the task timer on every task, or these numbers will look better than they are.</p></div>}

    <div className="grid">
      <div className="card"><div className="label">Client retainers</div><div className="kpi">{rupees(p.totals.revenue)}</div><div className="muted">{p.clients.length} clients</div></div>
      <div className="card"><div className="label">Cost of client work</div><div className="kpi">{rupees(p.totals.clientCosts)}</div><div className="muted">Logged time plus client expenses</div></div>
      <div className="card"><div className="label">Client contribution</div><div className={`kpi ${p.totals.clientProfit < 0 ? 'danger-text' : ''}`}>{rupees(p.totals.clientProfit)}</div><div className="muted">{losing.length} client{losing.length === 1 ? '' : 's'} losing money</div></div>
      <div className="card"><div className="label">Salary not on client work</div><div className="kpi">{rupees(p.totals.unallocated)}</div><div className="muted">of {rupees(p.totals.salaryTotal)} monthly salaries: internal work, gaps or unlogged time</div></div>
    </div>

    <div className="card" style={{ marginTop: 14 }}>
      <div className="section-head"><div><h3>By client</h3><p className="muted">Lowest margin first. Margins under 30% are amber, losses are red.</p></div></div>
      {p.clients.length === 0 ? <div className="empty-state">No active clients.</div> :
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Client</th><th>Retainer</th><th>Hours</th><th>Time cost</th><th>Expenses</th><th>Profit</th><th>Margin</th></tr></thead>
          <tbody>{p.clients.map((c) => <tr key={c.id}>
            <td><Link className="client-link" href={`/clients/${c.id}`}><b>{c.name}</b></Link>{c.people.length > 0 && <div className="muted">{c.people.slice(0, 3).map((x) => `${x.name} ${hrs(x.hours)}h`).join(' · ')}</div>}</td>
            <td>{rupees(c.revenue)}</td>
            <td>{hrs(c.hours)}</td>
            <td>{rupees(c.labour)}</td>
            <td>{rupees(c.expenses)}</td>
            <td className={c.profit < 0 ? 'danger-text' : ''}><b>{rupees(c.profit)}</b></td>
            <td>{c.margin === null ? <span className="muted">No retainer</span> : <span className={`pill ${c.margin < 0 ? 'red' : c.margin < 30 ? 'amber' : 'green'}`}>{Math.round(c.margin)}%</span>}</td>
          </tr>)}</tbody>
        </table></div>}
      {p.internal.some((r) => r.hours > 0) && <p className="muted" style={{ marginTop: 10 }}>Internal work: {p.internal.filter((r) => r.hours > 0).map((r) => `${r.name} ${hrs(r.hours)}h (${rupees(r.labour)})`).join(' · ')}.</p>}
    </div>

    <div className="card" style={{ marginTop: 14 }}>
      <div className="section-head"><div><h3>Time logging by person</h3><p className="muted">Hours on the task timer this month against working hours so far. Low coverage makes client costs look lower than they are.</p></div></div>
      {p.coverage.length === 0 ? <div className="empty-state">Set salaries in Payroll to see costs.</div> :
        <div className="table-wrap"><table className="table"><thead><tr><th>Person</th><th>Logged</th><th>Working hours so far</th><th>Coverage</th><th>Cost per hour</th></tr></thead>
          <tbody>{p.coverage.map((c) => <tr key={c.id}><td><b>{c.name}</b></td><td>{hrs(c.logged)}h</td><td>{c.expected}h</td><td>{c.pct === null ? '—' : <span className={`pill ${c.pct < 60 ? 'red' : c.pct < 80 ? 'amber' : 'green'}`}>{Math.round(c.pct)}%</span>}</td><td>{rupees(c.hourlyCost)}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}
