import type { Db } from './db';
import { istDateKey } from './workcalendar';

// A seat is the job a person does. KPI targets and onboarding plans hang off the seat,
// the role only controls what a person can open in the app.
export const SEATS: Record<string, { label: string; lane: 'LEAD' | 'DELIVERY' | 'GROWTH' }> = {
  MD: { label: 'Managing Director', lane: 'LEAD' },
  DMM: { label: 'Digital Marketing Manager', lane: 'DELIVERY' },
  BD: { label: 'Business Development', lane: 'GROWTH' },
  UAE_SALES: { label: 'UAE Sales', lane: 'GROWTH' },
  DESIGNER: { label: 'Graphic Designer', lane: 'DELIVERY' },
  MOTION: { label: 'Motion Graphics & Brand Designer', lane: 'DELIVERY' },
  WEB_OS: { label: 'Web Developer + Markwiz OS', lane: 'DELIVERY' },
  WEB: { label: 'Web Developer', lane: 'DELIVERY' },
};

export const ROLES = ['MD', 'DMM', 'SALES', 'DESIGNER', 'DEVELOPER', 'SEO', 'PERFORMANCE', 'HR', 'FINANCE', 'MEMBER'] as const;

export function seatLabel(seat?: string | null) {
  return seat && SEATS[seat] ? SEATS[seat].label : 'No seat set';
}

const DELIVERY_ROLES = ['DMM', 'DESIGNER', 'DEVELOPER', 'SEO', 'PERFORMANCE'];

export function isDeliveryLane(person: { seat?: string | null; role: string }) {
  if (person.seat && SEATS[person.seat]) return SEATS[person.seat].lane === 'DELIVERY';
  return DELIVERY_ROLES.includes(person.role);
}

/** MD sees everyone, the DMM sees the delivery lane, everyone else sees only themselves. */
export function canSeeScorecard(viewer: { id: string; role: string }, subject: { id: string; role: string; seat?: string | null }) {
  if (viewer.role === 'MD') return true;
  if (viewer.id === subject.id) return true;
  if (viewer.role === 'DMM') return subject.role !== 'MD' && isDeliveryLane(subject);
  return false;
}

export async function activeDmms(db: Db) {
  return db.user.findMany({ where: { active: true, role: 'DMM' }, select: { id: true, name: true, email: true }, orderBy: { createdAt: 'asc' } });
}

export async function mdUsers(db: Db) {
  return db.user.findMany({ where: { active: true, role: 'MD' }, select: { id: true, name: true, email: true }, orderBy: { createdAt: 'asc' } });
}

/** People who run delivery checks: every active DMM, or the MD when there is no DMM yet. */
export async function deliveryLeads(db: Db) {
  const dmms = await activeDmms(db);
  return dmms.length ? dmms : mdUsers(db);
}

/** Creates in-app notifications, skipping any identical unread one the person already has. */
export async function notify(db: Db, userIds: (string | null | undefined)[], title: string, body: string) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  for (const userId of ids) {
    const existing = await db.notification.findFirst({ where: { userId, title, body, read: false }, select: { id: true } });
    if (!existing) await db.notification.create({ data: { userId, title, body } });
  }
}

/** Day number of someone's tenure, counting the joining date as day 1. */
export function tenureDay(joiningDate: Date | null | undefined, now = new Date()) {
  if (!joiningDate) return null;
  const start = new Date(`${istDateKey(joiningDate)}T00:00:00Z`).getTime();
  const today = new Date(`${istDateKey(now)}T00:00:00Z`).getTime();
  return Math.round((today - start) / 86400000) + 1;
}
