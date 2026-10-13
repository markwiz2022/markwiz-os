import type { Db } from './db';

// Default targets per seat. The MD can change any target per person on the Scorecards screen.
// A ramp sets an easier target (or no target) for the first days of someone's tenure.

export type SeatKpi = { metric: string; target: number | null; ramp?: { untilDay: number; target: number | null }[] };

const NOT_SCORED_FIRST_30 = [{ untilDay: 30, target: null }];

export const SEAT_KPIS: Record<string, SeatKpi[]> = {
  MD: [
    { metric: 'company_closes', target: 2 },
    { metric: 'collections', target: 90 },
    { metric: 'md_waiting', target: null },
  ],
  DMM: [
    { metric: 'client_on_time', target: 95, ramp: [{ untilDay: 30, target: 85 }, { untilDay: 60, target: 90 }] },
    { metric: 'errors_all', target: 0 },
    { metric: 'red_clients', target: 0 },
    { metric: 'reports_on_time', target: 100 },
    { metric: 'ad_accounts', target: 80 },
    { metric: 'say_do', target: 85 },
  ],
  BD: [
    { metric: 'touches', target: 40 },
    { metric: 'meetings', target: 4 },
    { metric: 'proposals', target: 8 },
    { metric: 'closes', target: 2 },
    { metric: 'say_do', target: 85 },
  ],
  UAE_SALES: [
    { metric: 'meetings_month', target: 4 },
    { metric: 'proposals', target: 2 },
    { metric: 'closes_quarter', target: 1 },
    { metric: 'say_do', target: 85 },
  ],
  DESIGNER: [
    { metric: 'on_time_handin', target: 95 },
    { metric: 'first_review', target: 70 },
    { metric: 'revision_rounds', target: 2 },
    { metric: 'errors_own', target: 0 },
    { metric: 'say_do', target: 85 },
  ],
  MOTION: [
    { metric: 'on_time_handin', target: 95, ramp: NOT_SCORED_FIRST_30 },
    { metric: 'first_review', target: 70, ramp: NOT_SCORED_FIRST_30 },
    { metric: 'revision_rounds', target: 2, ramp: NOT_SCORED_FIRST_30 },
    { metric: 'errors_own', target: 0, ramp: NOT_SCORED_FIRST_30 },
    { metric: 'say_do', target: 85 },
  ],
  WEB_OS: [
    { metric: 'on_time_handin', target: 90 },
    { metric: 'qa_pass', target: 100 },
    { metric: 'bugs_after_launch', target: 2 },
    { metric: 'os_fix_speed', target: 90 },
    { metric: 'say_do', target: 85 },
  ],
  WEB: [
    { metric: 'on_time_handin', target: 90 },
    { metric: 'qa_pass', target: 100 },
    { metric: 'bugs_after_launch', target: 2 },
    { metric: 'say_do', target: 85 },
  ],
};

/** Replaces a person's KPI targets with the defaults for their seat. */
export async function applySeatTemplate(db: Db, userId: string, seat: string) {
  const template = SEAT_KPIS[seat];
  if (!template) return 0;
  await db.kpiTarget.deleteMany({ where: { userId } });
  for (const [i, k] of template.entries()) {
    await db.kpiTarget.create({ data: { userId, metric: k.metric, target: k.target, ramp: k.ramp ?? undefined, sort: i, active: true } });
  }
  return template.length;
}
