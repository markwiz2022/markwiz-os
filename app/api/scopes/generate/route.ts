import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard, isLead } from '@/lib/api';
import { generateScopeTasks } from '@/lib/scope';

export async function POST() {
  const g = await guard('clients'); if (g.error) return g.error;
  if (!isLead(g.user!.role)) return NextResponse.json({ error: 'Only the MD or DMM can do this.' }, { status: 403 });
  return NextResponse.json(await generateScopeTasks(db, new Date()));
}
