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
npm run check        # type check, tests and a full build. Must end with "All checks passed."
npm run dev          # http://localhost:3000
```

Already installed? See **section 10** for update steps and **section 11** before changing any code.

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

## 10. Round four (2 Nov 2026)

### Updating an existing install to this version

1. Stop the app (Ctrl+C in the window running `npm run dev`).
2. Copy the new files over the old folder. Keep your `.env` and `prisma/dev.db`; they are not in the zip.
3. `npm install`
4. `npm run db:update`. This backs up the database into `backups/` first, then adds the new tables and
   column (`LoginAttempt`, `AppSetting`, `Lead.lostReason`). Nothing is removed or changed in existing data.
5. `npm run check`, then `npm run dev`.

On a server with PostgreSQL, take a backup with your host first, then run `npx prisma db push`.

### Privacy and correctness fixes

- **Work & Tasks** sent every open task to every user. Staff now load only their own and assigned work,
  proof checks, and reviews they are allowed to release. The task-dependency list is limited the same way.
- **Command Centre** showed every team member's overdue tasks to all staff. Non-leads now see only their
  own and assigned work; invoices load only for the MD, and pipeline only for MD and Sales.
- **Finance contribution** subtracted all expenses and payroll ever recorded from one month's retainers.
  It now compares the same month on both sides, with a month picker.
- **People:** the "2/2 used this month" counter counted every request ever made. It now counts the month
  of each request, matching the API rule. Late-check-in wording now uses the 9:15 AM grace time
  everywhere, including the late check-in box.
- **Login** now locks an email for 15 minutes after 5 failed attempts (20 per network address). Stored in
  the database, so it works on Vercel or several servers. Failed attempts on a real account are audited.
- Staff-facing messages no longer name the developer.
- Payroll and People API routes returned a 500 when logged out. They now return 401 (closes a known gap).

### New features

- **Finance:** edit any invoice or expense, delete (MD only; the full record is kept in the audit trail),
  month picker, CSV export of invoices and expenses. Duplicate invoice numbers are refused.
- **Payroll:** open any past month (to process last month's salaries) and export the month as CSV.
- **Audit Trail:** filters by person, action, area and date, search, 50 per page, readable "what changed"
  column, CSV export (up to 10,000 rows).
- **Sales CRM:** edit a lead (value, probability, source, next action, follow-up, contact, notes); a fixed
  list of lead sources; a reason is required when a lead is marked Lost; "Leads by source" and
  "Why leads are lost" reports. List values live in `lib/crm.ts`.
- **Clients:** Edit client on each card and on the client page; search and health filter. Who can add
  clients is now a setting on **Team & targets** (it was hard-coded to one email). The API enforces it.
- **Client scopes:** edit a recurring deliverable. Changes apply from the next task it creates.
- **Team & targets:** search and filter; edit a person's name and sign-in email.
- **AI COO:** the review list is built from live data (overdue work, at-risk clients, overdue invoices,
  renewals in the next 30 days, sales follow-ups, clients without scope, last month's payroll, pending
  approvals), each linking to where you act on it.

### New files

`lib/csv.ts`, `lib/audit-query.ts`, `lib/crm.ts`, `lib/rate-limit.ts`, `lib/settings.ts`,
`components/client-edit.tsx`, `components/finance-row-actions.tsx`, `components/scope-edit.tsx`,
`components/team-extra.tsx`, `app/api/finance/export`, `app/api/audit/export`, `app/api/payroll/export`,
`app/api/settings`, `scripts/backup-db.mjs`, `tests/rules.test.ts`.

### Still open

- No password reset by email (the MD resets passwords in My Account).
- Expense approval requests and per-client profitability are still designed but not built.
- Work & Tasks has search and filters but no paging; fine for hundreds of open tasks.
- `npm install` reports dependency advisories. Update with care (`npm audit`), never `--force` without
  running `npm run check` afterwards.

## 11. Making changes safely

Run these from the project folder.

| Command | When | What it does |
|---|---|---|
| `npm run backup` | Before any risky change or bulk data entry | Copies `prisma/dev.db` into `backups/` with a timestamp (keeps the last 30) |
| `npm run check` | After **every** code change, before using or deploying it | Type-checks all code, runs the rule tests, and does a full production build in `.next-check` (safe while `npm run dev` is running). Ends with "All checks passed." |
| `npm test` | Quick check after changing a business rule | Runs `tests/rules.test.ts` (calendar, late check-in, task visibility, release levels, CSV, audit) |
| `npm run db:update` | After any change to `prisma/schema.prisma` | Backs up, then applies the schema. Prisma refuses changes that would delete data unless told to. |
| `npm run clean-start` | Once, before real use | Shows the demo data; add `-- --confirm` to remove it and `--reset-passwords` to issue new passwords |

Rules for changes:

1. **Back up, change, check.** `npm run backup` → make the change → `npm run check`. Only use or deploy
   it when the check passes.
2. **Schema changes only add.** Add new optional columns or new tables. Never rename or delete a column
   that holds data; add a new one and migrate. If `db push` warns about data loss, stop.
3. **Business rules live in one place:** calendar and check-in times in `lib/workcalendar.ts`, task flow
   in `lib/task-flow.ts`, CRM lists in `lib/crm.ts`, settings in `lib/settings.ts`. Change them there,
   then add or update a test in `tests/rules.test.ts`.
4. **Settings before code.** Where the MD should control something (like who can add clients), add an
   `AppSetting` with a safe default in `lib/settings.ts` rather than hard-coding names or emails.
5. **To undo a bad database change:** stop the app, copy the latest file from `backups/` over
   `prisma/dev.db`, start the app.
6. **Use git.** `git init` once, then `git add -A && git commit -m "what changed"` after each passing
   check, so any change can be undone with `git checkout`.

## 12. Going live on Vercel (step by step)

Do these in order. Steps 1–6 take about an hour.

1. **Database.** In the Vercel project: Storage → Create → Neon (Postgres). Connect it to the project.
   This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED`. The app switches to PostgreSQL automatically when
   `DATABASE_URL` starts with `postgres` (`scripts/db-provider.mjs`); the Mac keeps using SQLite.
2. **Environment variables** (Project → Settings → Environment Variables, Production):
   `JWT_SECRET` (48+ random characters), `APP_URL` (the live address), `SCHEDULER=off`,
   `CRON_SECRET` (16+ random characters). Optional: SMTP settings and `ANTHROPIC_API_KEY` (see `.env.example`).
3. **Create the tables.** On a Mac, in the project folder, put the two Neon URLs in a temporary
   `.env.production.local` or export them in the terminal, then run `npx prisma db push`
   (`node scripts/db-provider.mjs` first if the schema still says sqlite). Or run it once from Vercel's build
   by adding `&& prisma db push` to the build command temporarily.
4. **Deploy** (push to the connected Git branch, or `vercel --prod`). Vercel runs `npm run build`.
5. **Scheduled jobs.** `vercel.json` calls `/api/cron` daily at 07:10, 18:10, 19:10 and 02:10 IST. That
   covers every job (scope tasks, checkpoints, auto-close, Say/Do close, snapshots, 7 PM digest, month close),
   because each run catches up anything that is due. On the Hobby plan Vercel may run each call up to an hour
   late; on Pro you can replace the four entries with one `"*/10 * * * *"`. Check **Exceptions → Autopilot
   status** the next day: every job should say "Ran".
6. **First login and clean start.** Sign in as the MD. Locally with the same database settings, run
   `npm run clean-start` to see the demo data, then `npm run clean-start -- --confirm --reset-passwords`.
   Share each new password privately; everyone changes theirs on My Account. Set real salaries in Payroll.
7. **Backups.** Neon keeps point-in-time history (check your plan's restore window). Also export a copy
   weekly: `pg_dump "$DATABASE_URL_UNPOOLED" > markwiz-YYYYMMDD.sql`, stored outside Vercel.
8. **Email.** For digests and client reports, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`,
   `SMTP_USER` (a Workspace mailbox), `SMTP_PASS` (an App Password for it) and `SMTP_FROM`.
9. **Logo on reports.** Add `public/report-logo.png` (about 300 × 80 px, transparent background).

Phones: staff open the live address in their phone browser and choose **Add to Home Screen**. Locally, a
phone on the same Wi-Fi can open the "Network" address that `npm run dev` prints.

Uploads are limited to 4 MB (Vercel's request limit is 4.5 MB) and are stored in the database. When the
database grows past a few GB, move files to Vercel Blob or S3.

## 13. Round five (2 Nov 2026)

Update an existing install the same way as section 10: copy the files over, `npm install`,
`npm run db:update`, `npm run check`. New tables: `ContentPost`, `ClientReport`; new column `Lead.clientId`.

- **Won lead becomes a client.** Marking a lead Won creates the client (or links an existing one with the same
  name) with the lead's contact details and monthly value as the retainer, and asks the MD and DMMs to load
  its scope. Older won leads show a "Create client record" button. Code: `lib/lead-convert.ts`.
- **Client profitability** (MD, `/profitability`). Per client per month: retainer minus logged task time
  (salary ÷ (8 h × working days) per person) minus client expenses. Shows time-logging coverage, because
  unlogged time makes clients look more profitable than they are. `HOURS_PER_DAY` is in
  `lib/profitability.ts`.
- **Content calendar** (`/content`). Month grid on desktop, list on phones. MD/DMM plan posts and create the
  design task in one click (the caption becomes approved copy). Status follows the task; the task owner can
  mark the post Posted with the live link. Export a month's plan as CSV to share with the client. Lists:
  `lib/content.ts`.
- **Weekly client reports** (MD/DMM, `/reports`). Delivered this week, waiting on client feedback, content,
  in progress and next week, from tasks and the calendar. Never includes health scores, money or internal
  notes. Preview, add a personal note, then email (replies go to the sender) or Print / Save as PDF. Nothing
  is sent automatically; every send is logged. Code: `lib/client-report.ts`.
- **Phones.** Top bar with Menu (closes after each tap), two-column KPIs, full-width 16 px form fields (no
  iPhone zoom), tables scroll sideways inside their card, content scaled up for readability. Styles are at
  the end of `app/globals.css`.
- **Help & guide** page for staff (`/help`).
- **Go-live tooling:** automatic SQLite/PostgreSQL switch, `vercel.json` schedule, `npm run clean-start`,
  `.env.example` rewritten for Vercel and Google Workspace email.
- **Security updates:** Next.js 15.5.28 (fixes the critical advisory), nodemailer 10, zod, sharp, postcss.
  Remaining advisories are in the Prisma command-line tool and Next's build-time postcss copy; they don't run
  in the live app. Fixing Prisma needs Prisma 7, a breaking upgrade best done separately.

## 14. One-time and periodic work (3 Nov 2026)

Retainers stay on the client record and count every month. Everything else is a **client service**
(`ClientService`), added on the client page under **One-time & yearly work** (MD and Finance):

| Billing | Counts in Finance and Profitability |
|---|---|
| One-time (website build, branding, offline/BTL, video) | Once, in the month of its billing date |
| Monthly | Every month from the start date until the end date |
| Quarterly | Every third month from the start date |
| Yearly (hosting, domain, email, AMC) | Each anniversary month of the start date |

- **Quoted** and **Cancelled** never count. **Stop renewing** sets an end date of today, so past renewals stay
  in past months. Delete is for mistakes only (MD; kept in the audit trail).
- **Finance** shows retainers plus work billed in the selected month, a 12-month revenue planner, the items
  billed this month (so invoices get raised) and renewals due in the next 60 days. **AI COO** lists renewals
  due in 30 days. **Profitability** uses the same monthly revenue.
- **CRM** leads have a billing type. A won monthly lead becomes the client's retainer; a won one-time,
  quarterly or yearly lead becomes a client service with that value.
- The rules are in `lib/services.ts` and tested in `tests/rules.test.ts`.

**Updating the live app (Vercel + Supabase):** the database needs the new table and column before the new code
goes live. From the project folder on the Mac:

```bash
DATABASE_URL="<Supabase pooled URL, port 6543, ending ?pgbouncer=true>" \
DATABASE_URL_UNPOOLED="<Supabase direct URL, port 5432>" \
npm run db:push
```

Then deploy the code the usual way. `npm run dev` switches the project back to the local SQLite database by itself.
Supabase users: `DATABASE_URL` must be the pooled address with `?pgbouncer=true`; `DATABASE_URL_UNPOOLED` the
direct (or session pooler) address on port 5432.

## 15. Apollo → Sales CRM (3 Nov 2026)

Every contact saved in Apollo (from a search, a list or the Apollo Chrome extension) becomes a NEW lead in Sales CRM.

- **Turn it on:** Apollo → Settings → Integrations → API Keys → create a key. In Vercel → Settings → Environment Variables add `APOLLO_API_KEY` with that key, then redeploy. On your Mac, put it in `.env`.
- **What comes across:** name, job title, company, email, phone, website, industry, LinkedIn. Source is “Apollo”, stage NEW, probability 10%, next action “First touch: reach out”, follow-up today. Each card links back to the contact in Apollo.
- **No duplicates:** matched by Apollo contact id, then by email. A lead you already added by hand is linked to Apollo, not copied.
- **First sync** brings in contacts saved in the last 7 days only, not your whole Apollo history.
- **Who gets them:** the MD picks a person on the CRM page (“Leads go to”). Default is the first Sales person. They get a notification.
- **How often:** about every 10 minutes while anyone has the CRM open, on each Vercel cron run, and on “Sync now”. For a steady 10-minute sync even when nobody is in the app, add a free job at cron-job.org that calls `https://markwiz-os.vercel.app/api/cron` every 10 minutes with the header `Authorization: Bearer <CRON_SECRET>`.
- **Code:** `lib/apollo.ts` (sync), `lib/apollo-map.ts` (field mapping, tested in `tests/apollo.test.ts`), `app/api/apollo/route.ts`, `components/apollo-panel.tsx`.
- **Database:** new optional columns on Lead: `apolloId` (unique), `title`, `linkedin`. Run `npm run db:update` locally and the live `db:push` before deploying.
