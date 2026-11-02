// Copies the local SQLite database into backups/ with a timestamp.
// Run before any change to the schema or a big data entry: npm run backup
// (npm run db:update runs this automatically before changing the database.)
//
// For PostgreSQL (server), use your host's backups or:
//   pg_dump "$DATABASE_URL" > backups/markwiz-$(date +%Y%m%d-%H%M).sql
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) return '';
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
}

const url = databaseUrl();
if (!url.startsWith('file:')) {
  console.log('DATABASE_URL is not a local SQLite file. Back up the server database with your host or pg_dump (see the top of this script).');
  process.exit(0);
}
// Prisma resolves SQLite paths relative to prisma/schema.prisma.
const dbPath = resolve(join(root, 'prisma'), url.slice('file:'.length));
if (!existsSync(dbPath)) {
  console.log(`No database at ${dbPath} yet, nothing to back up.`);
  process.exit(0);
}

const dir = join(root, 'backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(/[: ]/g, '-').slice(0, 16);
const target = join(dir, `dev-${stamp}.db`);
copyFileSync(dbPath, target);
if (existsSync(`${dbPath}-journal`)) copyFileSync(`${dbPath}-journal`, `${target}-journal`);
console.log(`Backed up the database to ${target}`);

// Keep the 30 most recent backups.
const old = readdirSync(dir).filter((f) => /^dev-.*\.db$/.test(f)).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(30);
for (const { f } of old) { unlinkSync(join(dir, f)); if (existsSync(join(dir, `${f}-journal`))) unlinkSync(join(dir, `${f}-journal`)); }
