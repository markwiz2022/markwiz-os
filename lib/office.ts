import { db } from './db';
import { DEFAULT_OFFICE, type Office } from './geo';

const KEY = 'office.location';

export async function getOffice(): Promise<Office> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_OFFICE;
  try {
    const o = JSON.parse(row.value);
    if (typeof o.lat === 'number' && typeof o.lng === 'number' && typeof o.radiusM === 'number') return { name: String(o.name || DEFAULT_OFFICE.name), lat: o.lat, lng: o.lng, radiusM: o.radiusM };
  } catch { /* fall through */ }
  return DEFAULT_OFFICE;
}

export async function setOffice(o: Office) {
  const value = JSON.stringify(o);
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
