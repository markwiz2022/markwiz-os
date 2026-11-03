import type { Db } from './db';
import { audit } from './audit';
import { notify } from './team';

type LeadForConversion = { id: string; name: string; company: string | null; email: string | null; phone: string | null; website: string | null; industry: string | null; value: number; ownerId: string | null; clientId: string | null; billing?: string | null };

const isRetainer = (l: LeadForConversion) => !l.billing || l.billing === 'MONTHLY';

/** One-time, quarterly and yearly deals become a client service instead of a monthly retainer. */
async function addDealAsService(db: Db, lead: LeadForConversion, clientId: string, actor: { id: string }) {
  if (isRetainer(lead) || !(lead.value > 0)) return;
  const s = await db.clientService.create({ data: { clientId, name: `${lead.company || lead.name} (won deal)`, category: 'Other', billing: String(lead.billing), amount: lead.value, startDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`), status: 'ACTIVE', notes: 'Created from a won lead. Set the right category, name and billing date.' } });
  await audit(actor.id, 'CREATE', 'ClientService', s.id, { from: 'Lead', leadId: lead.id, amount: s.amount, billing: s.billing });
}

/**
 * When a lead is won, it becomes a client. If a client with the same name already exists it is linked
 * instead of duplicated. The MD and DMMs are asked to load the new client's scope.
 */
export async function convertLeadToClient(db: Db, lead: LeadForConversion, actor: { id: string; name: string }) {
  if (lead.clientId) {
    const existing = await db.client.findUnique({ where: { id: lead.clientId }, select: { id: true, name: true } });
    if (existing) { return { clientId: existing.id, clientName: existing.name, created: false }; }
  }
  const clientName = (lead.company || lead.name).trim();
  const all = await db.client.findMany({ where: { internal: false }, select: { id: true, name: true } });
  const match = all.find((c) => c.name.trim().toLowerCase() === clientName.toLowerCase());

  let clientId: string;
  let created = false;
  if (match) {
    clientId = match.id;
  } else {
    const owner = lead.ownerId ? await db.user.findUnique({ where: { id: lead.ownerId }, select: { name: true } }) : null;
    const c = await db.client.create({
      data: {
        name: clientName, company: lead.company, email: lead.email, phone: lead.phone, website: lead.website, industry: lead.industry,
        retainer: isRetainer(lead) ? lead.value || 0 : 0, accountManager: owner?.name ?? null, startDate: new Date(),
        notes: `Converted from a won lead (${lead.name}). Check the retainer and load the scope.`,
      },
    });
    clientId = c.id;
    created = true;
    await audit(actor.id, 'CREATE', 'Client', c.id, { from: 'Lead', leadId: lead.id, name: c.name, retainer: c.retainer });
  }
  await db.lead.update({ where: { id: lead.id }, data: { clientId } });
  await addDealAsService(db, lead, clientId, actor);

  const leads = await db.user.findMany({ where: { active: true, role: { in: ['MD', 'DMM'] } }, select: { id: true } });
  await notify(db, leads.map((x) => x.id), created ? 'New client from a won lead' : 'Won lead linked to a client',
    `${actor.name} won ${clientName}. ${created ? 'A client record was created. ' : ''}Load its recurring scope on Client scopes so the work creates itself.`);
  return { clientId, clientName, created };
}
