# Markwiz OS

Markwiz OS is the internal operating system for Markwiz Marketing Consultancy.

## Current modules

- Command Centre: executive KPIs, client health, delivery risk, sales, cash and people summary, plus the autopilot strip
- Today: Say/Do daily plan (commit by 9:30, locks at 11:00, closes at 6:00 PM) and the team stand-up view
- Work & Tasks: gated flow (copy, work, hand in, proof check, review, client) with proof and review queues
- Client scopes: recurring deliverables that create their own tasks every month and week
- Scorecards: per-person KPIs calculated from app data, monthly history, PIP and bonus flags, 90-day onboarding checkpoints
- Exceptions: reds-only view and the 7 PM digest email
- Team & targets: add people with a seat; KPIs and onboarding plan load automatically
- Clients: account records, retainers, renewal, health, health causes, projects, tasks and receivables
- Sales CRM: seven-stage pipeline, weighted pipeline, ownership, next actions and follow-ups
- Finance: invoices, payments, receivables, expenses and contribution view
- People: attendance, clock in/out, leave balances and regularisation
- AI COO: read-only executive risk and priority analysis
- Notifications: task assignment, leave and client-health responsibility alerts
- Audit Trail: recorded operational changes for MD review

**Developers: read `HANDOVER.md` first** (setup, dummy logins, permissions, deployment checklist).

## Local development

1. Node.js 20+
2. Set `DATABASE_URL` and a strong `JWT_SECRET` in `.env`.
3. `npm install`
4. `npm run db:push` (new database only)
5. `npm run db:seed` (dummy data, new database only)
6. `npm run dev`
7. Open `http://localhost:3000`

### Protecting existing data

The local SQLite database is `prisma/dev.db`. Treat it as real working data during development.

Do **not** run `npm run db:seed` against a database containing live development data. The seed is for a fresh/demo database only.

Before schema work or migrations, make a copy of `prisma/dev.db` first.

Never use `prisma db push --force-reset` on the working database.

## Production checklist

Before real company deployment, move to PostgreSQL or another production database, use HTTPS, a strong secret, backups, rate limiting, monitoring, secure secret management, automated tests and a formal deployment pipeline.
