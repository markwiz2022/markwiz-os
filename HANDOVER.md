# Markwiz OS — Developer Handover

This package contains **code only** and **dummy data**. There is no database file,
no `.env` and no real client, cost, expense or salary information in it.
Real data will be entered manually by Joseph after deployment.

## 1. Run it locally

Requires Node.js 20 or newer.

```bash
cp .env.example .env
# edit .env and set JWT_SECRET to a random string of 32+ characters
npm install
npm run db:push      # creates prisma/dev.db from the schema
npm run db:seed      # loads DUMMY clients, leads, invoices, expenses and salaries
npm run dev          # http://localhost:3000
```

Generate a secret with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 2. Dummy logins (created by the seed)

| Name | Role | Email | Password |
|---|---|---|---|
| Joseph Danty | MD | joseph@markwiz.com | Demo@MD2026 |
| Gopi | DEVELOPER | gopi@markwiz.com | Demo@Gopi2026 |
| Aleena | DEVELOPER | aleena@markwiz.com | Demo@Aleena2026 |
| Sinan | DESIGNER | sinan@markwiz.com | Demo@Sinan2026 |
| Nohal | SALES | nohal@markwiz.com | Demo@Nohal2026 |
| Reuben | SALES | reuben@markwiz.com | Demo@Reuben2026 |

The seed only sets a password when an account is **first created**. Re-running it
never resets existing passwords. Change every password before real use.

## 3. Who can see what

| Area | MD | SALES | FINANCE | HR | Everyone else |
|---|---|---|---|---|---|
| Command Centre money figures (retainers, pipeline, receivables, collected) | ✔ | pipeline only | – | – | – |
| Clients (retainer, contact details, invoices hidden for non-MD) | full | limited | limited | limited | limited |
| Work & Tasks | all tasks | own | – | – | own |
| Sales CRM | ✔ | ✔ | – | – | – |
| Finance | ✔ | – | ✔ | – | – |
| Payroll (salaries, generate, mark paid) | ✔ | – | – | read via API | – |
| My Pay (own payslips only) | ✔ | ✔ | ✔ | ✔ | ✔ |
| AI COO, Audit Trail | ✔ | – | – | – | – |

`passwordHash` and `monthlySalary` are omitted from **every** database query by default
(`lib/db.ts`). A query must explicitly pass `omit: { monthlySalary: false }` to read salary.
Only login, payroll calculation, the payroll page and the salary API do this. Keep it that way.

## 4. Deployment checklist

1. **Database:** SQLite (`prisma/dev.db`) is for local use only. For a server, move to
   PostgreSQL: change `provider` in `prisma/schema.prisma`, set `DATABASE_URL`, run `npx prisma db push`.
2. **Secret:** set `JWT_SECRET` (32+ random characters). The app refuses to start in production without it.
3. **HTTPS** is required. Session cookies are `secure` in production.
4. **Seed:** run `npm run db:seed` only on an empty database, then change all passwords.
   Joseph may delete the dummy clients/leads/invoices before entering real data.
5. **Backups:** schedule daily database backups before real data goes in.
6. Build and start: `npm run build` then `npm start`.

## 5. Business rules in the code (confirmed by Joseph, 18 Sep 2026)

- **Working days:** Monday to Friday, plus the **1st, 3rd and 5th Saturday**. Sunday and the
  2nd and 4th Saturday are weekly offs. All of this lives in `lib/workcalendar.ts` — change it there only.
- **Check-in:** 9:00 AM IST with **15 minutes grace**. 9:16 AM onwards is late.
- A late punch is a **half-day deduction** unless an approved regularisation covers it.
  Max **2 regularisation requests** per employee per month.
- **Absence:** a working day that has already passed with no clock-in and no approved leave is an
  **unpaid day** and is deducted at the daily rate. Future days in the month are never counted as absent.
- **Leave** is date-based. Only working days inside the range are counted, and approved leave days
  are paid. Half days are allowed on single-date requests. Overlapping requests are blocked.
- Payroll can't be marked paid while any regularisation is pending. Paid months are locked.
- Deductions can never take a salary below zero. Salaries are rounded to whole rupees.
- Anyone on the team can assign a task to anyone else.

## 6. Changes made during QA (17 Sep 2026)

Security / data exposure
- `/tasks` page and `/api/tasks` were sending every user's **password hash and salary**, and client
  retainers, to all staff. Fixed with a global omit plus trimmed selects.
- `/api/leads` sent full owner records including password hash. Fixed.
- `/api/clients` sent invoice amounts to non-MD staff. Fixed.
- Home screen showed **collections** to all staff and **pipeline value** to non-sales staff. Now restricted.
- App ran in production with a default JWT secret. Now it refuses to start.

Bugs
- Logged-out users and restricted roles hit a server error page. They are now redirected.
- A forgotten clock-out blocked clock-in the next day. Fixed.
- Login failed on emails with capitals or spaces. Fixed.
- Payroll month used server time instead of IST. Fixed.
- Payroll amounts showed long decimals. Rounded to rupees.
- Cash pulse "still due" figure was calculated wrongly. Replaced with overdue amount.

Layout
- Card headings were inconsistent sizes across Command Centre, Finance and People. Unified.
- Cash/Sales pulse tiles overflowed their cards. Now a 2×2 grid.
- Finance forms were cramped with cut-off fields. Now two columns.
- AI COO button hidden for non-MD users.

## 7. Round two (18 Sep 2026)

- Working calendar, grace period and all date handling moved into one file, `lib/workcalendar.ts`.
- Leave now has real start and end dates, with balance, overlap and weekly-off checks,
  and notifies the MD and HR.
- Payroll now deducts unpaid absences and pays approved leave. Payroll and My Pay show
  paid-leave and absent days per person.
- New **My Account** screen: everyone can change their own password; the MD can reset anyone's.
  Minimum 10 characters with letters and numbers; resets are audited and notify the employee.

## 8. Known gaps (not changed)

- Payroll API routes return a 500 instead of 401 when called while logged out (no data is exposed).
- Approving a regularisation sets the employee status to "Active – Regularised" even if they have already clocked out.
- No automated test suite or login rate limiting yet.
- Expense approval requests and per-client profitability are designed but not built.
- If someone forgets to clock in, that day counts as an unpaid absence. Review the payroll draft each month before marking it paid.

## 9. Round three: Autopilot (22 Sep 2026)

Goal: Markwiz runs on rules, and Joseph only sees what is red. Everything below is enforced in
`lib/`, so the rules hold even if someone calls the API directly.

### Upgrading an existing database

1. **Back up `prisma/dev.db` (or the production database) first.**
2. `npm install` (adds `nodemailer`), then `npm run db:push`. Only new tables and columns are added;
   nothing is dropped. Existing tasks keep working and default to category General with no gates.
3. Sign in as Joseph, open **Team & targets**, set each person's **seat**, and press
   **Reset KPIs to seat**. For new hires use **Add a team member**: KPIs and the 90-day plan load by themselves.
4. Load every client's recurring work in **Client scopes**.
5. Do not run the seed on a real database. On a fresh demo database the seed also creates
   `Demo DMM (new hire)` and `Demo Motion (new hire)`. Deactivate both once the real people are added.

### Environment variables (see `.env.example`)

| Variable | What it switches on |
|---|---|
| `ANTHROPIC_API_KEY` | AI spell and copy check on uploaded designs. Without it the human proof check still works. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `DIGEST_TO`, `APP_URL` | 7 PM exceptions email. Without them the digest is in the app only. `SMTP_HOST=test` logs instead of sending. |
| `SCHEDULER=off` + `CRON_SECRET` | Only for serverless hosting: turn off the built-in timer and call `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>` every 5 to 10 minutes. |

The scheduler starts with `npm start` (`instrumentation.ts`) and checks every minute in IST. Each job
runs once per period (a `JobRun` row is the lock), so restarts and a cron call at the same time are safe.
If the server was off, missed jobs catch up on the next start. Status is on the **Exceptions** screen.

| Time (IST) | Job |
|---|---|
| 06:00 daily | Create this period's tasks from client scopes (1st of the month for monthly, Mondays for weekly) |
| 06:30 daily | Evaluate onboarding checkpoints that are due |
| 07:00 daily | Close client work with no changes requested after 3 working days |
| 18:00 working days | Close Say/Do plans, record days without a plan |
| 18:05 working days | Snapshot Red clients and items waiting on the MD |
| 19:00 working days | Exceptions digest (email only when something is red) |
| 02:00 on the 1st | Freeze last month's scorecards, raise PIP and bonus flags |
| every 5 minutes | Overdue work to owner and DMM; client work still late after one working day to the MD |

### The rules

- **Copy gate.** Design, social post and video tasks can't start or be handed in without approved copy,
  and the maker can't write their own copy.
- **Proof check.** Tasks that need it go to someone other than the maker. If the AI check flagged anything,
  the checker must tick that they checked every flag. Sending back needs a note and counts as a revision.
- **Release.** L0 maker, L1 DMM, L2 MD. The MD can always release. With no DMM yet, L1 falls to the MD.
- **Websites.** The 8-item QA checklist must be ticked before hand-in.
- **P1 cap.** Nobody holds more than 3 open P1 tasks.
- **Due dates.** Makers can't move their own. Every change is logged on the task.
- **Status.** Only the workflow actions change status. The MD has a logged override on the task page.
- **Client health** comes from overdue or blocked work, errors and complaints in the last 30 days and late
  invoices. Scheduled future work no longer lowers the score (see `lib/client-health.ts`).
- **Errors that reach a client** are logged by the MD, DMM or assigner, never by the maker, and are recorded
  against both the maker and the proof checker.
- **Scorecards** are calculated from app data only (`lib/kpi.ts` lists how each KPI is measured).
  A month is red with 2+ red KPIs and green with no reds and at most one amber. Two red months raise a
  PIP flag, three green months a bonus flag. Flags are visible to the MD only.
- **Say/Do.** Committed tasks handed in the same day before 6 PM count as done. A working day with a
  clock-in but no plan counts as one miss. Misses need a reason before the next plan.
- **Onboarding.** Seat plans (DMM, Motion, default) live in `lib/onboarding.ts`. Pass lines are measured by
  the system; the DMM's day-90 line also needs the MD's confirmation.

### New files

`lib/task-flow.ts` (workflow), `lib/scope.ts`, `lib/saydo.ts`, `lib/kpi.ts`, `lib/seats.ts`,
`lib/onboarding.ts`, `lib/rules.ts` (escalation, auto-close, snapshots), `lib/digest.ts`,
`lib/scheduler.ts`, `lib/proof-ai.ts`, `lib/team.ts`, `lib/format.ts`, `instrumentation.ts`,
`components/ops.tsx`, pages `today`, `tasks/[id]`, `scorecards`, `scopes`, `exceptions`, `team`, and API
routes under `app/api/` for files, AI check, incidents, scopes, today, kpi, team, flags, checkpoints,
outreach, cron and digest.

### Also fixed in this round

- AI COO showed a broken score (`$x.breakdown.score`) for at-risk clients.
- Tasks due today showed as overdue from 5:30 AM. Overdue now means after the end of the due day in IST.
- The Command Centre greeting used server time instead of IST.
- The MD's Add Client form was missing the retainer, email and website fields.
- Lead stage changes are now recorded by the server, so sales KPIs match the pipeline.
- Non-MD staff land on **Today** after login.

### Tested

On a fresh database with the dummy seed: 332 end-to-end checks across all roles (every page for every
role, copy gate, proof check with a mock AI server, release levels, client changes, incidents, QA
checklist, P1 cap, scopes, team setup, targets, outreach, digest email, and no password hash or salary in
any response), plus 40 checks of the time-based rules (calendar, ratings, Say/Do close, reasons,
escalation, auto-close, flags, ramps, checkpoints, scheduler idempotency). The real Claude API and a real
SMTP server were not called from the test environment; add the keys and use **Run AI check** and
**Send today's digest now** once to confirm on the server.
