import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  if (!b.category || !amount || amount < 0) return NextResponse.json({ error: 'Category and amount are required' }, { status: 400 });
  const e = await db.expense.create({ data: { clientId: b.clientId || null, category: String(b.category).trim(), amount, date: b.date ? new Date(b.date) : new Date(), note: b.note || null } });
  await audit(u.id, 'CREATE', 'Expense', e.id, { category: e.category, amount });
  return NextResponse.json(e);
}

/** Corrects an expense: { id, category?, amount?, date?, note?, clientId? } (clientId "" = company expense). */
export async function PATCH(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json().catch(() => ({}));
  const e = await db.expense.findUnique({ where: { id: String(b.id || '') } });
  if (!e) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  const category = b.category !== undefined ? String(b.category).trim() : e.category;
  const amount = b.amount !== undefined ? Number(b.amount) : e.amount;
  const date = b.date ? new Date(b.date) : e.date;
  if (!category) return NextResponse.json({ error: 'Category is required' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Amount must be more than zero' }, { status: 400 });
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Date is not valid' }, { status: 400 });
  const clientId = b.clientId === undefined ? e.clientId : (b.clientId || null);
  const out = await db.expense.update({ where: { id: e.id }, data: { category, amount, date, clientId, note: b.note !== undefined ? (b.note || null) : e.note } });
  await audit(u.id, 'UPDATE', 'Expense', e.id, { before: { category: e.category, amount: e.amount, date: e.date, clientId: e.clientId }, after: { category, amount, date, clientId } });
  return NextResponse.json(out);
}

/** Deletes a mistaken expense. The full record is kept in the audit trail. MD only. */
export async function DELETE(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only the MD can delete expenses' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id') || '';
  const e = await db.expense.findUnique({ where: { id } });
  if (!e) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
  await db.expense.delete({ where: { id } });
  await audit(u.id, 'DELETE', 'Expense', id, { deleted: e });
  return NextResponse.json({ ok: true });
}
