import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import AttendanceControls from '@/components/attendance-controls';
import LeaveForm from '@/components/leave-form';
import LeaveActions from '@/components/leave-actions';
import RegularisationActions from '@/components/regularisation-actions';

export default async function People() {
  const u = await requirePageUser('people');
  const [users, requests, tasks, regularisations] = await Promise.all([
    db.user.findMany({ where: u.role === 'MD' || u.role === 'HR' || u.role === 'DMM' ? {} : { id: u.id }, orderBy: { name: 'asc' } }),
    db.leaveRequest.findMany({
      where: u.role === 'MD' || u.role === 'HR' ? {} : { userId: u.id },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    db.task.findMany({ select: { ownerId: true, timeSeconds: true, runningSince: true } }),
    db.regularisationRequest.findMany({
      where: u.role === 'MD' ? {} : { userId: u.id },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="eyebrow">PEOPLE OPERATIONS</div>
          <h1>People</h1>
          <p className="muted">Attendance, leave, roles and team productivity.</p>
        </div>
        
      </div>

      {u.role !== 'MD' && <LeaveForm />}

      <div className="card">
        <div className="section-head">
          <div>
            <h3>Team status</h3>
            <p className="muted">Live attendance and leave balance. Check-in is 9:00 AM with grace until 9:15 AM. Working days are Monday to Friday plus the 1st, 3rd and 5th Saturday.</p>
          </div>
        </div>
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Leave</th><th>Shift</th><th>Action</th></tr></thead>
          <tbody>
            {users.map(x => {
              const shift = x.shiftSeconds + (x.checkInAt && !x.checkOutAt ? Math.floor((Date.now() - new Date(x.checkInAt).getTime()) / 1000) : 0);
              return (
                <tr key={x.id}>
                  <td><b>{x.name}</b><div className="muted">{x.email}</div></td>
                  <td>{x.role}</td>
                  <td><span className={`pill ${x.checkInAt && !x.checkOutAt ? 'green' : 'amber'}`}>{x.checkInAt && !x.checkOutAt ? x.status : x.status}</span></td>
                  <td>{(x.leaveQuota - x.leavesTaken).toFixed(2)} / {x.leaveQuota}</td>
                  <td>{Math.floor(shift / 3600)}h {Math.floor((shift % 3600) / 60)}m</td>
                  <td>{x.id === u.id ? <AttendanceControls active={!!(x.checkInAt && !x.checkOutAt)} /> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(u.role === 'MD' || u.role === 'HR') && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3>Attendance regularisation</h3>
          <p className="muted">Late check-ins after 9:00 AM appear here. Joseph/MD can approve or reject them.</p>
          <table className="table">
            <thead><tr><th>Employee</th><th>Check-in</th><th>Note</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {regularisations.length === 0 ? (
                <tr><td colSpan={5}>No regularisation requests.</td></tr>
              ) : regularisations.map(x => (
                <tr key={x.id}>
                  <td><b>{x.user.name}</b><div className="muted">{x.user.role} · {regularisations.filter(r=>r.userId===x.userId).length}/2 used this month</div></td>
                  <td>{new Date(x.attendanceAt).toLocaleString('en-IN')}</td>
                  <td>{x.note}</td>
                  <td><span className={`pill ${x.status === 'APPROVED' ? 'green' : x.status === 'REJECTED' ? 'red' : 'amber'}`}>{x.status}</span></td>
                  <td>{x.status === 'PENDING' ? <RegularisationActions id={x.id} /> : <span className="muted">Resolved</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid2" style={{ marginTop: 18 }}>
        <div className="card">
          <h3>Leave requests</h3>
          <table className="table">
            <thead><tr><th>Employee</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th>{(u.role === 'MD' || u.role === 'HR') && <th>Action</th>}</tr></thead>
            <tbody>
              {requests.length === 0 ? <tr><td colSpan={6}>No requests.</td></tr> : requests.map(r => (
                <tr key={r.id}>
                  <td>{r.user.name}</td><td>{r.startDate?`${new Date(r.startDate).toLocaleDateString('en-IN')} – ${new Date(r.endDate!).toLocaleDateString('en-IN')}`:'—'}</td><td>{r.days}</td><td>{r.reason}</td>
                  <td><span className={`pill ${r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}`}>{r.status}</span></td>
                  {(u.role === 'MD' || u.role === 'HR') && <td>{r.status === 'PENDING' ? <LeaveActions id={r.id} /> : <span className="muted">Resolved</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Productivity view</h3>
          <p className="muted">Productivity is derived from tracked task time against active shift time. The system does not claim browser-level activity monitoring.</p>
          <div className="summary-grid">
            {users.filter(x => x.active).map(x => {
              const taskSeconds = tasks.filter(t => t.ownerId === x.id).reduce((s, t) => s + t.timeSeconds + (t.runningSince ? Math.floor((Date.now() - new Date(t.runningSince).getTime()) / 1000) : 0), 0);
              return <div key={x.id}><b>{Math.floor(taskSeconds / 3600)}h</b><span>{x.name} tracked task time</span></div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
