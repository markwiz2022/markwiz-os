import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard, isLead } from '@/lib/api';
import { audit } from '@/lib/audit';
import { FlowError } from '@/lib/task-flow';
import { scopeData } from '@/lib/scope';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('clients'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  try {
    if (!isLead(u.role)) throw new FlowError('Only the MD or DMM can change client scopes.', 403);
    const item = await db.scopeItem.findUnique({ where: { id } });
    if (!item) throw new FlowError('Scope item not found.', 404);
    const b = await req.json();
    const data = b.active !== undefined && Object.keys(b).length === 1
      ? { active: Boolean(b.active) }
      : { ...scopeData({ ...item, ...b }), ...(b.title ? { title: String(b.title).slice(0, 200) } : {}), ...(b.active !== undefined ? { active: Boolean(b.active) } : {}) };
    const updated = await db.scopeItem.update({ where: { id }, data });
    await audit(u.id, 'UPDATE', 'ScopeItem', id, data);
    return NextResponse.json(updated);
  } catch (e) { return errorResponse(e); }
}
