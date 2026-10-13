import { PrismaClient } from '@prisma/client';

// Password hashes and salaries are never loaded unless a query explicitly asks for them
// (login and payroll only). This stops them leaking into pages or API responses.
function createClient() {
  return new PrismaClient({ omit: { user: { passwordHash: true, monthlySalary: true } } });
}
export type Db = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: Db };
export const db: Db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
