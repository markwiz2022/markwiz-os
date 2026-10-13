import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, hashPassword, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

export async function PATCH(req: Request) {
  let me;
  try { me = await requireUser(); }
  catch { return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }); }

  const b = await req.json();
  const currentPassword = String(b.currentPassword || '');
  const newPassword = String(b.newPassword || '');
  const targetId = b.userId && me.role === 'MD' ? String(b.userId) : me.id;
  const resettingSomeoneElse = targetId !== me.id;

  if (newPassword.length < 10) return NextResponse.json({ error: 'New password must be at least 10 characters.' }, { status: 400 });
  if (!/[0-9]/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) return NextResponse.json({ error: 'Use a mix of letters and numbers.' }, { status: 400 });

  // Only the MD can reset another person's password, and only for their own account is the current password required.
  if (!resettingSomeoneElse) {
    const withHash = await db.user.findUnique({ where: { id: me.id }, omit: { passwordHash: false } });
    if (!withHash || !(await verifyPassword(currentPassword, withHash.passwordHash))) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 403 });
    }
    if (await verifyPassword(newPassword, withHash.passwordHash)) {
      return NextResponse.json({ error: 'New password must be different from the current one.' }, { status: 400 });
    }
  }

  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });

  await db.user.update({ where: { id: targetId }, data: { passwordHash: await hashPassword(newPassword) } });
  await audit(me.id, resettingSomeoneElse ? 'RESET_PASSWORD' : 'CHANGE_PASSWORD', 'User', targetId);

  if (resettingSomeoneElse) {
    await db.notification.create({ data: { userId: targetId, title: 'Password reset', body: `${me.name} reset your password. Change it from My Account after signing in.` } });
  }
  return NextResponse.json({ ok: true, name: target.name });
}
