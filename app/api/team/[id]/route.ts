import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { createOnboardingPlan } from '@/lib/onboarding';
import { applySeatTemplate } from '@/lib/seats';
import { FlowError } from '@/lib/task-flow';
import { ROLES, SEATS } from '@/lib/team';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  try {
    if (u.role !== 'MD') throw new FlowError('Only the MD can change team settings.', 403);
    const person = await db.user.findUnique({ where: { id } });
    if (!person) throw new FlowError('Person not found.', 404);
    const b = await req.json();
    if (b.action === 'apply-kpis') {
      const seat = String(b.seat || person.seat || '');
      if (!SEATS[seat]) throw new FlowError('Set a seat first.', 400);
      return NextResponse.json({ kpis: await applySeatTemplate(db, id, seat) });
    }
    if (b.action === 'load-onboarding') return NextResponse.json(await createOnboardingPlan(db, id, u.id));
    const data: Record<string, unknown> = {};
    if (b.role !== undefined) { if (!(ROLES as readonly string[]).includes(String(b.role))) throw new FlowError('Choose a role.', 400); if (id === u.id && b.role !== 'MD') throw new FlowError('You can’t remove your own MD role.', 400); data.role = b.role; }
    if (b.seat !== undefined) { if (b.seat && !SEATS[String(b.seat)]) throw new FlowError('Choose a seat.', 400); data.seat = b.seat || null; }
    if (b.joiningDate !== undefined) { const d = new Date(String(b.joiningDate)); if (isNaN(d.getTime())) throw new FlowError('Invalid date.', 400); data.joiningDate = d; }
    if (b.active !== undefined) { if (id === u.id) throw new FlowError('You can’t deactivate yourself.', 400); data.active = Boolean(b.active); }
    const updated = await db.user.update({ where: { id }, data, select: { id: true, name: true, role: true, seat: true, active: true } });
    await audit(u.id, 'UPDATE', 'User', id, data);
    return NextResponse.json(updated);
  } catch (e) { return errorResponse(e); }
}
