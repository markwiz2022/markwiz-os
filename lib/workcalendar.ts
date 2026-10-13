// Markwiz working calendar and attendance timing rules.
// Everything here is calculated in India Standard Time.
//
// Working days : Monday to Friday, plus the 1st, 3rd and 5th Saturday of the month.
//                Sunday, and the 2nd and 4th Saturday, are weekly offs.
// Check-in     : 9:00 AM, with 15 minutes of grace. 9:16 AM onwards counts as late.

export const CHECK_IN_HOUR = 9;
export const CHECK_IN_MINUTE = 0;
export const GRACE_MINUTES = 15;
export const CHECK_IN_LABEL = '9:00 AM';
export const GRACE_LABEL = '9:15 AM';

const IST = 'Asia/Kolkata';

function istParts(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(date).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
}

/** Calendar date in IST, e.g. "2026-09-17". */
export function istDateKey(date: Date) {
  const p = istParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Start and end of the IST calendar day that contains this moment. */
export function istDayBounds(date: Date) {
  const key = istDateKey(date);
  return { start: new Date(`${key}T00:00:00+05:30`), end: new Date(`${key}T23:59:59.999+05:30`) };
}

/** True when the IST date is a working day for Markwiz. */
export function isWorkingDay(date: Date) {
  const p = istParts(date);
  const weekday = p.weekday;
  if (weekday === 'Sun') return false;
  if (weekday === 'Sat') {
    const nth = Math.floor((Number(p.day) - 1) / 7) + 1; // which Saturday of the month
    return nth !== 2 && nth !== 4; // 2nd and 4th Saturday are off
  }
  return true;
}

/** Number of working days between two moments, inclusive, counted in IST. */
export function countWorkingDays(start: Date, end: Date) {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (isWorkingDay(d)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/** Every working-day date key between two moments, inclusive. */
export function workingDayKeys(start: Date, end: Date) {
  const keys: string[] = [];
  const d = new Date(start);
  while (d <= end) {
    if (isWorkingDay(d)) keys.push(istDateKey(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}

/** True when a check-in is later than 9:00 AM plus the grace period. */
export function isLate(date: Date) {
  const p = istParts(date);
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return minutes > CHECK_IN_HOUR * 60 + CHECK_IN_MINUTE + GRACE_MINUTES;
}

/** First and last moment of a payroll month, e.g. "2026-09", in IST. */
export function monthBoundsIST(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(`${monthKey}-01T00:00:00+05:30`);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = new Date(`${monthKey}-${String(lastDay).padStart(2, '0')}T23:59:59.999+05:30`);
  return { start, end };
}

/** Payroll month key for a moment, in IST. */
export function monthKeyIST(date: Date) {
  return istDateKey(date).slice(0, 7);
}

// ---------------------------------------------------------------------------
// Autopilot helpers (Sep 2026). All keys are IST calendar dates "YYYY-MM-DD".
// ---------------------------------------------------------------------------

/** Minutes past midnight in IST (0 to 1439). */
export function istMinutes(date: Date) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  return Number(p.hour) * 60 + Number(p.minute);
}

/** Noon IST on a date key, a safe anchor for date arithmetic. */
function noonOf(key: string) { return new Date(`${key}T12:00:00+05:30`); }

export function addDaysKey(key: string, n: number) {
  const d = noonOf(key);
  d.setUTCDate(d.getUTCDate() + n);
  return istDateKey(d);
}

export function isWorkingDayKey(key: string) { return isWorkingDay(noonOf(key)); }

/** 1 = Monday ... 7 = Sunday. */
export function weekdayOfKey(key: string) { const d = noonOf(key).getUTCDay(); return d === 0 ? 7 : d; }

export function mondayOfKey(key: string) { return addDaysKey(key, 1 - weekdayOfKey(key)); }

export function nextWorkingDayKey(key: string) { let k = addDaysKey(key, 1); while (!isWorkingDayKey(k)) k = addDaysKey(k, 1); return k; }
export function prevWorkingDayKey(key: string) { let k = addDaysKey(key, -1); while (!isWorkingDayKey(k)) k = addDaysKey(k, -1); return k; }

/** The key n working days after `key` (n = 0 returns key itself if it is a working day, else the next one). */
export function addWorkingDaysKey(key: string, n: number) {
  let k = isWorkingDayKey(key) ? key : nextWorkingDayKey(key);
  for (let i = 0; i < n; i++) k = nextWorkingDayKey(k);
  return k;
}

/** Working days strictly after `fromKey` up to and including `toKey`. */
export function workingDaysBetweenKeys(fromKey: string, toKey: string) {
  let count = 0; let k = fromKey;
  while (k < toKey) { k = addDaysKey(k, 1); if (isWorkingDayKey(k)) count++; }
  return count;
}

/** Start of an IST day (00:00) and end (23:59:59.999) for a key. */
export function dayStartOfKey(key: string) { return new Date(`${key}T00:00:00+05:30`); }
export function dayEndOfKey(key: string) { return new Date(`${key}T23:59:59.999+05:30`); }
/** A moment on an IST day at hh:mm. */
export function atISTKey(key: string, hh: number, mm = 0) { return new Date(`${key}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`); }

/** Task due dates are stored the way the date picker sends them; the task is due until the end of that IST day. */
export function taskDueFromKey(key: string) { return new Date(key); }
export function dueEnd(due: Date) { return istDayBounds(due).end; }
export function isPastDue(due: Date, now = new Date()) { return now.getTime() > dueEnd(due).getTime(); }

/** "2026-09" style key n months away. */
export function monthKeyOffset(monthKey: string, n: number) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function lastDayOfMonth(monthKey: string) { const [y, m] = monthKey.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Short human date for a key, e.g. "25 Sep". */
export function shortKeyLabel(key: string) { return noonOf(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST }); }
