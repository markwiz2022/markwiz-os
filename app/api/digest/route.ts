import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { sendDailyDigest } from '@/lib/digest';

export async function POST() {
  const g = await guard('*'); if (g.error) return g.error;
  if (g.user!.role !== 'MD') return NextResponse.json({ error: 'Only the MD can send the digest.' }, { status: 403 });
  return NextResponse.json(await sendDailyDigest(db, new Date(), { force: true }));
}
