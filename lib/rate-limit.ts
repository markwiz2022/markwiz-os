import { db } from './db';

/**
 * Sign-in throttling, stored in the database so it works on one server or many.
 * - 5 failed attempts for one email in 15 minutes locks that email for 15 minutes.
 * - 20 failed attempts from one network address in 15 minutes locks that address.
 * A successful sign-in clears the failures for that email.
 */
export const WINDOW_MINUTES = 15;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

export function clientIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || 'local').trim().slice(0, 64);
}

export async function loginBlocked(email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { key: `email:${email}`, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { key: `ip:${ip}`, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_PER_EMAIL || byIp >= MAX_PER_IP;
}

export async function recordLogin(email: string, ip: string, success: boolean) {
  if (success) {
    await db.loginAttempt.deleteMany({ where: { key: `email:${email}`, success: false } });
  } else {
    await db.loginAttempt.createMany({ data: [{ key: `email:${email}` }, { key: `ip:${ip}` }] });
  }
  // Housekeeping: keep the table small.
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}
