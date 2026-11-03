// Office location rules (pure, tested in tests/attendance.test.ts).

export type Office = { name: string; lat: number; lng: number; radiusM: number };

/** Novel Office, Novel MSR Building, Marathahalli, Bengaluru 560037 (Google Maps). The MD can change it on Attendance & Leave. */
export const DEFAULT_OFFICE: Office = { name: 'Novel Office, Marathahalli', lat: 12.9566849, lng: 77.6999716, radiusM: 150 };

/** Phone and laptop locations are rarely exact. Up to this much of the reported accuracy is allowed on top of the radius. */
export const MAX_ACCURACY_ALLOWANCE_M = 200;

/** Straight-line distance in metres between two points. */
export function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6_371_000, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Position = { lat: number; lng: number; accuracy?: number | null };

export function validPosition(p: unknown): Position | null {
  if (!p || typeof p !== 'object') return null;
  const { lat, lng, accuracy } = p as Record<string, unknown>;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null };
}

/** OFFICE when inside the radius (allowing for location accuracy); otherwise WFH. No location shared counts as WFH. */
export function classifyClockIn(pos: Position | null, office: Office) {
  if (!pos) return { mode: 'WFH' as const, distanceM: null as number | null, reason: 'Location not shared' };
  const d = distanceMetres(pos.lat, pos.lng, office.lat, office.lng);
  const allowance = Math.min(pos.accuracy ?? 0, MAX_ACCURACY_ALLOWANCE_M);
  const inside = d <= office.radiusM + allowance;
  return { mode: inside ? ('OFFICE' as const) : ('WFH' as const), distanceM: Math.round(d), reason: inside ? 'At the office' : `${formatDistance(d)} from ${office.name}` };
}

export function formatDistance(m: number) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`; }

/** WFH days are paid as half days. */
export const WFH_DAY_VALUE = 0.5;

/**
 * Splits a month's clock-ins into office days and work-from-home days.
 * A day is an office day if any clock-in that day was at the office (older records with no mode count as office).
 */
export function splitWorkDays(logs: { dayKey: string; workMode: string | null }[]) {
  const office = new Set<string>(), any = new Set<string>();
  for (const l of logs) { any.add(l.dayKey); if (l.workMode !== 'WFH') office.add(l.dayKey); }
  const wfh = new Set([...any].filter((k) => !office.has(k)));
  return { office, wfh };
}
