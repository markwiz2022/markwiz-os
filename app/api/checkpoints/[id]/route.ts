import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/team';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('*'); if (g.error) return g.error;
  if (g.user!.role !== 'MD') return NextResponse.json({ error: 'Only the MD can confirm checkpoints.' }, { status: 403 });
  const { id } = await params;
  const b = await req.json();
  const result = b.result === 'PASS' ? 'PASS' : 'MISS';
  const cp = await db.onboardingCheckpoint.findUnique({ where: { id } });
  if (!cp) return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
  if (cp.result === 'PENDING') return NextResponse.json({ error: 'This checkpoint hasn’t been measured yet.' }, { status: 409 });
  const updated = await db.onboardingCheckpoint.update({ where: { id }, data: { result, confirmedById: g.user!.id } });
  await notify(db, [cp.userId], `Day ${cp.day} checkpoint ${result === 'PASS' ? 'passed' : 'missed'}`, cp.passLine);
  await audit(g.user!.id, 'CHECKPOINT_' + result, 'OnboardingCheckpoint', id);
  return NextResponse.json(updated);
}
