// Starts the Markwiz autopilot scheduler once when the Node.js server starts.
// Set SCHEDULER=off to disable it (for example when an external cron calls /api/cron instead).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SCHEDULER === 'off') return;
  // Next.js also loads this file inside `next build` workers. Never run jobs during a build.
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.argv.some((a) => a.endsWith('build'))) return;
  const { startScheduler } = await import('./lib/scheduler');
  startScheduler();
}
