import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Through a transaction pooler (Supabase, `pgbouncer=true`) a page's independent queries only run
 * in parallel when the client may open more than one connection; `connection_limit=1` makes every
 * page wait for each query in turn. Allow a few (DB_CONNECTION_LIMIT, default 5).
 */
function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.searchParams.get("pgbouncer") !== "true") return raw;
    const limit = Number(process.env.DB_CONNECTION_LIMIT ?? 5);
    if (Number(u.searchParams.get("connection_limit") ?? 0) < limit) u.searchParams.set("connection_limit", String(limit));
    return u.toString();
  } catch {
    return raw;
  }
}

// Generous transaction limits: hosted databases (e.g. Supabase) can be in a different region
// from the app server, and the 5 s default makes multi-step saves fail on slow round trips.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: databaseUrl(), transactionOptions: { maxWait: 10_000, timeout: 30_000 } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
