const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backup() {
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupData = {
    timestamp: new Date().toISOString(),
    users: await prisma.user.findMany(),
    clients: await prisma.client.findMany(),
    projects: await prisma.project.findMany(),
    tasks: await prisma.task.findMany(),
    scopeItems: await prisma.scopeItem.findMany(),
    invoices: await prisma.invoice.findMany(),
    expenses: await prisma.expense.findMany(),
    attendanceLogs: await prisma.attendanceLog.findMany(),
    dailyPlans: await prisma.dailyPlan.findMany({ include: { items: true } }),
    contentPosts: await prisma.contentPost.findMany(),
    leads: await prisma.lead.findMany(),
    auditLogs: await prisma.auditLog.findMany(),
    passwordResetTokens: await prisma.passwordResetToken?.findMany().catch(() => []),
    clientServices: await prisma.clientService?.findMany().catch(() => []),
  };

  const filename = path.join(backupDir, `backup_${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));
  console.log('SUCCESSFULLY SAVED BACKUP TO:', filename);
  console.log({
    users: backupData.users.length,
    clients: backupData.clients.length,
    projects: backupData.projects.length,
    tasks: backupData.tasks.length,
    scopeItems: backupData.scopeItems.length,
    invoices: backupData.invoices.length,
  });
}

backup().catch(console.error).finally(() => process.exit(0));
