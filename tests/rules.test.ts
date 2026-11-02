// Automated checks for the business rules. Run with: npm test
// These need no database. Add a test here whenever a rule changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLate, isWorkingDay, monthBoundsIST, monthKeyIST, monthKeyOffset } from '../lib/workcalendar';
import { canRelease, canView, isOverdue } from '../lib/task-flow';
import { parseMonthKey, toCsv } from '../lib/csv';
import { auditWhere, describeMetadata } from '../lib/audit-query';
import { LEAD_SOURCES, LEAD_STAGES, LOST_REASONS } from '../lib/crm';

const ist = (s: string) => new Date(`${s}+05:30`);

test('working calendar: Sundays and 2nd/4th Saturdays are off', () => {
  assert.equal(isWorkingDay(ist('2026-11-01T12:00:00')), false, 'Sunday');
  assert.equal(isWorkingDay(ist('2026-11-02T12:00:00')), true, 'Monday');
  assert.equal(isWorkingDay(ist('2026-11-07T12:00:00')), true, '1st Saturday works');
  assert.equal(isWorkingDay(ist('2026-11-14T12:00:00')), false, '2nd Saturday off');
  assert.equal(isWorkingDay(ist('2026-11-21T12:00:00')), true, '3rd Saturday works');
  assert.equal(isWorkingDay(ist('2026-11-28T12:00:00')), false, '4th Saturday off');
});

test('check-in: 9:15 is on time, 9:16 is late (IST)', () => {
  assert.equal(isLate(ist('2026-11-02T09:00:00')), false);
  assert.equal(isLate(ist('2026-11-02T09:15:00')), false);
  assert.equal(isLate(ist('2026-11-02T09:16:00')), true);
});

test('months are calculated in IST', () => {
  assert.equal(monthKeyIST(new Date('2026-10-31T19:00:00Z')), '2026-11', '00:30 IST on 1 Nov is November');
  assert.equal(monthKeyOffset('2026-01', -1), '2025-12');
  const { start, end } = monthBoundsIST('2026-02');
  assert.equal(start.toISOString(), '2026-01-31T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-02-28T18:29:59.999Z');
});

const task = (over: Record<string, unknown> = {}) => ({ id: 't1', status: 'OPEN', ownerId: 'maker', assignerId: 'boss', approvalLevel: 'L1', clientFacing: true, needsCopy: false, needsProof: true, approvedCopy: null, due: new Date('2026-11-05T00:00:00Z'), category: 'DESIGN', checklist: null, deliverableUrl: null, ...over }) as Parameters<typeof canView>[0];
const person = (id: string, role = 'DESIGNER') => ({ id, name: id, role });

test('task visibility: staff only see their own, assigned, proof and releasable work', () => {
  assert.equal(canView(task(), person('maker')), true, 'maker');
  assert.equal(canView(task(), person('boss')), true, 'assigner');
  assert.equal(canView(task(), person('someone-else')), false, 'unrelated staff');
  assert.equal(canView(task({ status: 'REVIEW' }), person('someone-else')), true, 'anyone can proof check');
  assert.equal(canView(task(), person('md', 'MD')), true, 'MD sees all');
  assert.equal(canView(task(), person('dmm', 'DMM')), true, 'DMM sees all');
});

test('release rules: L1 needs a DMM who is not the maker, L2 needs the MD', () => {
  assert.equal(canRelease(task({ approvalLevel: 'L1' }), person('maker')), false);
  assert.equal(canRelease(task({ approvalLevel: 'L1' }), person('dmm', 'DMM')), true);
  assert.equal(canRelease(task({ approvalLevel: 'L1', ownerId: 'dmm' }), person('dmm', 'DMM')), false);
  assert.equal(canRelease(task({ approvalLevel: 'L2' }), person('dmm', 'DMM')), false);
  assert.equal(canRelease(task({ approvalLevel: 'L2' }), person('md', 'MD')), true);
});

test('overdue: delivered work is never overdue', () => {
  const now = new Date('2026-11-10T06:00:00Z');
  assert.equal(isOverdue(task({ status: 'OPEN' }), now), true);
  assert.equal(isOverdue(task({ status: 'CLIENT' }), now), false);
  assert.equal(isOverdue(task({ status: 'DONE' }), now), false);
});

test('CSV export: quotes commas and blocks spreadsheet formulas', () => {
  const out = toCsv(['A', 'B'], [['Hello, world', '=SUM(A1)'], [12.5, null]]);
  assert.equal(out, 'A,B\r\n"Hello, world",\'=SUM(A1)\r\n12.5,\r\n');
  assert.equal(parseMonthKey('2026-11'), '2026-11');
  assert.equal(parseMonthKey('2026-13'), null);
  assert.equal(parseMonthKey('nope'), null);
});

test('audit trail: filters and readable change summaries', () => {
  assert.deepEqual(auditWhere({ user: 'system' }), { userId: null });
  assert.equal(describeMetadata({ before: { amount: 100, number: 'INV-1' }, after: { amount: 150, number: 'INV-1' } }), 'amount: 100 → 150');
  assert.match(describeMetadata({ deleted: { id: 'x', number: 'INV-9', amount: 500 } }), /^Deleted record: number: INV-9 · amount: 500$/);
});

test('CRM lists are complete', () => {
  assert.ok(LEAD_STAGES.includes('LOST') && LEAD_STAGES.includes('WON'));
  assert.ok(LEAD_SOURCES.length >= 5);
  assert.ok(LOST_REASONS.includes('Other'));
});

import { computeProfitability } from '../lib/profitability';

test('profitability: time is costed at salary ÷ (8h × working days)', () => {
  const p = computeProfitability({
    clients: [{ id: 'a', name: 'Alpha', retainer: 100000, internal: false }, { id: 'b', name: 'Beta', retainer: 10000, internal: false }, { id: 'm', name: 'Markwiz', retainer: 0, internal: true }],
    people: [{ id: 'u1', name: 'Asha', monthlySalary: 88000 }],
    entries: [{ userId: 'u1', clientId: 'a', seconds: 10 * 3600 }, { userId: 'u1', clientId: 'b', seconds: 30 * 3600 }, { userId: 'u1', clientId: 'm', seconds: 4 * 3600 }],
    expenses: [{ clientId: 'a', amount: 2000 }, { clientId: null, amount: 9999 }],
    workingDays: 22, workingDaysSoFar: 11,
  });
  const alpha = p.clients.find((c) => c.id === 'a')!;
  assert.equal(alpha.labour, 5000, '10h at ₹500/h');
  assert.equal(alpha.profit, 93000);
  assert.equal(Math.round(alpha.margin!), 93);
  const beta = p.clients.find((c) => c.id === 'b')!;
  assert.equal(beta.profit, -5000, 'losing client');
  assert.equal(p.clients[0].id, 'b', 'lowest margin listed first');
  assert.equal(p.internal[0].labour, 2000, 'internal time is tracked separately');
  assert.equal(p.coverage[0].logged, 44);
  assert.equal(p.coverage[0].expected, 88);
  assert.equal(p.totals.unallocated, 88000 - 22000);
});

import { categoryForFormat, designDueKey, effectiveStatus } from '../lib/content';

test('content calendar: the linked task drives status until posted', () => {
  assert.equal(effectiveStatus({ status: 'PLANNED' }, null), 'PLANNED');
  assert.equal(effectiveStatus({ status: 'PLANNED' }, 'IN_PROGRESS'), 'IN_DESIGN');
  assert.equal(effectiveStatus({ status: 'IN_DESIGN' }, 'REVIEW'), 'IN_REVIEW');
  assert.equal(effectiveStatus({ status: 'IN_DESIGN' }, 'CLIENT'), 'APPROVED');
  assert.equal(effectiveStatus({ status: 'POSTED' }, 'OPEN'), 'POSTED', 'posted wins');
  assert.equal(categoryForFormat('Reel'), 'VIDEO');
  assert.equal(categoryForFormat('Carousel'), 'SOCIAL');
  assert.equal(designDueKey('2026-12-01'), '2026-11-29');
});

import { renderClientReportHtml, weekLabel } from '../lib/client-report';

test('client report: escapes text and only links http(s) addresses', () => {
  const html = renderClientReportHtml({
    client: { id: 'c', name: 'Vistara <Interiors>', email: null, internal: false }, weekKey: '2026-11-02', label: weekLabel('2026-11-02'),
    delivered: [{ title: '<script>alert(1)</script> Reel', date: '2026-11-03', link: 'javascript:alert(1)' }, { title: 'Carousel', date: '2026-11-04', link: 'https://instagram.com/p/x' }],
    waiting: [], inProgress: [], nextWeek: [], posts: [], nextPosts: [], sent: [],
  }, { note: 'Hi <b>team</b>' });
  assert.ok(!html.includes('<script>'), 'no raw script tag');
  assert.ok(html.includes('Vistara &lt;Interiors&gt;'));
  assert.ok(!html.includes('javascript:'), 'unsafe link dropped');
  assert.ok(html.includes('href="https://instagram.com/p/x"'));
  assert.ok(html.includes('Hi &lt;b&gt;team&lt;/b&gt;'));
  assert.equal(weekLabel('2026-11-02'), '2 Nov – 8 Nov 2026');
});
