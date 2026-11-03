import type { Db } from './db';
import { mapApolloContact, type ApolloContact } from './apollo-map';
import { audit } from './audit';

/**
 * Apollo → Sales CRM.
 * Every contact saved in Apollo ("pulled" from a search, a list or the Chrome extension) becomes a NEW lead here.
 * Matching is by Apollo contact id, then by email, so a contact is never added twice.
 * Set APOLLO_API_KEY in the environment (Apollo → Settings → Integrations → API Keys).
 */

const API = 'https://api.apollo.io/api/v1';
const KEYS = { cursor: 'apollo.cursor', last: 'apollo.lastSync', lock: 'apollo.lock', owner: 'apollo.ownerId' };
/** Automatic syncs run at most this often. "Sync now" ignores it. */
export const AUTO_SYNC_MINUTES = 10;
/** The first sync brings in contacts saved in this many days before it, not your whole Apollo history. */
const FIRST_SYNC_DAYS = 7;
const MAX_PAGES = 10; // 100 contacts per page

export const apolloConfigured = () => (process.env.APOLLO_API_KEY ?? '').trim().length > 10;

export type ApolloSyncResult = { at: string; created: number; linked: number; skipped: number; error?: string; manual?: boolean };

async function getSetting(db: Db, key: string) { return (await db.appSetting.findUnique({ where: { key } }))?.value ?? null; }
async function putSetting(db: Db, key: string, value: string) { await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }); }

export async function apolloStatus(db: Db) {
  const [last, owner] = await Promise.all([getSetting(db, KEYS.last), getSetting(db, KEYS.owner)]);
  let lastSync: ApolloSyncResult | null = null;
  try { lastSync = last ? JSON.parse(last) : null; } catch { lastSync = null; }
  return { configured: apolloConfigured(), lastSync, ownerId: owner };
}

export async function setApolloOwner(db: Db, userId: string | null) {
  if (userId) await putSetting(db, KEYS.owner, userId);
  else await db.appSetting.deleteMany({ where: { key: KEYS.owner } });
}

/** Only one sync at a time, even with several servers. The lock expires after 5 minutes in case a sync crashes. */
async function acquireLock(db: Db, now: Date) {
  await db.appSetting.upsert({ where: { key: KEYS.lock }, create: { key: KEYS.lock, value: '1970-01-01T00:00:00.000Z' }, update: {} });
  const stale = new Date(now.getTime() - 5 * 60_000).toISOString();
  const r = await db.appSetting.updateMany({ where: { key: KEYS.lock, value: { lt: stale } }, data: { value: now.toISOString() } });
  return r.count === 1;
}
async function releaseLock(db: Db) { await db.appSetting.update({ where: { key: KEYS.lock }, data: { value: '1970-01-01T00:00:00.000Z' } }).catch(() => undefined); }

async function fetchContacts(page: number): Promise<ApolloContact[]> {
  const res = await fetch(`${API}/contacts/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': (process.env.APOLLO_API_KEY ?? '').trim() },
    body: JSON.stringify({ page, per_page: 100, sort_by_field: 'contact_created_at', sort_ascending: false }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('Apollo rejected the API key. Check APOLLO_API_KEY in Vercel.');
  if (res.status === 429) throw new Error('Apollo rate limit reached. It will try again on the next sync.');
  if (!res.ok) throw new Error(`Apollo returned ${res.status}.`);
  const json = (await res.json()) as { contacts?: ApolloContact[] };
  return Array.isArray(json.contacts) ? json.contacts : [];
}

async function pickOwner(db: Db) {
  const chosen = await getSetting(db, KEYS.owner);
  if (chosen) { const u = await db.user.findFirst({ where: { id: chosen, active: true }, select: { id: true } }); if (u) return u.id; }
  const sales = await db.user.findFirst({ where: { role: 'SALES', active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (sales) return sales.id;
  const md = await db.user.findFirst({ where: { role: 'MD', active: true }, select: { id: true } });
  return md?.id ?? null;
}

/**
 * Pulls newly saved Apollo contacts into the CRM.
 * Automatic calls (manual = false) do nothing if a sync ran in the last AUTO_SYNC_MINUTES.
 */
export async function syncApollo(db: Db, opts: { now?: Date; manual?: boolean; actorId?: string } = {}): Promise<ApolloSyncResult | null> {
  if (!apolloConfigured()) return null;
  const now = opts.now ?? new Date();
  if (!opts.manual) {
    const prev = (await apolloStatus(db)).lastSync;
    if (prev && now.getTime() - new Date(prev.at).getTime() < AUTO_SYNC_MINUTES * 60_000) return null;
  }
  if (!(await acquireLock(db, now))) return null;

  const result: ApolloSyncResult = { at: now.toISOString(), created: 0, linked: 0, skipped: 0, manual: !!opts.manual };
  try {
    const cursorRaw = await getSetting(db, KEYS.cursor);
    const cursor = cursorRaw ? new Date(cursorRaw) : new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000);
    // Look back two extra minutes so a contact saved during the last sync isn't missed. Duplicates are skipped anyway.
    const since = new Date(cursor.getTime() - 2 * 60_000);

    const fresh: ReturnType<typeof mapApolloContact>[] = [];
    let newest = cursor;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const contacts = await fetchContacts(page);
      let reachedOld = contacts.length < 100;
      for (const c of contacts) {
        const m = mapApolloContact(c);
        if (!m) { result.skipped++; continue; }
        if (m.createdAt && m.createdAt <= since) { reachedOld = true; continue; }
        if (m.createdAt && m.createdAt > newest) newest = m.createdAt;
        fresh.push(m);
      }
      if (reachedOld) break;
    }

    if (fresh.length) {
      const existing = await db.lead.findMany({ select: { id: true, email: true, apolloId: true } });
      const byApollo = new Set(existing.map((l) => l.apolloId).filter(Boolean));
      const byEmail = new Map(existing.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l]));
      const ownerId = await pickOwner(db);
      const added: string[] = [];
      for (const m of fresh.reverse()) { // oldest first, so the CRM order matches Apollo
        if (!m || byApollo.has(m.apolloId)) { result.skipped++; continue; }
        const match = m.email ? byEmail.get(m.email) : undefined;
        if (match) {
          // Already in the CRM (added by hand): just link it to Apollo and fill gaps.
          if (!match.apolloId) { await db.lead.update({ where: { id: match.id }, data: { apolloId: m.apolloId } }); result.linked++; }
          else result.skipped++;
          byApollo.add(m.apolloId);
          continue;
        }
        const lead = await db.lead.create({ data: {
          apolloId: m.apolloId, name: m.name, company: m.company, email: m.email, phone: m.phone, website: m.website,
          industry: m.industry, title: m.title, linkedin: m.linkedin, source: 'Apollo', stage: 'NEW', probability: 10,
          ownerId, nextAction: 'First touch: reach out', nextFollowUp: now,
        } });
        byApollo.add(m.apolloId);
        if (m.email) byEmail.set(m.email, { id: lead.id, email: m.email, apolloId: m.apolloId });
        const actor = opts.actorId ?? ownerId;
        if (actor) await db.leadActivity.create({ data: { leadId: lead.id, userId: actor, type: 'CREATED', note: 'Imported from Apollo' } });
        added.push(m.company ? `${m.name} (${m.company})` : m.name);
        result.created++;
      }
      if (added.length && ownerId) {
        await db.notification.create({ data: { userId: ownerId, title: `${added.length} new lead${added.length === 1 ? '' : 's'} from Apollo`, body: `${added.slice(0, 5).join(', ')}${added.length > 5 ? ` and ${added.length - 5} more` : ''}. They are in Sales CRM under NEW with a follow-up for today.` } });
      }
      if (added.length && opts.actorId) await audit(opts.actorId, 'IMPORT', 'Lead', 'apollo', { created: result.created, linked: result.linked });
    }
    await putSetting(db, KEYS.cursor, newest.toISOString());
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    console.error('[apollo] sync failed:', result.error);
  } finally {
    await putSetting(db, KEYS.last, JSON.stringify(result));
    await releaseLock(db);
  }
  return result;
}
