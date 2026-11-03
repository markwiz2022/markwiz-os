// Pure helpers for the Apollo import (no database, no network), so they can be tested.

/** The parts of an Apollo contact we use. Apollo sends many more fields; all are optional here. */
export type ApolloContact = {
  id?: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  organization_name?: string | null;
  created_at?: string | null;
  sanitized_phone?: string | null;
  phone_numbers?: { raw_number?: string | null; sanitized_number?: string | null }[] | null;
  organization?: { name?: string | null; website_url?: string | null; industry?: string | null } | null;
  account?: { name?: string | null; website_url?: string | null; industry?: string | null } | null;
};

export type MappedLead = {
  apolloId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  title: string | null;
  linkedin: string | null;
  createdAt: Date | null;
};

const clean = (v: unknown, max = 200) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const safeUrl = (v: unknown) => {
  const t = clean(v, 500);
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(withScheme); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
};

/** Turns one Apollo contact into the fields of a CRM lead. Returns null if it has no id or no usable name. */
export function mapApolloContact(c: ApolloContact): MappedLead | null {
  const apolloId = clean(c.id, 100);
  if (!apolloId) return null;
  const org = c.organization ?? c.account ?? null;
  const company = clean(c.organization_name) ?? clean(org?.name);
  const email = clean(c.email, 200)?.toLowerCase() ?? null;
  const name = clean(c.name) ?? clean([c.first_name, c.last_name].filter(Boolean).join(' ')) ?? email ?? company;
  if (!name) return null;
  const phone = clean(c.sanitized_phone, 40) ?? clean(c.phone_numbers?.[0]?.sanitized_number, 40) ?? clean(c.phone_numbers?.[0]?.raw_number, 40);
  const created = c.created_at ? new Date(c.created_at) : null;
  return {
    apolloId, name, company, email, phone,
    website: safeUrl(org?.website_url),
    industry: clean(org?.industry, 100),
    title: clean(c.title, 150),
    linkedin: safeUrl(c.linkedin_url),
    createdAt: created && !Number.isNaN(created.getTime()) ? created : null,
  };
}

/** Link to the contact inside Apollo. */
export const apolloContactUrl = (apolloId: string) => `https://app.apollo.io/#/contacts/${encodeURIComponent(apolloId)}`;
