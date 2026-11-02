/**
 * Clean start before real use: removes the DUMMY seed data and (optionally) gives everyone a new password.
 *
 *   npm run clean-start                      # shows what would be removed, changes nothing
 *   npm run clean-start -- --confirm         # backs up, then removes the demo data
 *   npm run clean-start -- --confirm --reset-passwords   # also sets a new random password for every active person
 *
 * Only records created by prisma/seed.ts are touched: clients/leads/tasks/scopes/meetings with ids starting
 * "demo-", invoices numbered DEMO-, expenses and leave marked DUMMY, and the two "Demo ... (new hire)"
 * accounts (deactivated, not deleted). Everything runs in one transaction: it all happens, or nothing does.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const confirm = process.argv.includes('--confirm');
const resetPasswords = process.argv.includes('--reset-passwords');
const db = new PrismaClient();
const DEMO_EMAILS = ['dmm.demo@markwiz.com', 'motion.demo@markwiz.com'];

function newPassword() {
  // 12 characters, letters and digits, always at least one of each (meets the app's password rule).
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const b = randomBytes(12);
  const chars = Array.from(b, (x) => all[x % all.length]);
  chars[0] = letters[b[0] % letters.length];
  chars[11] = digits[b[11] % digits.length];
  return chars.join('');
}

async function main() {
  const demoClients = (await db.client.findMany({ where: { id: { startsWith: 'demo-' } }, select: { id: true, name: true } }));
  const demoUsers = await db.user.findMany({ where: { email: { in: DEMO_EMAILS } }, select: { id: true, name: true, active: true } });
  const clientIds = demoClients.map((c) => c.id);
  const userIds = demoUsers.map((u) => u.id);
  const tasks = await db.task.findMany({ where: { OR: [{ clientId: { in: clientIds } }, { id: { startsWith: 'demo-' } }, { ownerId: { in: userIds } }] }, select: { id: true } });
  const taskIds = tasks.map((t) => t.id);

  const counts = {
    clients: demoClients.length,
    tasks: taskIds.length,
    leads: await db.lead.count({ where: { id: { startsWith: 'demo-' } } }),
    invoices: await db.invoice.count({ where: { number: { startsWith: 'DEMO-' } } }),
    expenses: await db.expense.count({ where: { OR: [{ note: { startsWith: 'DUMMY' } }, { clientId: { in: clientIds } }] } }),
    leaveRequests: await db.leaveRequest.count({ where: { reason: { startsWith: 'DUMMY' } } }),
    demoAccountsToDeactivate: demoUsers.filter((u) => u.active).length,
  };
  console.log('Demo data found:', counts);
  console.log('Clients:', demoClients.map((c) => c.name).join(', ') || 'none');

  if (!confirm) {
    console.log('\nNothing was changed. Run again with --confirm to remove it (a backup is taken first).');
    return;
  }

  execFileSync(process.execPath, ['scripts/backup-db.mjs'], { stdio: 'inherit' });

  await db.$transaction(async (tx) => {
    await tx.timeEntry.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.expense.deleteMany({ where: { OR: [{ note: { startsWith: 'DUMMY' } }, { clientId: { in: clientIds } }] } });
    await tx.task.deleteMany({ where: { id: { in: taskIds } } });
    await tx.invoice.deleteMany({ where: { number: { startsWith: 'DEMO-' } } });
    await tx.lead.deleteMany({ where: { id: { startsWith: 'demo-' } } });
    await tx.scopeItem.deleteMany({ where: { id: { startsWith: 'demo-' } } });
    await tx.meeting.deleteMany({ where: { id: { startsWith: 'demo-' } } });
    await tx.client.deleteMany({ where: { id: { in: clientIds } } });
    const dummyLeave = await tx.leaveRequest.findMany({ where: { reason: { startsWith: 'DUMMY' }, status: 'APPROVED' }, select: { userId: true, days: true } });
    for (const l of dummyLeave) await tx.user.update({ where: { id: l.userId }, data: { leavesTaken: { decrement: l.days } } });
    await tx.leaveRequest.deleteMany({ where: { reason: { startsWith: 'DUMMY' } } });
    await tx.user.updateMany({ where: { id: { in: userIds } }, data: { active: false } });
    await tx.auditLog.create({ data: { action: 'CLEAN_START', entity: 'System', metadata: counts } });
  }, { timeout: 60_000 });
  console.log('\nDemo data removed.');

  if (resetPasswords) {
    const people = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } });
    console.log('\nNEW PASSWORDS — share each one privately, then ask everyone to change it on My Account:');
    for (const p of people) {
      const pw = newPassword();
      await db.user.update({ where: { id: p.id }, data: { passwordHash: await bcrypt.hash(pw, 12) } });
      console.log(`${p.name.padEnd(24)} ${p.email.padEnd(30)} ${pw}`);
    }
    await db.auditLog.create({ data: { action: 'RESET_ALL_PASSWORDS', entity: 'System', metadata: { people: people.length } } });
  }
  console.log('\nNext: set real salaries in Payroll, add real clients, and remove anything else you don’t need.');
}

main().catch((e) => { console.error('Clean start stopped with an error. If it stopped while removing demo data, nothing was removed (it runs as one transaction). A backup is in backups/.\n', e); process.exit(1); }).finally(() => db.$disconnect());
