import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runDueJobs } from '@/lib/scheduler';

// For hosting without a long-running server: call every 5-10 minutes with
//   Authorization: Bearer <CRON_SECRET>
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: 'Not configured' }, { status: 404 });
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  return NextResponse.json({ ran: await runDueJobs(db) });
}
export const GET = handle;
export const POST = handle;
