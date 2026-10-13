import type { Db } from './db';

// AI proof check. Reads every word off the uploaded design and compares it with the approved copy.
// It flags; a person still decides. Needs ANTHROPIC_API_KEY in the environment.
//
// Optional settings:
//   AI_PROOF_MODEL      model id (default claude-sonnet-5)
//   ANTHROPIC_BASE_URL  only for testing against a mock server

export type ProofIssue = { found: string; suggestion: string; type: string; note?: string };

export function aiProofEnabled() { return !!process.env.ANTHROPIC_API_KEY; }
export function aiProofModel() { return process.env.AI_PROOF_MODEL || 'claude-sonnet-5'; }

const SYSTEM = `You are the final proofreader at a marketing agency in India. You check finished designs before they go to clients.

Read every piece of text visible in the image, including small print, phone numbers, URLs, prices, dates and text inside logos where legible.

Report only real problems:
- spelling mistakes and typos
- wrong or missing words, repeated words, broken grammar
- any difference from the approved copy (when approved copy is given): changed, missing or extra text, wrong numbers, wrong phone numbers, wrong URLs, wrong prices, wrong dates, wrong names
- inconsistent spelling of the same brand or product name

Do not report:
- British or Indian English spellings (colour, centre, organise) as errors
- capitalisation used for design effect, unless it changes a name or differs from the approved copy in a way a client would notice
- line breaks, hyphenation or text split across lines
- the design itself (layout, colours, images)

Respond with JSON only, no other text, in exactly this shape:
{"extractedText":"all text you can read, top to bottom, one line per block","issues":[{"found":"the text as it appears","suggestion":"what it should say","type":"spelling|mismatch|missing|extra|grammar|number","note":"short reason"}]}
If there are no problems, return an empty issues array.`;

function parseJson(text: string) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI response was not JSON.');
  return JSON.parse(cleaned.slice(start, end + 1)) as { extractedText?: string; issues?: ProofIssue[] };
}

/** Runs the check on the latest uploaded image of a task (or a given file) and stores the result. */
export async function runAiProofCheck(db: Db, taskId: string, fileId?: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true, desc: true, approvedCopy: true } });
  if (!task) throw new Error('Task not found');
  const file = fileId
    ? await db.taskFile.findFirst({ where: { id: fileId, taskId } })
    : await db.taskFile.findFirst({ where: { taskId }, orderBy: { createdAt: 'desc' } });

  const record = (data: { status: string; extracted?: string | null; issues?: ProofIssue[] | null; error?: string | null; model?: string | null }) =>
    db.proofCheck.create({ data: { taskId, fileId: file?.id ?? null, status: data.status, extracted: data.extracted ?? null, issues: data.issues ?? undefined, error: data.error ?? null, model: data.model ?? null } });

  if (!file) return record({ status: 'SKIPPED', error: 'Upload the design first.' });
  if (!aiProofEnabled()) return record({ status: 'SKIPPED', error: 'AI check is not set up. Add ANTHROPIC_API_KEY to the server settings.' });
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.mime)) return record({ status: 'SKIPPED', error: 'The AI check reads images only (JPG, PNG, WEBP or GIF).' });

  const model = aiProofModel();
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const copy = task.approvedCopy?.trim();
  const prompt = copy
    ? `Task: ${task.desc}\n\nApproved copy (the design must match this exactly, apart from line breaks):\n"""\n${copy}\n"""\n\nCheck the design against it and for spelling.`
    : `Task: ${task.desc}\n\nNo approved copy was attached. Check the design for spelling, typos and grammar only.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': String(process.env.ANTHROPIC_API_KEY), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: file.mime, data: Buffer.from(file.data).toString('base64') } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = (body as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
      return record({ status: 'ERROR', error: `AI check failed: ${message}`.slice(0, 500), model });
    }
    const text = ((body as { content?: { type: string; text?: string }[] }).content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('\n');
    const parsed = parseJson(text);
    const issues = (parsed.issues || [])
      .filter((i) => i && (i.found || i.suggestion))
      .slice(0, 40)
      .map((i) => ({ found: String(i.found ?? '').slice(0, 300), suggestion: String(i.suggestion ?? '').slice(0, 300), type: String(i.type ?? 'spelling').slice(0, 20), note: i.note ? String(i.note).slice(0, 300) : undefined }));
    return record({ status: issues.length ? 'ISSUES' : 'CLEAR', extracted: String(parsed.extractedText ?? '').slice(0, 8000), issues, model });
  } catch (e) {
    const message = e instanceof Error ? (e.name === 'AbortError' ? 'timed out after 90 seconds' : e.message) : 'unknown error';
    return record({ status: 'ERROR', error: `AI check failed: ${message}`.slice(0, 500), model });
  } finally {
    clearTimeout(timer);
  }
}
