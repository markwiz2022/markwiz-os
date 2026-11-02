import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  if (!b.clientId || !b.number || !amount || amount < 0 || !b.dueDate) return NextResponse.json({ error: 'Client, number, amount and due date are required' }, { status: 400 });
  const exists = await db.invoice.findUnique({ where: { number: String(b.number).trim() } });
  if (exists) return NextResponse.json({ error: 'An invoice with this number already exists' }, { status: 409 });
  const i = await db.invoice.create({ data: { clientId: b.clientId, number: String(b.number).trim(), amount, paid: Number(b.paid || 0), dueDate: new Date(b.dueDate), status: b.status || 'SENT', note: b.note || null } });
  await audit(u.id, 'CREATE', 'Invoice', i.id, { number: i.number, amount });
  return NextResponse.json(i);
}

/**
 * Two uses:
 * - record a payment: { id, paid }
 * - correct an invoice: { id, number?, amount?, dueDate?, note?, clientId? }
 * Status is always recalculated from amount, paid and due date.
 */
export async function PATCH(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json().catch(() => ({}));
  const i = await db.invoice.findUnique({ where: { id: String(b.id || '') } });
  if (!i) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const number = b.number !== undefined ? String(b.number).trim() : i.number;
  const amount = b.amount !== undefined ? Number(b.amount) : i.amount;
  const paid = b.paid !== undefined ? Number(b.paid) : i.paid;
  const dueDate = b.dueDate ? new Date(b.dueDate) : i.dueDate;
  if (!number) return NextResponse.json({ error: 'Invoice number is required' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Amount must be more than zero' }, { status: 400 });
  if (!Number.isFinite(paid) || paid < 0) return NextResponse.json({ error: 'Paid amount cannot be negative' }, { status: 400 });
  if (Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: 'Due date is not valid' }, { status: 400 });
  if (number !== i.number && await db.invoice.findUnique({ where: { number } })) return NextResponse.json({ error: 'An invoice with this number already exists' }, { status: 409 });

  const status = paid >= amount ? 'PAID' : paid > 0 ? 'PARTIAL' : dueDate < new Date() ? 'OVERDUE' : (i.status === 'DRAFT' ? 'DRAFT' : 'SENT');
  const data = { number, amount, paid, dueDate, status, note: b.note !== undefined ? (b.note || null) : i.note, ...(b.clientId ? { clientId: String(b.clientId) } : {}) } as const;
  const out = await db.invoice.update({ where: { id: i.id }, data });
  await audit(u.id, 'UPDATE', 'Invoice', i.id, { before: { number: i.number, amount: i.amount, paid: i.paid, dueDate: i.dueDate, clientId: i.clientId }, after: { number, amount, paid, dueDate, status, clientId: out.clientId } });
  return NextResponse.json(out);
}

/** Deletes a mistaken invoice. The full record is kept in the audit trail. MD only. */
export async function DELETE(req: Request) {
  const g = await guard('finance'); if (g.error) return g.error;
  const u = g.user!;
  if (u.role !== 'MD') return NextResponse.json({ error: 'Only the MD can delete invoices' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id') || '';
  const i = await db.invoice.findUnique({ where: { id } });
  if (!i) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  await db.invoice.delete({ where: { id } });
  await audit(u.id, 'DELETE', 'Invoice', id, { deleted: i });
  return NextResponse.json({ ok: true });
}
