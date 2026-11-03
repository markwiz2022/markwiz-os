import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import AttendanceControls from '@/components/attendance-controls';
import LeaveForm from '@/components/leave-form';
import LeaveActions, { LeaveBalanceEdit, LeaveCancel } from '@/components/leave-actions';
import RegularisationActions from '@/components/regularisation-actions';
import OfficeSettings from '@/components/office-settings';
import { GRACE_LABEL, CHECK_IN_LABEL, monthKeyIST, monthBoundsIST, monthKeyOffset, monthLabel, istDateKey, istDayBounds, isWorkingDayKey, lastDayOfMonth, weekdayOfKey } from '@/lib/workcalendar';
import { fmtDays, leaveBalance } from '@/lib/leave';
import { formatDistance, splitWorkDays } from '@/lib/geo';
import { getOffice } from '@/lib/office';

const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default async function People() {
  const u = await requirePageUser('people');
  const isApprover = u.role === 'MD' || u.role === 'HR';
  const seesTeam = isApprover || u.role === 'DMM';
  const now = new Date();
  const month = monthKeyIST(now);
  const { start: monthStart, end: monthEnd } = monthBoundsIST(month);
  const nextMonth = monthKeyOffset(month, 1);
  const calEnd = monthBoundsIST(nextMonth).end;
  const today = istDayBounds(now);

  const [users, requests, tasks, regularisations, clockIns, calendarLeaves, pendingByUser, office] = await Promise.all([
    db.user.findMany({ where: seesTeam ? {} : { id: u.id }, orderBy: { name: 'asc' } }),
    db.leaveRequest.findMany({ where: isApprover ? {} : { userId: u.id }, include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.task.findMany({ select: { ownerId: true, timeSeconds: true, runningSince: true } }),
    db.regularisationRequest.findMany({ where: u.role === 'MD' ? {} : { userId: u.id }, include: { user: { select: { name: true, role: true } } }, orderBy: { createdAt: 'desc' } }),
    db.attendanceLog.findMany({ where: { type: 'CLOCK_IN', at: { gte: monthStart, lte: monthEnd }, ...(seesTeam ? {} : { userId: u.id }) }, include: { user: { select: { name: true } } }, orderBy: { at: 'desc' } }),
    // Everyone sees who is away when (names and dates only), so leave can be planned around each other.
    db.leaveRequest.findMany({ where: { status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: calEnd }, endDate: { gte: monthStart } }, select: { id: true, userId: true, status: true, startDate: true, endDate: true, days: true, user: { select: { name: true } } }, orderBy: { startDate: 'asc' } }),
    db.leaveRequest.groupBy({ by: ['userId'], where: { status: 'PENDING' }, _sum: { days: true } }),
    u.role === 'MD' ? getOffice() : Promise.resolve(null),
  ]);

  const pendingOf = (id: string) => pendingByUser.find((p) => p.userId === id)?._sum.days ?? 0;
  const wfhDaysOf = (id: string) => splitWorkDays(clockIns.filter((c) => c.userId === id).map((c) => ({ dayKey: istDateKey(c.at), workMode: c.workMode }))).wfh.size;
  const todayMode = (id: string) => clockIns.find((c) => c.userId === id && c.at >= today.start)?.workMode ?? null;
  const me = users.find((x) => x.id === u.id) ?? (await db.user.findUnique({ where: { id: u.id } }))!;
  const myBal = leaveBalance(me, pendingOf(me.id));
  const myWfh = wfhDaysOf(me.id);
  const meActive = !!(me.checkInAt && !me.checkOutAt);
  const wfhLog = clockIns.filter((c) => c.workMode === 'WFH');

  // Team leave calendar: this month and next.
  const months = [month, nextMonth].map((m) => {
    const days = lastDayOfMonth(m);
    const keys = Array.from({ length: days }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
    const lead = weekdayOfKey(keys[0]) - 1;
    return { m, lead, keys };
  });
  const awayOn = (key: string) => calendarLeaves.filter((l) => istDateKey(l.startDate!) <= key && istDateKey(new Date(l.endDate!.getTime() - 1)) >= key && isWorkingDayKey(key));
  const upcoming = calendarLeaves.filter((l) => l.endDate! >= today.start);
  const todayKey = istDateKey(now);

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="eyebrow">PEOPLE OPERATIONS</div>
          <h1>Attendance & Leave</h1>
          <p className="muted">Clock in at the office, plan leave and see balances. Check-in is {CHECK_IN_LABEL} with grace until {GRACE_LABEL}. Clocking in away from the office counts as work from home, which is a half day.</p>
        </div>
      </div>

      <div className="grid">
        <div className="card kpi-card clock-card"><div className="label">Today</div><div className="kpi">{meActive ? (todayMode(me.id) === 'WFH' ? 'Work from home' : 'At office') : 'Not clocked in'}</div><div style={{ marginTop: 10 }}><AttendanceControls active={meActive} /></div></div>
        <div className="card kpi-card"><div className="label">Leave left</div><div className="kpi">{fmtDays(myBal.left)} <small className="kpi-sub">of {fmtDays(myBal.total)}</small></div><div className="muted">{fmtDays(myBal.taken)} taken{myBal.pending ? ` · ${fmtDays(myBal.pending)} waiting for approval` : ''}</div></div>
        <div className="card kpi-card"><div className="label">Work from home · {monthLabel(month)}</div><div className="kpi">{myWfh} <small className="kpi-sub">day{myWfh === 1 ? '' : 's'}</small></div><div className="muted">Each counts as a half day ({fmtDays(myWfh * 0.5)} day{myWfh * 0.5 === 1 ? '' : 's'} unpaid)</div></div>
        <div className="card kpi-card"><div className="label">Away this month</div><div className="kpi">{new Set(calendarLeaves.filter((l) => l.startDate! <= monthEnd).map((l) => l.userId)).size} <small className="kpi-sub">people</small></div><div className="muted">{upcoming.length} upcoming leave{upcoming.length === 1 ? '' : 's'} on the calendar</div></div>
      </div>

      {u.role !== 'MD' && <div style={{ marginTop: 14 }}><LeaveForm canBook={myBal.canBook} left={myBal.left} total={myBal.total} /></div>}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-head"><div><h3>Team leave calendar</h3><p className="muted">Who is away when. Solid = approved, dashed = waiting for approval. Plan your leave around these dates.</p></div></div>
        <div className="leave-cal-wrap">
          {months.map(({ m, lead, keys }) => <div key={m} className="leave-month">
            <b className="leave-month-title">{monthLabel(m)}</b>
            <div className="cal-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-head">{d}</div>)}
              {Array.from({ length: lead }, (_, i) => <div key={`e${i}`} className="cal-cell empty" />)}
              {keys.map((k) => { const away = awayOn(k); return <div key={k} className={`cal-cell ${k === todayKey ? 'today' : ''} ${isWorkingDayKey(k) ? '' : 'off'}`}>
                <span className="cal-day">{Number(k.slice(8))}</span>
                {away.slice(0, 3).map((l) => <span key={l.id} className={`cal-chip leave-chip ${l.status === 'PENDING' ? 'pending' : ''} ${l.userId === u.id ? 'mine' : ''}`} title={`${l.user.name}${l.status === 'PENDING' ? ' (pending)' : ''}`}>{l.user.name.split(' ')[0]}</span>)}
                {away.length > 3 && <span className="cal-day">+{away.length - 3}</span>}
              </div>; })}
            </div>
          </div>)}
        </div>
        {upcoming.length > 0 && <div className="leave-list">{upcoming.slice(0, 12).map((l) => <span key={l.id} className={`pill ${l.status === 'APPROVED' ? 'green' : 'amber'}`}>{l.user.name} · {fmtDate(l.startDate!)}{l.days > 1 ? ` – ${fmtDate(new Date(l.endDate!.getTime() - 1))}` : ''} · {fmtDays(l.days)}d{l.status === 'PENDING' ? ' · pending' : ''}</span>)}</div>}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-head"><div><h3>{seesTeam ? 'Team status & leave balances' : 'My status'}</h3><p className="muted">Working days are Monday to Friday plus the 1st, 3rd and 5th Saturday. Work-from-home days are counted for {monthLabel(month)}.</p></div></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Today</th><th>Leave total</th><th>Taken</th><th>Pending</th><th>Left</th><th>WFH this month</th><th>Shift</th></tr></thead>
          <tbody>
            {users.filter((x) => x.active || x.id === u.id).map((x) => {
              const shift = x.shiftSeconds + (x.checkInAt && !x.checkOutAt ? Math.floor((Date.now() - new Date(x.checkInAt).getTime()) / 1000) : 0);
              const bal = leaveBalance(x, pendingOf(x.id));
              const active = !!(x.checkInAt && !x.checkOutAt);
              const mode = todayMode(x.id);
              const wfh = wfhDaysOf(x.id);
              return (
                <tr key={x.id}>
                  <td><b>{x.name}</b><div className="muted">{x.role}</div></td>
                  <td>{active ? <span className={`pill ${mode === 'WFH' ? 'amber' : 'green'}`}>{mode === 'WFH' ? 'WFH' : 'Office'}</span> : <span className="pill">{x.status || 'Offline'}</span>}</td>
                  <td>{fmtDays(bal.total)}{isApprover && <div><LeaveBalanceEdit userId={x.id} quota={x.leaveQuota} taken={x.leavesTaken} /></div>}</td>
                  <td>{fmtDays(bal.taken)}</td>
                  <td>{bal.pending ? <span className="pill amber">{fmtDays(bal.pending)}</span> : 0}</td>
                  <td><b className={bal.left <= 1 ? 'danger-text' : ''}>{fmtDays(bal.left)}</b></td>
                  <td>{wfh ? <span className="pill amber">{wfh} day{wfh === 1 ? '' : 's'}</span> : 0}</td>
                  <td>{Math.floor(shift / 3600)}h {Math.floor((shift % 3600) / 60)}m</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>{isApprover ? 'Leave requests' : 'My leave requests'}</h3>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Employee</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {requests.length === 0 ? <tr><td colSpan={6}>No requests yet.</td></tr> : requests.map(r => {
                const bal = isApprover ? leaveBalance(users.find((x) => x.id === r.userId) ?? { leaveQuota: 0, leavesTaken: 0 }) : null;
                return <tr key={r.id}>
                  <td><b>{r.user.name}</b>{bal && r.status === 'PENDING' && <div className="muted">{fmtDays(bal.left)} of {fmtDays(bal.total)} left</div>}</td>
                  <td>{r.startDate ? `${fmtDate(r.startDate)}${r.days > 1 ? ` – ${fmtDate(new Date(r.endDate!.getTime() - 1))}` : ''}` : '—'}</td>
                  <td>{fmtDays(r.days)}</td><td>{r.reason}</td>
                  <td><span className={`pill ${r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}`}>{r.status}</span></td>
                  <td><div className="row-actions">
                    {isApprover && r.status === 'PENDING' && <LeaveActions id={r.id} />}
                    {r.userId === u.id && r.status === 'PENDING' && <LeaveCancel id={r.id} />}
                    {isApprover && r.status === 'APPROVED' && r.endDate! >= today.start && <LeaveCancel id={r.id} label="Cancel leave" />}
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table></div>
        </div>

        <div className="card">
          <h3>Work-from-home log · {monthLabel(month)}</h3>
          <p className="muted">Clock-ins from outside the office. Each day counts as a half day in payroll.</p>
          {wfhLog.length === 0 ? <div className="empty-state">No work-from-home days this month.</div> :
            <div className="table-wrap"><table className="table"><thead><tr><th>Person</th><th>Date</th><th>Time</th><th>Where</th></tr></thead>
              <tbody>{wfhLog.map((c) => <tr key={c.id}><td><b>{c.user.name}</b></td><td>{fmtDate(c.at)}</td><td>{fmtTime(c.at)}</td><td className="muted">{c.distanceM != null ? `${formatDistance(c.distanceM)} from office` : 'Location not shared'}</td></tr>)}</tbody></table></div>}
        </div>
      </div>

      {office && <div style={{ marginTop: 14 }}><OfficeSettings office={office} /></div>}

      {(u.role === 'MD' || u.role === 'HR') && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Attendance regularisation</h3>
          <p className="muted">Office check-ins after {GRACE_LABEL} appear here. The MD can approve or reject them. Each person can raise two a month.</p>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Employee</th><th>Check-in</th><th>Note</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {regularisations.length === 0 ? (
                <tr><td colSpan={5}>No regularisation requests.</td></tr>
              ) : regularisations.map(x => (
                <tr key={x.id}>
                  <td><b>{x.user.name}</b><div className="muted">{x.user.role} · {regularisations.filter(r=>r.userId===x.userId&&monthKeyIST(new Date(r.attendanceAt))===monthKeyIST(new Date(x.attendanceAt))).length}/2 used in {monthKeyIST(new Date(x.attendanceAt))}</div></td>
                  <td>{new Date(x.attendanceAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                  <td>{x.note}</td>
                  <td><span className={`pill ${x.status === 'APPROVED' ? 'green' : x.status === 'REJECTED' ? 'red' : 'amber'}`}>{x.status}</span></td>
                  <td>{x.status === 'PENDING' ? <RegularisationActions id={x.id} /> : <span className="muted">Resolved</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}

      {seesTeam && <div className="card" style={{ marginTop: 14 }}>
        <h3>Productivity view</h3>
        <p className="muted">Tracked task time per person (all time). The app does not monitor browser activity.</p>
        <div className="summary-grid">
          {users.filter(x => x.active).map(x => {
            const taskSeconds = tasks.filter(t => t.ownerId === x.id).reduce((s, t) => s + t.timeSeconds + (t.runningSince ? Math.floor((Date.now() - new Date(t.runningSince).getTime()) / 1000) : 0), 0);
            return <div key={x.id}><b>{Math.floor(taskSeconds / 3600)}h</b><span>{x.name}</span></div>;
          })}
        </div>
      </div>}
    </div>
  );
}
