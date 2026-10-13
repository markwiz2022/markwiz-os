import { PrismaClient, Role, ClientHealth, LeadStage, InvoiceStatus, TaskStatus, Priority, LeaveStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { Db } from '../lib/db';
import { createOnboardingPlan, ensureInternalClient } from '../lib/onboarding';
import { applySeatTemplate } from '../lib/seats';
import { generateScopeTasks } from '../lib/scope';
import { QA_CHECKLIST } from '../lib/task-flow';

/*
 * MARKWIZ OS — DUMMY SEED DATA
 * Every client, lead, invoice, expense and salary below is FAKE test data.
 * Safe to share with developers. Real data is entered manually after deployment.
 *
 * Passwords are only set when an account is first created.
 * Re-running this seed will NOT reset anyone's password.
 */

const db = new PrismaClient();
const DAY = 86400000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

const TEAM: { email: string; name: string; role: Role; password: string; salary: number; code: string; seat: string; joined?: number }[] = [
  { email: 'joseph@markwiz.com', name: 'Joseph Danty', role: Role.MD,        password: 'Demo@MD2026',    salary: 0,     code: 'MW-001', seat: 'MD' },
  { email: 'gopi@markwiz.com',   name: 'Gopi',         role: Role.DEVELOPER, password: 'Demo@Gopi2026',  salary: 30000, code: 'MW-002', seat: 'WEB_OS' },
  { email: 'aleena@markwiz.com', name: 'Aleena',       role: Role.DEVELOPER, password: 'Demo@Aleena2026',salary: 25000, code: 'MW-003', seat: 'WEB' },
  { email: 'sinan@markwiz.com',  name: 'Sinan',        role: Role.DESIGNER,  password: 'Demo@Sinan2026', salary: 25000, code: 'MW-004', seat: 'DESIGNER' },
  { email: 'nohal@markwiz.com',  name: 'Nohal',        role: Role.SALES,     password: 'Demo@Nohal2026', salary: 28000, code: 'MW-005', seat: 'BD' },
  // Demo placeholders for the two hires. Deactivate them on the Team screen once the real people are added.
  { email: 'dmm.demo@markwiz.com', name: 'Demo DMM (new hire)', role: Role.DMM, password: 'Demo@DMM2026', salary: 0, code: 'MW-D01', seat: 'DMM', joined: -5 },
  { email: 'motion.demo@markwiz.com', name: 'Demo Motion (new hire)', role: Role.DESIGNER, password: 'Demo@Motion2026', salary: 0, code: 'MW-D02', seat: 'MOTION', joined: -5 },
  { email: 'reuben@markwiz.com', name: 'Reuben',       role: Role.SALES,     password: 'Demo@Reuben2026',salary: 35000, code: 'MW-006', seat: 'UAE_SALES' },
];

async function upsertUser(t: (typeof TEAM)[number]) {
  const existing = await db.user.findUnique({ where: { email: t.email } });
  if (existing) {
    return db.user.update({ where: { email: t.email }, data: { name: t.name, role: t.role, active: true, seat: existing.seat ?? t.seat } });
  }
  return db.user.create({
    data: {
      email: t.email, name: t.name, role: t.role,
      passwordHash: await bcrypt.hash(t.password, 12),
      monthlySalary: t.salary, employeeCode: t.code, seat: t.seat, joiningDate: t.joined !== undefined ? new Date(new Date(Date.now() + t.joined * DAY).toISOString().slice(0, 10)) : new Date('2025-06-01'),
    },
  });
}

async function main() {
  const u: Record<string, Awaited<ReturnType<typeof upsertUser>>> = {};
  for (const t of TEAM) u[t.email === 'motion.demo@markwiz.com' ? 'demo2' : t.name.split(' ')[0].toLowerCase()] = await upsertUser(t);

  const clients = [
    { id: 'demo-c1', name: 'Demo Realty',      company: 'Demo Realty Pvt Ltd',   industry: 'Real Estate', retainer: 80000, email: 'hello@demorealty.test', website: 'demorealty.test', manager: 'Joseph Danty' },
    { id: 'demo-c2', name: 'Sample School',    company: 'Sample Education Trust', industry: 'Education',   retainer: 60000, email: 'office@sampleschool.test', website: 'sampleschool.test', manager: 'Joseph Danty' },
    { id: 'demo-c3', name: 'Test Resort',      company: 'Test Hospitality LLP',  industry: 'Hospitality', retainer: 50000, email: 'stay@testresort.test', website: 'testresort.test', manager: 'Nohal' },
    { id: 'demo-c4', name: 'Example Jewellers', company: 'Example Jewels',        industry: 'Retail',      retainer: 40000, email: 'shop@examplejewels.test', website: 'examplejewels.test', manager: 'Reuben' },
  ];
  for (const c of clients) {
    const data = {
      name: c.name, company: c.company, industry: c.industry, retainer: c.retainer, email: c.email,
      phone: '+91 90000 00000', website: c.website, accountManager: c.manager,
      startDate: daysFromNow(-120), renewalDate: daysFromNow(60), health: ClientHealth.GREEN, healthScore: 85,
      notes: 'DUMMY CLIENT — test data only.', active: true,
    };
    await db.client.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
    await db.project.upsert({
      where: { id: `${c.id}-p1` }, update: {},
      create: { id: `${c.id}-p1`, clientId: c.id, name: 'Monthly Marketing Retainer', status: 'Active', startDate: daysFromNow(-120) },
    });
  }

  const tasks = [
    { id: 'demo-t1', c: 'demo-c1', desc: 'Design 12 social posts for the month', owner: u.sinan, due: 2,  p: Priority.P2, s: TaskStatus.OPEN },
    { id: 'demo-t2', c: 'demo-c1', desc: 'Fix landing page form tracking',         owner: u.gopi,  due: -1, p: Priority.P1, s: TaskStatus.OPEN },
    { id: 'demo-t3', c: 'demo-c2', desc: 'Admissions page speed optimisation',     owner: u.aleena,due: 4,  p: Priority.P2, s: TaskStatus.IN_PROGRESS },
    { id: 'demo-t4', c: 'demo-c3', desc: 'Weekend package creatives',               owner: u.sinan, due: 1,  p: Priority.P1, s: TaskStatus.OPEN },
    { id: 'demo-t5', c: 'demo-c4', desc: 'Shopify collection page update',          owner: u.gopi,  due: 6,  p: Priority.P3, s: TaskStatus.DONE },
  ];
  for (const t of tasks) {
    await db.task.upsert({
      where: { id: t.id }, update: {},
      create: { id: t.id, clientId: t.c, projectId: `${t.c}-p1`, desc: t.desc, ownerId: t.owner.id, assignerId: u.joseph.id, due: daysFromNow(t.due), priority: t.p, status: t.s },
    });
  }

  const leads = [
    { id: 'demo-l1', name: 'Demo Builders',    company: 'Demo Builders Co', value: 90000, prob: 40, stage: LeadStage.MEETING,   owner: u.nohal },
    { id: 'demo-l2', name: 'Sample Clinic',    company: 'Sample Health',    value: 45000, prob: 60, stage: LeadStage.PROPOSAL,  owner: u.nohal },
    { id: 'demo-l3', name: 'Test Café Dubai',  company: 'Test Foods FZE',   value: 70000, prob: 20, stage: LeadStage.QUALIFIED, owner: u.reuben },
  ];
  for (const l of leads) {
    await db.lead.upsert({
      where: { id: l.id }, update: {},
      create: { id: l.id, name: l.name, company: l.company, value: l.value, probability: l.prob, stage: l.stage, ownerId: l.owner.id, source: 'Dummy', nextAction: 'Follow up call', nextFollowUp: daysFromNow(3), notes: 'DUMMY LEAD — test data only.' },
    });
  }

  const invoices = [
    { number: 'DEMO-0001', c: 'demo-c1', amount: 80000, paid: 80000, due: -20, status: InvoiceStatus.PAID },
    { number: 'DEMO-0002', c: 'demo-c2', amount: 60000, paid: 20000, due: 5,   status: InvoiceStatus.PARTIAL },
    { number: 'DEMO-0003', c: 'demo-c3', amount: 50000, paid: 0,     due: -3,  status: InvoiceStatus.OVERDUE },
    { number: 'DEMO-0004', c: 'demo-c4', amount: 40000, paid: 0,     due: 10,  status: InvoiceStatus.SENT },
  ];
  for (const i of invoices) {
    await db.invoice.upsert({
      where: { number: i.number }, update: {},
      create: { number: i.number, clientId: i.c, amount: i.amount, paid: i.paid, dueDate: daysFromNow(i.due), status: i.status, note: 'DUMMY INVOICE' },
    });
  }

  if ((await db.expense.count({ where: { note: { startsWith: 'DUMMY' } } })) === 0) {
    await db.expense.createMany({
      data: [
        { clientId: 'demo-c1', category: 'Ad spend',     amount: 15000, date: daysFromNow(-10), note: 'DUMMY EXPENSE' },
        { clientId: 'demo-c3', category: 'Freelancer',   amount: 8000,  date: daysFromNow(-6),  note: 'DUMMY EXPENSE' },
        { clientId: null,      category: 'Software',     amount: 4500,  date: daysFromNow(-4),  note: 'DUMMY EXPENSE' },
        { clientId: null,      category: 'Office rent',  amount: 20000, date: daysFromNow(-15), note: 'DUMMY EXPENSE' },
      ],
    });
  }

  if ((await db.meeting.count({ where: { id: 'demo-m1' } })) === 0) {
    await db.meeting.create({ data: { id: 'demo-m1', clientId: 'demo-c2', title: 'Monthly review call', date: daysFromNow(-2), notes: 'DUMMY MEETING' } });
  }

  if ((await db.leaveRequest.count({ where: { reason: { startsWith: 'DUMMY' } } })) === 0) {
    await db.leaveRequest.create({ data: { userId: u.sinan.id, days: 1, startDate: daysFromNow(-5), endDate: daysFromNow(-5), reason: 'DUMMY approved leave', status: LeaveStatus.APPROVED } });
    await db.user.update({ where: { id: u.sinan.id }, data: { leavesTaken: 1 } });
    await db.leaveRequest.create({ data: { userId: u.aleena.id, days: 2, startDate: daysFromNow(6), endDate: daysFromNow(7), reason: 'DUMMY pending leave' } });
  }

  // ---------------- Autopilot demo data (all dummy) ----------------
  const adb = db as unknown as Db;
  const internal = await ensureInternalClient(adb);
  for (const t of TEAM) {
    const person = u[t.email === 'motion.demo@markwiz.com' ? 'demo2' : t.name.split(' ')[0].toLowerCase()];
    if ((await db.kpiTarget.count({ where: { userId: person.id } })) === 0) await applySeatTemplate(adb, person.id, t.seat);
  }
  const scopes = [
    { id: 'demo-s1', clientId: 'demo-c1', title: '3 Instagram posts', category: 'SOCIAL', cadence: 'WEEKLY', dueDay: 4, ownerId: u.sinan.id, needsCopy: true, needsProof: true },
    { id: 'demo-s2', clientId: 'demo-c1', title: 'Monthly performance report', category: 'REPORT', cadence: 'MONTHLY', dueDay: 5, ownerId: u.demo.id, needsCopy: false, needsProof: true },
    { id: 'demo-s3', clientId: 'demo-c2', title: 'Admissions campaign creatives', category: 'DESIGN', cadence: 'MONTHLY', dueDay: 20, ownerId: u.sinan.id, needsCopy: true, needsProof: true },
    { id: 'demo-s4', clientId: 'demo-c3', title: 'Website maintenance and backups', category: 'WEB', cadence: 'MONTHLY', dueDay: 25, ownerId: u.gopi.id, needsCopy: false, needsProof: false },
  ];
  for (const sc of scopes) {
    await db.scopeItem.upsert({ where: { id: sc.id }, update: {}, create: { ...sc, approvalLevel: 'L1', priority: 'P2', createdById: u.joseph.id } });
  }
  await generateScopeTasks(adb);
  const extra = [
    { id: 'demo-t6', c: 'demo-c2', desc: 'Open house poster for Sample School', owner: u.sinan, due: 3, category: 'DESIGN', needsCopy: true, needsProof: true, copy: null as string | null, status: TaskStatus.OPEN },
    { id: 'demo-t7', c: 'demo-c4', desc: 'Diwali offer carousel', owner: u.sinan, due: 1, category: 'SOCIAL', needsCopy: true, needsProof: true, copy: 'Diwali Gold Festival\nFlat 20% off making charges\nTill 31 October\nCall +91 90000 00000\nexamplejewels.test', status: TaskStatus.REVIEW },
    { id: 'demo-t8', c: 'demo-c3', desc: 'Weekend package landing page', owner: u.aleena, due: 5, category: 'WEB', needsCopy: false, needsProof: false, copy: null, status: TaskStatus.IN_PROGRESS },
  ];
  for (const t of extra) {
    await db.task.upsert({
      where: { id: t.id }, update: {},
      create: { id: t.id, clientId: t.c, desc: t.desc, ownerId: t.owner.id, assignerId: u.joseph.id, due: daysFromNow(t.due), priority: Priority.P2, approvalLevel: 'L1', status: t.status, category: t.category, needsCopy: t.needsCopy, needsProof: t.needsProof,
        approvedCopy: t.copy, copyById: t.copy ? u.joseph.id : null, copyAt: t.copy ? new Date() : null, firstSubmittedAt: t.status === TaskStatus.REVIEW ? new Date() : null,
        deliverableUrl: t.status === TaskStatus.REVIEW ? 'https://drive.google.com/demo-file' : null,
        checklist: t.category === 'WEB' ? QA_CHECKLIST.map((label, i) => ({ label, done: i < 4 })) : undefined },
    });
  }
  await db.task.updateMany({ where: { id: { in: ['demo-t1', 'demo-t4'] } }, data: { category: 'SOCIAL', needsCopy: true, needsProof: true } });
  await db.task.updateMany({ where: { id: { in: ['demo-t2', 'demo-t3', 'demo-t5'] } }, data: { category: 'WEB' } });
  await db.task.updateMany({ where: { id: 'demo-t5', deliveredAt: null }, data: { deliveredAt: new Date(), completedAt: new Date() } });
  for (const who of [u.demo, u.demo2]) await createOnboardingPlan(adb, who.id, u.joseph.id);
  if (!internal) throw new Error('internal client missing');

  console.log('Markwiz OS DUMMY seed completed.\n');
  console.log('LOGIN ACCOUNTS (first run only — change these after deployment)');
  for (const t of TEAM) console.log(`${t.name.padEnd(13)} ${t.role.padEnd(10)} ${t.email.padEnd(22)} ${t.password}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
