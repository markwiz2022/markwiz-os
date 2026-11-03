import { isBilling, isServiceStatus, SERVICE_CATEGORIES } from './services';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses and checks a service body. Returns the data to save or an error message. */
export function serviceData(b: Record<string, unknown>, partial = false): { data?: Record<string, unknown>; error?: string } {
  const d: Record<string, unknown> = {};
  if (!partial || b.name !== undefined) { const n = String(b.name ?? '').trim(); if (!n) return { error: 'Name the work, e.g. Website build or Hosting 2026–27.' }; d.name = n.slice(0, 200); }
  if (!partial || b.amount !== undefined) { const a = Number(b.amount); if (!Number.isFinite(a) || a <= 0) return { error: 'Enter the amount (more than zero).' }; d.amount = a; }
  if (!partial || b.billing !== undefined) { if (!isBilling(b.billing)) return { error: 'Choose how it is billed.' }; d.billing = b.billing; }
  if (!partial || b.startDate !== undefined) { if (!DATE.test(String(b.startDate ?? ''))) return { error: 'Choose the billing / start date.' }; d.startDate = new Date(`${b.startDate}T00:00:00Z`); }
  if (b.endDate !== undefined) { if (b.endDate && !DATE.test(String(b.endDate))) return { error: 'Invalid end date.' }; d.endDate = b.endDate ? new Date(`${b.endDate}T00:00:00Z`) : null; }
  if (b.category !== undefined) d.category = (SERVICE_CATEGORIES as readonly string[]).includes(String(b.category)) ? String(b.category) : 'Other';
  if (b.status !== undefined) { if (!isServiceStatus(b.status)) return { error: 'Unknown status.' }; d.status = b.status; }
  if (b.notes !== undefined) d.notes = b.notes ? String(b.notes).slice(0, 1000) : null;
  if (d.startDate && d.endDate && (d.endDate as Date) < (d.startDate as Date)) return { error: 'The end date is before the start date.' };
  return { data: d };
}
