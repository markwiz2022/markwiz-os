// Points prisma/schema.prisma at the right database type.
//   node scripts/db-provider.mjs auto        (default) PostgreSQL if DATABASE_URL starts with postgres, else SQLite
//   node scripts/db-provider.mjs postgresql
//   node scripts/db-provider.mjs sqlite
// Runs automatically before build, typecheck and db:update, so one codebase works on a Mac (SQLite)
// and on Vercel with Neon / Vercel Postgres.
//
// PostgreSQL uses two URLs: DATABASE_URL (pooled, for the app) and DATABASE_URL_UNPOOLED (direct, for schema
// changes). The Neon integration on Vercel creates both.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = join(root, 'prisma', 'schema.prisma');

function envValue(key) {
  if (process.env[key]) return process.env[key];
  const f = join(root, '.env');
  if (!existsSync(f)) return '';
  const line = readFileSync(f, 'utf8').split(/\r?\n/).find((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  return line ? line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : '';
}

let mode = process.argv[2] || 'auto';
if (mode === 'auto') mode = /^postgres(ql)?:\/\//.test(envValue('DATABASE_URL')) ? 'postgresql' : 'sqlite';
if (!['postgresql', 'sqlite'].includes(mode)) { console.error('Use: auto, postgresql or sqlite'); process.exit(1); }

const schema = readFileSync(schemaPath, 'utf8');
const directKey = (envValue('DIRECT_URL') || !envValue('DATABASE_URL_UNPOOLED')) ? 'DIRECT_URL' : 'DATABASE_URL_UNPOOLED';
const block = mode === 'postgresql'
  ? `datasource db {\n  provider  = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("${directKey}")\n}`
  : 'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}';
const next = schema.replace(/datasource db \{[^}]*\}/, block);
if (next !== schema) {
  writeFileSync(schemaPath, next);
  console.log(`Database type set to ${mode}.`);
}
