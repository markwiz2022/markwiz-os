import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guard, isLead } from '@/lib/api';
import { audit } from '@/lib/audit';
import { CONTENT_FORMATS, CONTENT_PLATFORMS } from '@/lib/content';

const pick = (v: unknown, list: readonly string[], fallback: string) => (list.includes(String(v)) ? String(v) : fallback);

/** Create a planned post. MD and DMM only. */
export async function POST(req: Request) {
  const g = await guard('clients'); if (g.error) return g.error;
  const u = g.user!;
  if (!isLead(u.role)) return NextResponse.json({ error: 'Only the MD or DMM can plan content.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || '').trim();
  if (!title) return NextResponse.json({ error: 'Give the post a title or topic.' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) return NextResponse.json({ error: 'Choose a post date.' }, { status: 400 });
  const client = await db.client.findUnique({ where: { id: String(b.clientId || '') }, select: { id: true, internal: true } });
  if (!client) return NextResponse.json({ error: 'Choose a client.' }, { status: 400 });
  const post = await db.contentPost.create({
    data: {
      clientId: client.id, date: new Date(`${b.date}T00:00:00Z`), title: title.slice(0, 200),
      platform: pick(b.platform, CONTENT_PLATFORMS, 'Instagram'), format: pick(b.format, CONTENT_FORMATS, 'Static post'),
      caption: b.caption ? String(b.caption).slice(0, 4000) : null, notes: b.notes ? String(b.notes).slice(0, 1000) : null, createdById: u.id,
    },
  });
  await audit(u.id, 'CREATE', 'ContentPost', post.id, { clientId: client.id, date: b.date, title: post.title });
  return NextResponse.json(post);
}
