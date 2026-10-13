import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { audit } from '@/lib/audit';
import { METRICS } from '@/lib/kpi';
import { FlowError } from '@/lib/task-flow';

// MD only: set targets, switch KPIs on or off, and enter the monthly figures the app can't see.
export async function POST(req: Request) {
  const g = await guard('*'); if (g.error) return g.error;
  const u = g.user!;
  try {
    if (u.role !== 'MD') throw new FlowError('Only the MD can change targets.', 403);
    const b = await req.json();
    const userId = String(b.userId || '');
    const metric = String(b.metric || '');
    if (!METRICS[metric]) throw new FlowError('Unknown KPI.', 400);
    if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new FlowError('Person not found.', 404);
    if (b.action === 'manual') {
      if (!METRICS[metric].manual) throw new FlowError('This KPI is calculated by the app.', 400);
      const monthKey = String(b.monthKey || '');
      if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new FlowError('Invalid month.', 400);
      const value = Number(b.value);
      if (!Number.isFinite(value) || value < 0) throw new FlowError('Enter a number.', 400);
      const row = await db.manualKpiValue.upsert({ where: { userId_metric_monthKey: { userId, metric, monthKey } }, update: { value, note: b.note ? String(b.note).slice(0, 300) : null, enteredById: u.id }, create: { userId, metric, monthKey, value, note: b.note ? String(b.note).slice(0, 300) : null, enteredById: u.id } });
      await audit(u.id, 'KPI_MANUAL', 'ManualKpiValue', row.id, { userId, metric, monthKey, value });
      return NextResponse.json(row);
    }
    const target = b.target === '' || b.target === null || b.target === undefined ? null : Number(b.target);
    if (target !== null && (!Number.isFinite(target) || target < 0)) throw new FlowError('Target must be a number.', 400);
    const existing = await db.kpiTarget.findUnique({ where: { userId_metric: { userId, metric } } });
    const count = await db.kpiTarget.count({ where: { userId } });
    const row = existing
      ? await db.kpiTarget.update({ where: { id: existing.id }, data: { target, active: b.active === undefined ? existing.active : Boolean(b.active), ...(b.clearRamp ? { ramp: undefined } : {}) } })
      : await db.kpiTarget.create({ data: { userId, metric, target, active: b.active === undefined ? true : Boolean(b.active), sort: count } });
    await audit(u.id, 'KPI_TARGET', 'KpiTarget', row.id, { userId, metric, target, active: row.active });
    return NextResponse.json(row);
  } catch (e) { return errorResponse(e); }
}
