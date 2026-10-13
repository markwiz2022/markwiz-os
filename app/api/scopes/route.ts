import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard, isLead } from '@/lib/api';
import { audit } from '@/lib/audit';
import { generateScopeTasks, scopeData } from '@/lib/scope';
import { FlowError } from '@/lib/task-flow';

export async function GET() {
  const g = await guard('clients'); if (g.error) return g.error;
  return NextResponse.json(await db.scopeItem.findMany({ include: { client: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }));
}

export async function POST(req: Request) {
  const g = await guard('clients'); if (g.error) return g.error;
  const u = g.user!;
  try {
    if (!isLead(u.role)) throw new FlowError('Only the MD or DMM can change client scopes.', 403);
    const b = await req.json();
    const title = String(b.title || '').trim();
    if (!title) throw new FlowError('Name the deliverable.', 400);
    const client = await db.client.findUnique({ where: { id: String(b.clientId || '') } });
    if (!client || client.internal) throw new FlowError('Choose a client.', 400);
    const item = await db.scopeItem.create({ data: { clientId: client.id, title: title.slice(0, 200), createdById: u.id, ...scopeData(b) } });
    const gen = b.createNow === false ? { created: 0 } : await generateScopeTasks(db, new Date(), { itemId: item.id });
    await audit(u.id, 'CREATE', 'ScopeItem', item.id, { title, clientId: client.id });
    return NextResponse.json({ item, created: gen.created });
  } catch (e) { return errorResponse(e); }
}
