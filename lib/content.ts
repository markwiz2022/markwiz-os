// Content calendar lists and rules. Safe to import from pages and client components.

export const CONTENT_PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'Google Business', 'X', 'Website / blog', 'Other'] as const;
export const CONTENT_FORMATS = ['Static post', 'Carousel', 'Reel', 'Story', 'Video', 'Blog', 'Ad creative', 'Other'] as const;

export const CONTENT_STATUSES = ['PLANNED', 'IN_DESIGN', 'IN_REVIEW', 'APPROVED', 'POSTED', 'SKIPPED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  PLANNED: 'Planned', IN_DESIGN: 'In design', IN_REVIEW: 'In review', APPROVED: 'Approved', POSTED: 'Posted', SKIPPED: 'Skipped',
};
export const CONTENT_STATUS_TONE: Record<ContentStatus, string> = {
  PLANNED: '', IN_DESIGN: 'amber', IN_REVIEW: 'amber', APPROVED: 'green', POSTED: 'green', SKIPPED: '',
};

export const isContentStatus = (s: unknown): s is ContentStatus => CONTENT_STATUSES.includes(s as ContentStatus);

/** Task category a post's design task should use. */
export function categoryForFormat(format: string) {
  if (['Reel', 'Video', 'Story'].includes(format)) return 'VIDEO';
  if (format === 'Blog') return 'CONTENT';
  if (format === 'Ad creative') return 'DESIGN';
  return 'SOCIAL';
}

/**
 * What the calendar shows. Posted and skipped are set by people. Otherwise a linked task drives the status,
 * so nobody has to update two places.
 */
export function effectiveStatus(post: { status: string }, taskStatus?: string | null): ContentStatus {
  const own = isContentStatus(post.status) ? post.status : 'PLANNED';
  if (own === 'POSTED' || own === 'SKIPPED' || !taskStatus) return own;
  if (taskStatus === 'DONE' || taskStatus === 'CLIENT') return 'APPROVED';
  if (taskStatus === 'REVIEW' || taskStatus === 'APPROVAL') return 'IN_REVIEW';
  return 'IN_DESIGN';
}

/** Default due date for the design task: two working-ish days before the post date. */
export function designDueKey(postDateKey: string) {
  const d = new Date(`${postDateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}
