import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { apolloConfigured, apolloStatus, setApolloOwner, syncApollo } from '@/lib/apollo';
import { audit } from '@/lib/audit';

export async function GET() {
  const g = await guard('crm'); if (g.error) return g.error;
  return NextResponse.json(await apolloStatus(db));
}

/** { action: 'sync' } pulls new Apollo contacts now. { action: 'owner', ownerId } (MD only) picks who gets them. */
export async function POST(req: Request) {
  const g = await guard('crm'); if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json().catch(() => ({}));
  if (b.action === 'owner') {
    if (u.role !== 'MD') return NextResponse.json({ error: 'Only the MD can change who gets Apollo leads' }, { status: 403 });
    const ownerId = typeof b.ownerId === 'string' && b.ownerId ? b.ownerId : null;
    if (ownerId && !(await db.user.findFirst({ where: { id: ownerId, active: true }, select: { id: true } }))) return NextResponse.json({ error: 'Person not found' }, { status: 400 });
    await setApolloOwner(db, ownerId);
    await audit(u.id, 'UPDATE', 'AppSetting', 'apollo.ownerId', { ownerId });
    return NextResponse.json({ ok: true });
  }
  if (!apolloConfigured()) return NextResponse.json({ error: 'Apollo is not connected yet. Add APOLLO_API_KEY in Vercel and redeploy.' }, { status: 400 });
  const r = await syncApollo(db, { manual: true, actorId: u.id });
  if (!r) return NextResponse.json({ error: 'A sync is already running. Try again in a minute.' }, { status: 409 });
  if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json(r);
}
