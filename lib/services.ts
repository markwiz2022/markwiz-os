// Client work billed outside the monthly retainer: one-time jobs and periodic charges.
// Pure functions only (no database), so pages, components and tests share the same rules.

export const SERVICE_CATEGORIES = [
  'Website build', 'Website maintenance (AMC)', 'Hosting', 'Domain', 'Email / Google Workspace',
  'Branding', 'Offline / BTL', 'Video production', 'Photo shoot', 'Social media', 'SEO', 'Ads management', 'Consulting', 'Other',
] as const;

export const BILLINGS = ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type Billing = (typeof BILLINGS)[number];
export const BILLING_LABEL: Record<Billing, string> = { ONE_TIME: 'One-time', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly' };
export const BILLING_STEP: Record<Billing, number> = { ONE_TIME: 0, MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

export const SERVICE_STATUSES = ['QUOTED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = { QUOTED: 'Quoted', ACTIVE: 'Active', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

/** Suggested billing when a category is picked (can be changed). */
export const DEFAULT_BILLING: Record<string, Billing> = {
  'Website maintenance (AMC)': 'YEARLY', Hosting: 'YEARLY', Domain: 'YEARLY', 'Email / Google Workspace': 'YEARLY',
  'Social media': 'MONTHLY', SEO: 'MONTHLY', 'Ads management': 'MONTHLY',
};

export const isBilling = (b: unknown): b is Billing => BILLINGS.includes(b as Billing);
export const isServiceStatus = (s: unknown): s is ServiceStatus => SERVICE_STATUSES.includes(s as ServiceStatus);

export type ServiceLike = { billing: string; amount: number; startDate: Date | string; endDate?: Date | string | null; status: string };

/** "YYYY-MM-DD" for a stored date. Dates are saved as midnight UTC of the chosen day. */
export function dayKey(d: Date | string) { return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10); }
const monthIndex = (monthKey: string) => { const [y, m] = monthKey.split('-').map(Number); return y * 12 + (m - 1); };
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const lastDay = (monthKey: string) => { const [y, m] = monthKey.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** Counts as revenue only when it is agreed (Active) or done (Completed). */
export const countsAsRevenue = (s: { status: string }) => s.status === 'ACTIVE' || s.status === 'COMPLETED';

/** Amount billed in a calendar month ("YYYY-MM"). One-time: only its start month. Periodic: every step from the start, up to the end date. */
export function serviceAmountInMonth(s: ServiceLike, monthKey: string) {
  if (!countsAsRevenue(s) || !isBilling(s.billing)) return 0;
  const start = monthIndex(dayKey(s.startDate).slice(0, 7));
  const m = monthIndex(monthKey);
  if (m < start) return 0;
  if (s.endDate && m > monthIndex(dayKey(s.endDate).slice(0, 7))) return 0;
  if (s.billing === 'ONE_TIME') return m === start ? s.amount : 0;
  return (m - start) % BILLING_STEP[s.billing] === 0 ? s.amount : 0;
}

/** Next billing / renewal date on or after `fromKey` ("YYYY-MM-DD"), or null if none is left. */
export function nextDueKey(s: ServiceLike, fromKey: string): string | null {
  if (!countsAsRevenue(s) || !isBilling(s.billing)) return null;
  const startKey = dayKey(s.startDate);
  const endKey = s.endDate ? dayKey(s.endDate) : null;
  if (s.billing === 'ONE_TIME') return startKey >= fromKey && (!endKey || startKey <= endKey) ? startKey : null;
  const step = BILLING_STEP[s.billing];
  const day = Number(startKey.slice(8, 10));
  let i = monthIndex(startKey.slice(0, 7));
  for (let n = 0; n < 1200; n++, i += step) {
    const mk = fromIndex(i);
    const key = `${mk}-${String(Math.min(day, lastDay(mk))).padStart(2, '0')}`;
    if (endKey && key > endKey) return null;
    if (key >= fromKey) return key;
  }
  return null;
}

/** Monthly equivalent, for "what is this client worth per month" (yearly ÷ 12, quarterly ÷ 3; one-time is 0). */
export function monthlyEquivalent(s: ServiceLike) {
  if (!countsAsRevenue(s) || !isBilling(s.billing) || s.billing === 'ONE_TIME') return 0;
  return s.amount / BILLING_STEP[s.billing];
}

/** Total client revenue for a month: the retainer (if the client is active) plus services billed that month. */
export function clientRevenueInMonth(client: { retainer: number; active: boolean }, services: ServiceLike[], monthKey: string) {
  return (client.active ? client.retainer : 0) + services.reduce((sum, s) => sum + serviceAmountInMonth(s, monthKey), 0);
}
