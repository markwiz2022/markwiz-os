import { db } from './db';

/**
 * App settings the MD can change inside the app (stored in the AppSetting table).
 * Each setting has a safe default, so a missing row never breaks a page.
 */

/** People (besides the MD) who may create client records. Stored as user IDs. */
export const CLIENT_CREATORS_KEY = 'clients.creators';
// Before this setting existed, only this account could add clients. Used until the MD saves the setting.
const LEGACY_CLIENT_CREATOR_EMAILS = ['aleena@markwiz.com'];

export async function getClientCreatorIds(): Promise<string[]> {
  const row = await db.appSetting.findUnique({ where: { key: CLIENT_CREATORS_KEY } });
  if (row) {
    try { const ids = JSON.parse(row.value); return Array.isArray(ids) ? ids.map(String) : []; } catch { return []; }
  }
  const legacy = await db.user.findMany({ where: { email: { in: LEGACY_CLIENT_CREATOR_EMAILS } }, select: { id: true } });
  return legacy.map((u) => u.id);
}

export async function canCreateClients(user: { id: string; role: string }) {
  if (user.role === 'MD') return true;
  return (await getClientCreatorIds()).includes(user.id);
}

export async function setClientCreatorIds(ids: string[]) {
  const value = JSON.stringify([...new Set(ids.map(String))]);
  await db.appSetting.upsert({ where: { key: CLIENT_CREATORS_KEY }, create: { key: CLIENT_CREATORS_KEY, value }, update: { value } });
}
