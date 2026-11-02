import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import Link from 'next/link';
import { GeneratePayroll, PayrollActions, SalaryEditor } from '@/components/payroll-controls';
import { parseMonthKey } from '@/lib/csv';
import { monthKeyIST, monthKeyOffset, monthLabel } from '@/lib/workcalendar';

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requirePageUser();
  if (u.role !== 'MD') redirect('/tasks');
  const now = new Date();
  const sp = await searchParams;
  const currentMonth = monthKeyIST(now);
  const month = parseMonthKey(sp.month) && sp.month! <= currentMonth ? sp.month! : currentMonth;
  const prev = monthKeyOffset(month, -1);
  const next = monthKeyOffset(month, 1);
  const [run, users] = await Promise.all([
    db.payrollRun.findUnique({
      where: { monthKey: month },
      include: {
        items: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true, monthlySalary: true, employeeCode: true } },
            adjustments: true,
          },
          orderBy: { user: { name: 'asc' } },
        },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: 'asc' }, omit: { monthlySalary: false } }),
  ]);
  const pending = run?.items.some(i=>i.pendingRegularisations>0) || false;
  return <div className="page">
    <div className="header"><div><div className="eyebrow">MD · PAYROLL</div><h1>Payroll</h1><p className="muted">Attendance-driven salary calculation. A working day with no clock-in and no approved leave is an unpaid absence. Every late punch (after 9:15 AM) is a half-day deduction unless an approved regularisation covers it. Review the draft before marking it paid. Use the month buttons to process last month’s salaries.</p></div><div className="hero-status"><Link className="btn secondary small" href={`/payroll?month=${prev}`}>← {monthLabel(prev).split(' ')[0]}</Link>{month < currentMonth && <Link className="btn secondary small" href={`/payroll?month=${next}`}>{monthLabel(next).split(' ')[0]} →</Link>}{run?.status !== 'PAID' && <GeneratePayroll month={month}/>}</div></div>
    <div className="grid3">
      <div className="card"><div className="label">Payroll month</div><div className="kpi">{month}</div><div className="muted">Mon–Fri + 1st, 3rd & 5th Saturday</div></div>
      <div className="card"><div className="label">Gross payroll</div><div className="kpi">₹{(run?.totalGross||0).toLocaleString('en-IN')}</div><div className="muted">Before attendance and late deductions</div></div>
      <div className="card"><div className="label">Net payroll</div><div className="kpi">₹{(run?.totalNet||0).toLocaleString('en-IN')}</div><div className="muted">{run?.status==='PAID'?'Paid and locked':'Draft · review before payment'}</div></div>
    </div>
    <div className="card" style={{marginTop:18}}>
      <div className="section-head"><div><h3>Employee salary setup</h3><p className="muted">Salary and employee ID are visible only to Joseph in this payroll workspace.</p></div></div>
      <table className="table"><thead><tr><th>Employee</th><th>Role</th><th>Salary / Employee ID</th></tr></thead><tbody>{users.map(x=><tr key={x.id}><td><b>{x.name}</b><div className="muted">{x.email}</div></td><td>{x.role}</td><td><SalaryEditor userId={x.id} salary={x.monthlySalary} code={x.employeeCode}/></td></tr>)}</tbody></table>
    </div>
    <div className="card" style={{marginTop:18}}>
      <div className="section-head"><div><h3>{month} payroll</h3><p className="muted">Attendance days, unpaid days, regularisations and late-punch deductions.</p></div>{run && <div className="row-actions"><a className="btn secondary small" href={`/api/payroll/export?month=${month}`}>Export (CSV)</a><PayrollActions runId={run.id} locked={run.status==='PAID'} pending={pending}/></div>}</div>
      {!run ? <div className="empty-state">No payroll calculated for {month}. Set salaries above, then calculate payroll.</div> : <table className="table"><thead><tr><th>Employee</th><th>Working</th><th>Punched</th><th>Paid leave</th><th>Absent</th><th>Late</th><th>Regularisation</th><th>Attendance deduction</th><th>Late deduction</th><th>Net</th><th>Payslip</th></tr></thead><tbody>{run.items.map(i=><tr key={i.id}><td><b>{i.user.name}</b><div className="muted">{i.user.role}</div></td><td>{i.workingDays}</td><td>{i.attendanceDays}</td><td>{i.paidLeaveDays}</td><td>{i.unpaidDays>0?<span className="pill red">{i.unpaidDays}</span>:0}</td><td>{i.latePunches}</td><td>{i.regularisationsUsed}/2 {i.pendingRegularisations>0&&<span className="pill amber">{i.pendingRegularisations} pending</span>}</td><td>₹{i.attendanceDeduction.toLocaleString('en-IN')}</td><td>₹{i.lateDeduction.toLocaleString('en-IN')}</td><td><b>₹{i.netSalary.toLocaleString('en-IN')}</b></td><td>{run.status==='PAID'?<a className="btn small" href={`/api/payroll/payslip/${i.id}`}>Download</a>:<span className="muted">After payment</span>}</td></tr>)}</tbody></table>}
    </div>
  </div>;
}
