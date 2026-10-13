import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import { createOnboardingPlan } from '@/lib/onboarding';
import { applySeatTemplate } from '@/lib/seats';
import { FlowError } from '@/lib/task-flow';
import { ROLES, SEATS } from '@/lib/team';

// MD only: add a team member with their seat. KPIs and the 90-day plan load automatically.
export async function POST(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  try {
    if (u.role !== 'MD') throw new FlowError('Only the MD can add team members.', 403);
    const b = await req.json();
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const role = String(b.role || 'MEMBER');
    const seat = b.seat ? String(b.seat) : null;
    if (!name) throw new FlowError('Enter a name.', 400);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new FlowError('Enter a valid work email.', 400);
    if (!(ROLES as readonly string[]).includes(role)) throw new FlowError('Choose a role.', 400);
    if (seat && !SEATS[seat]) throw new FlowError('Choose a seat.', 400);
    if (password.length < 10 || !/[0-9]/.test(password) || !/[a-zA-Z]/.test(password)) throw new FlowError('Temporary password: at least 10 characters with letters and numbers.', 400);
    if (await db.user.findUnique({ where: { email } })) throw new FlowError('Someone already uses that email.', 409);
    const joiningDate = b.joiningDate ? new Date(String(b.joiningDate)) : new Date();
    if (isNaN(joiningDate.getTime())) throw new FlowError('Invalid joining date.', 400);
    const person = await db.user.create({ data: { name, email, role: role as never, seat, joiningDate, passwordHash: await hashPassword(password) }, select: { id: true, name: true } });
    let kpis = 0; let plan = 0;
    if (seat && b.applyKpis !== false) kpis = await applySeatTemplate(db, person.id, seat);
    if (b.loadOnboarding !== false) plan = (await createOnboardingPlan(db, person.id, u.id)).created;
    await audit(u.id, 'CREATE', 'User', person.id, { name, email, role, seat });
    return NextResponse.json({ ...person, kpis, plan });
  } catch (e) { return errorResponse(e); }
}
