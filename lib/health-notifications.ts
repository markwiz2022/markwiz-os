import type { Db } from './db';
import { getClientHealthBreakdown } from './client-health';

export async function notifyClientHealthChange(db: Db, clientId: string) {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, accountManager: true, internal: true },
  });
  if (!client || client.internal) return;

  const breakdown = await getClientHealthBreakdown(db, clientId);
  if (breakdown.issues.length === 0) return;

  const recipients = new Set<string>();

  const management = await db.user.findMany({
    where: { active: true, role: { in: ['MD', 'DMM'] } },
    select: { id: true, name: true },
  });
  management.forEach((user) => recipients.add(user.id));

  if (client.accountManager) {
    const accountManager = management.find(
      (user) => user.name.toLowerCase() === client.accountManager!.toLowerCase()
    );
    if (accountManager) recipients.add(accountManager.id);
  }

  // Payment issues are only shown to management, never to delivery owners.
  Object.values(breakdown.byOwner).forEach((owner) => {
    if (owner.ownerId) recipients.add(owner.ownerId);
  });

  for (const userId of recipients) {
    const personalIssues = breakdown.issues.filter((issue) => issue.ownerId === userId);
    const responsible = personalIssues.length > 0;
    const isManagement = management.some((m) => m.id === userId);
    const relevantIssues = responsible ? personalIssues : breakdown.issues.filter((issue) => isManagement || issue.kind !== 'INVOICE');
    const deduction = personalIssues.reduce((sum, issue) => sum + issue.deduction, 0);
    const issueText = relevantIssues.slice(0, 5).map((issue) =>
      `• ${issue.task}\n  ${issue.reason} (-${issue.deduction} points)`
    ).join('\n');

    const title = responsible
      ? `Task affecting ${client.name} health`
      : `Client Health Alert — ${client.name}`;
    const body = responsible
      ? `${client.name} health is ${breakdown.health} (${breakdown.score}).\n\nYour task(s) are affecting the client health score by ${deduction} point(s).\n\n${issueText}\n\nPlease review and action the task(s).`
      : `${client.name} health is ${breakdown.health} (${breakdown.score}).\n\nHealth issues:\n\n${issueText}`;

    const existing = await db.notification.findFirst({
      where: { userId, title, body, read: false },
      select: { id: true },
    });
    if (existing) continue;

    await db.notification.create({ data: { userId, title, body } });
  }
}
