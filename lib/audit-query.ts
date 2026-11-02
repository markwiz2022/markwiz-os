import type { Prisma } from '@prisma/client';
import { dayEndOfKey, dayStartOfKey } from './workcalendar';

export type AuditFilters = { user?: string; action?: string; entity?: string; from?: string; to?: string; q?: string };

const isKey = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Builds the audit-log query shared by the Audit Trail page and its CSV export. */
export function auditWhere(f: AuditFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.user) where.userId = f.user === 'system' ? null : f.user;
  if (f.action) where.action = f.action;
  if (f.entity) where.entity = f.entity;
  if (isKey(f.from) || isKey(f.to)) where.createdAt = { ...(isKey(f.from) ? { gte: dayStartOfKey(f.from!) } : {}), ...(isKey(f.to) ? { lte: dayEndOfKey(f.to!) } : {}) };
  if (f.q) where.OR = [{ entityId: { contains: f.q } }, { entity: { contains: f.q } }, { action: { contains: f.q } }];
  return where;
}

/** Turns stored metadata into a short readable line. */
export function describeMetadata(m: unknown): string {
  if (m === null || m === undefined) return '';
  if (typeof m !== 'object') return String(m);
  const o = m as Record<string, unknown>;
  if (o.before && o.after && typeof o.before === 'object' && typeof o.after === 'object') {
    const b = o.before as Record<string, unknown>; const a = o.after as Record<string, unknown>;
    const changed = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    return changed.length ? changed.map((k) => `${k}: ${show(b[k])} → ${show(a[k])}`).join(' · ') : 'No field changed';
  }
  if (o.deleted && typeof o.deleted === 'object') return `Deleted record: ${Object.entries(o.deleted as Record<string, unknown>).filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k)).map(([k, v]) => `${k}: ${show(v)}`).join(' · ')}`;
  return Object.entries(o).map(([k, v]) => `${k}: ${show(v)}`).join(' · ');
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}
