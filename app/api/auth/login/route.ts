import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { setSession, verifyPassword } from '@/lib/auth';
import { clientIp, loginBlocked, recordLogin, WINDOW_MINUTES } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const ip = clientIp(req);
  if (await loginBlocked(email, ip)) {
    return NextResponse.json({ error: 'locked', minutes: WINDOW_MINUTES }, { status: 429 });
  }

  const u = await db.user.findUnique({ where: { email }, omit: { passwordHash: false } });
  if (!u || !await verifyPassword(password, u.passwordHash)) {
    await recordLogin(email, ip, false);
    if (u) await audit(u.id, 'LOGIN_FAILED', 'User', u.id, { ip });
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }
  if (!u.active) return NextResponse.json({ error: 'inactive' }, { status: 403 });

  await recordLogin(email, ip, true);
  await setSession(u.id);
  const redirect = u.role === 'MD' ? '/' : '/today';
  return NextResponse.json({ ok: true, redirect });
}
