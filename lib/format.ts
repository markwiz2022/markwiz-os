import { istDateKey, isPastDue, shortKeyLabel, workingDaysBetweenKeys } from './workcalendar';

export const ratingClass = (r: string) => (r === 'GREEN' ? 'green' : r === 'AMBER' ? 'amber' : r === 'RED' ? 'red' : '');
export const ratingLabel = (r: string) => (r === 'NONE' ? 'Not rated' : r.charAt(0) + r.slice(1).toLowerCase());

export function dueLabel(due: Date, now = new Date(), delivered = false) {
  const key = istDateKey(due);
  const today = istDateKey(now);
  if (delivered) return `Due ${shortKeyLabel(key)}`;
  if (isPastDue(due, now)) { const d = Math.max(1, workingDaysBetweenKeys(key, today)); return `${d} working day${d === 1 ? '' : 's'} late`; }
  if (key === today) return 'Due today';
  const d = workingDaysBetweenKeys(today, key);
  return d === 1 ? 'Due tomorrow' : `Due ${shortKeyLabel(key)}`;
}

export const dateTime = (d: Date) => d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
