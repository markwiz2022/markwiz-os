import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard } from '@/lib/api';
import { audit } from '@/lib/audit';

import { CHECK_IN_LABEL, GRACE_LABEL, isLate, istDayBounds, monthBoundsIST, monthKeyIST } from '@/lib/workcalendar';
import { classifyClockIn, validPosition } from '@/lib/geo';
import { getOffice } from '@/lib/office';

type Where = { mode: 'OFFICE' | 'WFH'; lat?: number; lng?: number; accuracyM?: number; distanceM?: number | null };

const DEDUCTION = 0.5;

function hasOpenShiftToday(u: { checkInAt: Date | null; checkOutAt: Date | null }) {
  if (!u.checkInAt || u.checkOutAt) return false;
  return u.checkInAt >= istDayBounds(new Date()).start;
}

async function clockIn(userId: string, now: Date, status: string, note: string | undefined, where: Where) {
  await db.user.update({
    where: { id: userId },
    data: { checkInAt: now, checkOutAt: null, status },
  });
  await db.attendanceLog.create({ data: { userId, type: 'CLOCK_IN', at: now, note, workMode: where.mode, lat: where.lat, lng: where.lng, accuracyM: where.accuracyM, distanceM: where.distanceM ?? undefined } });
}

/** Where is this clock-in? Inside the office radius = OFFICE, anywhere else (or location not shared) = WFH. */
async function locate(b: { position?: unknown }) {
  const pos = validPosition(b.position);
  const office = await getOffice();
  const c = classifyClockIn(pos, office);
  const where: Where = { mode: c.mode, lat: pos?.lat, lng: pos?.lng, accuracyM: pos?.accuracy != null ? Math.round(pos.accuracy) : undefined, distanceM: c.distanceM };
  return { where, reason: c.reason, office };
}

const CLOCK_IN_ACTIONS = ['clock-in', 'regularise', 'accept-deduction'];

export async function POST(req: Request) {
  const g = await guard('people');
  if (g.error) return g.error;
  const u = g.user!;
  const b = await req.json();

  // Office check first: outside the office is work from home, which is a half day. Late rules don't apply to WFH days.
  if (CLOCK_IN_ACTIONS.includes(b.action)) {
    if (hasOpenShiftToday(u)) return NextResponse.json({ error: 'Already clocked in' }, { status: 409 });
    const { where, reason, office } = await locate(b);
    if (where.mode === 'WFH') {
      if (!b.confirmWfh) {
        return NextResponse.json({ wfhDetected: true, reason, office: office.name, message: `Work from home detected: ${reason}. A work-from-home day counts as a half day.` });
      }
      const now = new Date();
      await clockIn(u.id, now, 'Active - Work from home', `Work from home: ${reason}`, where);
      const { start, end } = monthBoundsIST(monthKeyIST(now));
      const wfhThisMonth = await db.attendanceLog.count({ where: { userId: u.id, type: 'CLOCK_IN', workMode: 'WFH', at: { gte: start, lte: end } } });
      const mds = await db.user.findMany({ where: { active: true, role: 'MD' }, select: { id: true } });
      for (const m of mds) if (m.id !== u.id) await db.notification.create({ data: { userId: m.id, title: `${u.name} is working from home`, body: `Clocked in outside the office (${reason}). Counted as a half day. Work-from-home days this month: ${wfhThisMonth}.` } });
      await audit(u.id, 'CLOCK_IN', 'Attendance', u.id, { workMode: 'WFH', distanceM: where.distanceM });
      return NextResponse.json({ ok: true, wfh: true });
    }
    (b as { where?: Where }).where = where;
  }
  const atOffice: Where = (b as { where?: Where }).where ?? { mode: 'OFFICE' };

  if (b.action === 'clock-in') {
    const now = new Date();
    if (isLate(now)) {
      return NextResponse.json({
        late: true,
        checkInAt: now.toISOString(),
        message: `Check-in time is ${CHECK_IN_LABEL} with grace until ${GRACE_LABEL}. You are checking in late.`,
      });
    }
    await clockIn(u.id, now, 'Active', undefined, atOffice);
    await audit(u.id, 'CLOCK_IN', 'Attendance', u.id);
    return NextResponse.json({ ok: true, late: false });
  }

  if (b.action === 'regularise') {
    const note = String(b.note || '').trim();
    if (!note) return NextResponse.json({ error: 'A note is required for regularisation.' }, { status: 400 });
    if (hasOpenShiftToday(u)) return NextResponse.json({ error: 'Already clocked in' }, { status: 409 });

    const now = new Date();
    if (!isLate(now)) return NextResponse.json({ error: `Regularisation is only required after ${GRACE_LABEL}.` }, { status: 409 });

    const { start, end } = istDayBounds(now);
    const usedThisMonth = await db.regularisationRequest.count({ where: { userId: u.id, attendanceAt: { gte: new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(now)}-01T00:00:00+05:30`), lte: end } } });
    if (usedThisMonth >= 2) return NextResponse.json({ error: 'You have used both regularisation requests for this month.' }, { status: 409 });
    const existing = await db.regularisationRequest.findFirst({ where: { userId: u.id, attendanceAt: { gte: start, lte: end } } });
    if (existing) return NextResponse.json({ error: 'A regularisation request already exists for today.' }, { status: 409 });

    const request = await db.regularisationRequest.create({
      data: { userId: u.id, attendanceAt: now, note },
    });

    await clockIn(u.id, now, 'Active - Regularisation Pending', `Regularisation pending: ${note}`, atOffice);

    const joseph = await db.user.findFirst({ where: { role: 'MD', active: true }, orderBy: { createdAt: 'asc' } });
    if (joseph) {
      await db.notification.create({
        data: {
          userId: joseph.id,
          title: 'Attendance regularisation request',
          body: `${u.name} checked in after ${GRACE_LABEL} and requested regularisation. Note: ${note}`,
        },
      });
    }

    await audit(u.id, 'REGULARISATION_REQUESTED', 'RegularisationRequest', request.id, { note, attendanceAt: now.toISOString() });
    return NextResponse.json({ ok: true, requestId: request.id, status: 'PENDING' });
  }

  if (b.action === 'accept-deduction') {
    if (hasOpenShiftToday(u)) return NextResponse.json({ error: 'Already clocked in' }, { status: 409 });
    const now = new Date();
    if (!isLate(now)) return NextResponse.json({ error: `The 0.5 day late deduction option is only required after ${GRACE_LABEL}.` }, { status: 409 });
    await clockIn(u.id, now, 'Active - 0.5 Day Salary Deduction', 'Late check-in: accepted 0.5 day salary deduction.', atOffice);
    await audit(u.id, 'LATE_DEDUCTION', 'Attendance', u.id, { days: DEDUCTION });
    return NextResponse.json({ ok: true, deducted: DEDUCTION });
  }

  if (b.action === 'clock-out') {
    if (!u.checkInAt || u.checkOutAt) return NextResponse.json({ error: 'No active shift' }, { status: 409 });
    const now = new Date();
    const seconds = Math.max(0, Math.floor((now.getTime() - u.checkInAt.getTime()) / 1000));
    const running = await db.task.findMany({ where: { ownerId: u.id, runningSince: { not: null } } });
    for (const task of running) {
      const taskSeconds = Math.max(0, Math.floor((now.getTime() - task.runningSince!.getTime()) / 1000));
      await db.task.update({ where: { id: task.id }, data: { runningSince: null, status: 'OPEN', timeSeconds: { increment: taskSeconds } } });
      await db.timeEntry.create({ data: { userId: u.id, taskId: task.id, seconds: taskSeconds, startedAt: task.runningSince!, endedAt: now } });
    }
    await db.user.update({ where: { id: u.id }, data: { checkOutAt: now, shiftSeconds: { increment: seconds }, status: 'Offline' } });
    await db.attendanceLog.create({ data: { userId: u.id, type: 'CLOCK_OUT', at: now } });
    await audit(u.id, 'CLOCK_OUT', 'Attendance', u.id, { seconds });
    return NextResponse.json({ ok: true, seconds });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
