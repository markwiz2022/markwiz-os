import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, guard } from '@/lib/api';
import { canManage, FlowError } from '@/lib/task-flow';

const MAX = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('tasks'); if (g.error) return g.error;
  const u = g.user!;
  const { id } = await params;
  try {
    const t = await db.task.findUnique({ where: { id } });
    if (!t) throw new FlowError('Task not found.', 404);
    if (!(t.ownerId === u.id || canManage(t, u))) throw new FlowError('Only the owner can upload the design.', 403);
    if (!['OPEN', 'IN_PROGRESS'].includes(t.status)) throw new FlowError('Uploads are locked after hand-in. Ask for it to be sent back first.');
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new FlowError('Choose an image to upload.', 400);
    if (!TYPES.includes(file.type)) throw new FlowError('Upload a JPG, PNG, WEBP or GIF. For video or websites, paste a link instead.', 400);
    if (file.size > MAX) throw new FlowError('Image is larger than 5 MB. Export a smaller JPG.', 400);
    const data = Buffer.from(await file.arrayBuffer());
    const saved = await db.taskFile.create({ data: { taskId: id, uploadedById: u.id, name: file.name.slice(0, 200), mime: file.type, size: file.size, data } });
    await db.taskEvent.create({ data: { taskId: id, userId: u.id, type: 'FILE_UPLOADED', note: file.name.slice(0, 200) } });
    // Keep the latest five versions per task.
    const old = await db.taskFile.findMany({ where: { taskId: id }, orderBy: { createdAt: 'desc' }, skip: 5, select: { id: true } });
    if (old.length) await db.taskFile.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return NextResponse.json({ id: saved.id, name: saved.name, size: saved.size });
  } catch (e) { return errorResponse(e); }
}
