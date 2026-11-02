import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { CLIENT_CREATORS_KEY, getClientCreatorIds, setClientCreatorIds } from '@/lib/settings';

/** MD-only app settings. PATCH { clientCreators: string[] } */
export async function PATCH(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only the MD can change settings' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (Array.isArray(b.clientCreators)) {
    const ids = b.clientCreators.map(String);
    const valid = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
    const before = await getClientCreatorIds();
    await setClientCreatorIds(valid.map((x) => x.id));
    await audit(u.id, 'UPDATE', 'Setting', CLIENT_CREATORS_KEY, { before, after: valid.map((x) => x.id) });
  }
  return NextResponse.json({ ok: true });
}
