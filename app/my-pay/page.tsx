import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function MyPay() {
  const u = await requirePageUser();
  const rows = await db.payrollItem.findMany({ where:{userId:u.id}, include:{payrollRun:true}, orderBy:{payrollRun:{monthStart:'desc'}} });
  return <div className="page"><div className="header"><div><div className="eyebrow">MY PAY</div><h1>Salary & Payslips</h1><p className="muted">Your private attendance-based salary history. Payslips become available only after Joseph marks the month paid.</p></div></div>
    <div className="card"><div className="section-head"><div><h3>Salary history</h3><p className="muted">Only your own salary information is visible here.</p></div></div>
    {rows.length===0?<div className="empty-state">No payroll has been issued yet.</div>:<table className="table"><thead><tr><th>Month</th><th>Working days</th><th>Punched</th><th>Paid leave</th><th>Absent</th><th>Late</th><th>WFH days</th><th>Deductions</th><th>Net salary</th><th>Status</th><th>Payslip</th></tr></thead><tbody>{rows.map(i=>{const deductions=i.attendanceDeduction+i.lateDeduction+i.wfhDeduction+i.otherDeduction;return <tr key={i.id}><td><b>{i.payrollRun.monthKey}</b></td><td>{i.workingDays}</td><td>{i.attendanceDays}</td><td>{i.paidLeaveDays}</td><td>{i.unpaidDays}</td><td>{i.latePunches}</td><td>{i.wfhDays}</td><td>₹{deductions.toLocaleString('en-IN')}</td><td><b>{i.payrollRun.status==='PAID'?`₹${i.netSalary.toLocaleString('en-IN')}`:'—'}</b></td><td><span className={`pill ${i.payrollRun.status==='PAID'?'green':'amber'}`}>{i.payrollRun.status}</span>{i.payrollRun.paidAt&&<div className="muted">Paid {new Date(i.payrollRun.paidAt).toLocaleDateString('en-IN')}</div>}</td><td>{i.payrollRun.status==='PAID'?<a className="btn small" href={`/api/payroll/payslip/${i.id}`}>Download</a>:<span className="muted">Not available</span>}</td></tr>})}</tbody></table>}
    </div>
  </div>;
}
