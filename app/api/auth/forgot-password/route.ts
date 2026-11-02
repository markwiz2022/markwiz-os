import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, active: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: `No Markwiz account found for "${email}". Please verify your email address.` },
        { status: 404 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { error: 'This account is inactive. Please contact Joseph / MD.' },
        { status: 403 }
      );
    }

    // Clean up any old tokens for this email
    await db.passwordResetToken.deleteMany({
      where: { email },
    });

    // Generate a cryptographically strong 32-byte token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.passwordResetToken.create({
      data: {
        email,
        token,
        expiresAt,
      },
    });

    // Determine base URL: prioritize APP_URL, then request origin
    const origin = process.env.APP_URL || new URL(req.url).origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    const emailResult = await sendPasswordResetEmail({
      to: email,
      name: user.name,
      resetUrl,
    });

    if (!emailResult.ok) {
      console.error(`[FORGOT PASSWORD ERROR] Failed to send email to ${email}:`, emailResult.error);
      return NextResponse.json(
        { error: `Failed to send email: ${emailResult.error}` },
        { status: 502 }
      );
    }

    await audit(user.id, 'FORGOT_PASSWORD_REQUESTED', 'User', user.id, { email });

    return NextResponse.json({
      ok: true,
      message: `A password reset link has been sent to ${email}. Please check your inbox (and spam folder).`,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return NextResponse.json({ error: 'Failed to process request. Please try again later.' }, { status: 500 });
  }
}
