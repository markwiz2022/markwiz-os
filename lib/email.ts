import nodemailer from 'nodemailer';

export function emailConfigured() {
  return !!process.env.SMTP_HOST;
}

export function transport() {
  if (process.env.SMTP_HOST === 'test') {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
}: {
  to: string;
  name?: string;
  resetUrl: string;
}) {
  if (!emailConfigured()) {
    console.warn(`[SMTP NOT CONFIGURED] Password reset link for ${to}: ${resetUrl}`);
    return { ok: false, error: 'SMTP is not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS.' };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@markwiz.com';
  const greeting = name ? `Hello ${name},` : 'Hello,';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 30px; }
    .card { max-width: 480px; margin: 0 auto; background: #131928; border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .header { font-size: 14px; font-weight: 800; color: #8b7cff; margin-bottom: 20px; letter-spacing: 2px; }
    h2 { font-size: 22px; margin: 0 0 12px; color: #ffffff; }
    p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 20px; }
    .btn { display: inline-block; background: linear-gradient(135deg,#7c6ff2,#5b50c9); color: #ffffff !important; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px; margin-bottom: 20px; box-shadow: 0 6px 20px rgba(93,82,202,0.3); }
    .footer { font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">MARKWIZ OS</div>
    <h2>Reset your password</h2>
    <p>${greeting}</p>
    <p>A request was made to reset your Markwiz account password. Click the button below to set a new password. This link is valid for 1 hour.</p>
    <a href="${resetUrl}" class="btn">Reset Password</a>
    <p style="font-size: 12px; color: #64748b; word-break: break-all;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${resetUrl}" style="color: #a59bff;">${resetUrl}</a></p>
    <div class="footer">If you did not request this email, you can safely ignore it. Your account password remains unchanged.</div>
  </div>
</body>
</html>`;

  const text = `${greeting}\n\nA request was made to reset your Markwiz account password.\nReset your password here (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`;

  const info = await transport().sendMail({
    from,
    to,
    subject: 'Reset your Markwiz OS password',
    text,
    html,
  });

  return { ok: true, messageId: info.messageId };
}
