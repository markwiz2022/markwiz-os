import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard, isLead } from '@/lib/api';
import { audit } from '@/lib/audit';
import { createTask } from '@/lib/task-flow';
import { recalculateClientHealth } from '@/lib/client-health';
import { CONTENT_FORMATS, CONTENT_PLATFORMS, categoryForFormat, designDueKey, isContentStatus } from '@/lib/content';

/**
 * Edit a post (MD/DMM), change its status, or { action: 'task', ownerId, due } to create its design task.
 * The owner of the linked task may also mark it Posted with the live link.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('clients'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  try {
    const post = await db.contentPost.findUnique({ where: { id }, include: { task: { select: { ownerId: true } }, client: { select: { name: true } } } });
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    const b = await req.json().catch(() => ({}));
    const lead = isLead(u.role);
    const taskOwner = !!post.task && post.task.ownerId === u.id;

    if (b.action === 'task') {
      if (!lead) return NextResponse.json({ error: 'Only the MD or DMM can assign content work.' }, { status: 403 });
      if (post.taskId) return NextResponse.json({ error: 'This post already has a task.' }, { status: 409 });
      const dateKey = post.date.toISOString().slice(0, 10);
      const t = await createTask(db, u, {
        clientId: post.clientId, ownerId: String(b.ownerId || ''), due: String(b.due || designDueKey(dateKey)),
        desc: `${post.platform} ${post.format.toLowerCase()} for ${dateKey}: ${post.title}`, category: categoryForFormat(post.format),
        approvedCopy: post.caption ?? undefined, priority: 'P2',
      });
      await recalculateClientHealth(db, post.clientId);
      const updated = await db.contentPost.update({ where: { id }, data: { taskId: t.id, status: post.status === 'PLANNED' ? 'IN_DESIGN' : post.status } });
      await audit(u.id, 'UPDATE', 'ContentPost', id, { taskCreated: t.id });
      return NextResponse.json(updated);
    }

    const data: Record<string, unknown> = {};
    if (b.status !== undefined) {
      if (!isContentStatus(b.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
      if (!lead && !(taskOwner && b.status === 'POSTED')) return NextResponse.json({ error: 'Only the MD, DMM or the task owner (to mark it posted) can change this.' }, { status: 403 });
      data.status = b.status;
    }
    if (b.postedUrl !== undefined) {
      if (!lead && !taskOwner) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
      const url = String(b.postedUrl || '').trim();
      if (url && !/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'The link should start with http:// or https://' }, { status: 400 });
      data.postedUrl = url || null;
    }
    const edits = ['title', 'caption', 'notes', 'platform', 'format', 'date'].filter((k) => b[k] !== undefined);
    if (edits.length) {
      if (!lead) return NextResponse.json({ error: 'Only the MD or DMM can edit the plan.' }, { status: 403 });
      if (b.title !== undefined) { const t = String(b.title).trim(); if (!t) return NextResponse.json({ error: 'Title is required' }, { status: 400 }); data.title = t.slice(0, 200); }
      if (b.caption !== undefined) data.caption = b.caption ? String(b.caption).slice(0, 4000) : null;
      if (b.notes !== undefined) data.notes = b.notes ? String(b.notes).slice(0, 1000) : null;
      if (b.platform !== undefined && CONTENT_PLATFORMS.includes(b.platform)) data.platform = b.platform;
      if (b.format !== undefined && CONTENT_FORMATS.includes(b.format)) data.format = b.format;
      if (b.date !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) return NextResponse.json({ error: 'Invalid date' }, { status: 400 }); data.date = new Date(`${b.date}T00:00:00Z`); }
    }
    const updated = await db.contentPost.update({ where: { id }, data });
    await audit(u.id, 'UPDATE', 'ContentPost', id, { before: { status: post.status, title: post.title, date: post.date }, after: data });
    return NextResponse.json(updated);
  } catch (e) { return errorResponse(e); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('clients'); if (g.error) return g.error;
  const u = g.user!;
  if (!isLead(u.role)) return NextResponse.json({ error: 'Only the MD or DMM can remove posts.' }, { status: 403 });
  const { id } = await params;
  const post = await db.contentPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  await db.contentPost.delete({ where: { id } });
  await audit(u.id, 'DELETE', 'ContentPost', id, { deleted: post });
  return NextResponse.json({ ok: true });
}
