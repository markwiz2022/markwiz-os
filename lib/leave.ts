// Leave balance rules (pure, tested).

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * total   = the person's leave quota
 * taken   = approved leave days
 * pending = days in requests waiting for approval (held, so nobody can over-book)
 * left    = total − taken (what the person still has)
 * canBook = left − pending (what a new request may use)
 */
export function leaveBalance(u: { leaveQuota: number; leavesTaken: number }, pendingDays = 0) {
  const total = r2(u.leaveQuota), taken = r2(u.leavesTaken), pending = r2(pendingDays);
  const left = r2(Math.max(0, total - taken));
  return { total, taken, pending, left, canBook: r2(Math.max(0, left - pending)) };
}

export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
