import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token) {
      return NextResponse.json({ error: 'Reset token is required.' }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    const resetRecord = await db.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetRecord) {
      return NextResponse.json({ error: 'Invalid or expired password reset link. Please request a new one.' }, { status: 400 });
    }

    if (new Date() > resetRecord.expiresAt) {
      await db.passwordResetToken.delete({ where: { token } }).catch(() => {});
      return NextResponse.json({ error: 'This password reset link has expired. Please request a new one.' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: resetRecord.email },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    const passwordHash = await hashPassword(password);

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Delete token so it cannot be used again
    await db.passwordResetToken.delete({
      where: { token },
    });

    await audit(user.id, 'PASSWORD_RESET_COMPLETED', 'User', user.id);

    return NextResponse.json({
      ok: true,
      message: 'Your password has been reset successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return NextResponse.json({ error: 'Failed to reset password. Please try again later.' }, { status: 500 });
  }
}
