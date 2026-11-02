import { requirePageUser } from '@/lib/auth';
import { CHECK_IN_LABEL, GRACE_LABEL } from '@/lib/workcalendar';

export default async function Help() {
  const u = await requirePageUser();
  const lead = u.role === 'MD' || u.role === 'DMM';
  return <div className="page help-page">
    <div className="header"><div>
      <div className="eyebrow">HELP & GUIDE</div>
      <h1>How Markwiz OS works</h1>
      <p className="muted">The short version for everyone on the team. Tip: on your phone, use your browser’s “Add to Home Screen” to open Markwiz OS like an app.</p>
    </div></div>

    <div className="grid2">
      <section className="card"><h3>Your day</h3><ol className="list">
        <li><b>Clock in</b> on <a className="client-link" href="/today">Today</a> by {CHECK_IN_LABEL}. You have until {GRACE_LABEL}; after that it counts as late unless you add a regularisation note (two a month).</li>
        <li><b>Commit your plan</b> by 9:30 AM: pick only what you will actually hand in today. The plan locks at 11:00 AM and closes itself at 6:00 PM.</li>
        <li><b>Run the timer</b> on the task you’re working on. Logged time is how client costs are measured, so keep it running only while you work on that task.</li>
        <li><b>Clock out</b> when you finish. Clocking out also stops any task timer that’s still running.</li>
      </ol></section>

      <section className="card"><h3>Doing a task</h3><ol className="list">
        <li>Open it from <a className="client-link" href="/tasks">Work & Tasks</a>. Design, social and video tasks need <b>approved copy</b> before you start. Match it word for word.</li>
        <li>Upload the final file or paste the link, tick the checklist, then <b>Hand in</b>.</li>
        <li>Someone else does the <b>proof check</b>. If it comes back, read the note, fix, and hand in again.</li>
        <li>After review it goes to the client. Client changes come back to you as a new revision.</li>
        <li>Can’t move forward? Comment on the task straight away rather than letting it go overdue.</li>
      </ol></section>

      <section className="card"><h3>Leave and attendance</h3><ul className="list">
        <li>Request leave on <a className="client-link" href="/people">Attendance & Leave</a> with dates and a reason. Only working days count.</li>
        <li>Working days are Monday to Friday plus the 1st, 3rd and 5th Saturday.</li>
        <li>A working day with no clock-in and no approved leave is unpaid, so always clock in or apply for leave.</li>
        <li>Your payslips are on <a className="client-link" href="/my-pay">My Pay</a> once the month is marked paid.</li>
      </ul></section>

      <section className="card"><h3>Content calendar</h3><ul className="list">
        <li><a className="client-link" href="/content">Content calendar</a> shows every planned post by date for each client.</li>
        <li>Each post’s status follows its design task automatically: in design, in review, approved.</li>
        <li>When it goes live, open the post and use <b>Mark posted</b> with the live link.</li>
      </ul></section>

      <section className="card"><h3>Your scorecard</h3><ul className="list">
        <li><a className="client-link" href="/scorecards">Scorecards</a> are calculated from what happens in the app: hand-ins on time, proof-check returns, Say/Do and so on. Nobody rates their own work.</li>
        <li>Green: no reds and at most one amber. Red: two or more red KPIs.</li>
      </ul></section>

      <section className="card"><h3>Account and security</h3><ul className="list">
        <li>Change your password on <a className="client-link" href="/account">My Account</a>. Use 10+ characters with letters and numbers.</li>
        <li>Five wrong passwords lock your account for 15 minutes. If you’ve forgotten it, ask the MD to reset it.</li>
        <li>Never share your login. Every change is recorded against your name.</li>
      </ul></section>

      {lead && <section className="card"><h3>For the MD and DMM</h3><ul className="list">
        <li><b>Client scopes</b> create recurring tasks by themselves (monthly on the 1st, weekly on Mondays).</li>
        <li><b>Content calendar:</b> plan posts, then “Create design task”. The caption becomes the approved copy.</li>
        <li><b>Client reports:</b> each Monday, open last week’s report, add a personal line and send, or save as PDF. Nothing is sent automatically.</li>
        <li><b>Exceptions</b> lists only what’s red; the same list is emailed at 7:00 PM when email is set up.</li>
        {u.role === 'MD' && <li><b>Profitability</b> compares each retainer with logged time and client expenses. If time logging is low, costs look lower than they are.</li>}
        {u.role === 'MD' && <li>A lead marked <b>Won</b> becomes a client automatically. Check its retainer and load its scope.</li>}
      </ul></section>}
    </div>
  </div>;
}
