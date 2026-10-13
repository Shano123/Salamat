import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Generous transaction limits: hosted databases (e.g. Supabase) can be in a different region
// from the app server, and the 5 s default makes multi-step saves fail on slow round trips.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 30_000 } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
