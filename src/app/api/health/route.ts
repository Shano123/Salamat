// Deployment check: open /api/health in a browser to see whether the app can reach the
// database, whether the tables and demo data exist, and whether required settings are set.
// Reports only yes/no values and counts, never secrets.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DIRECT_URL_set: !!process.env.DIRECT_URL,
    AUTH_SECRET_set: !!process.env.AUTH_SECRET,
  };
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "connected";
  } catch (e) {
    checks.database = "NOT reachable";
    checks.databaseError = e instanceof Error ? e.message.split("\n").filter(Boolean).slice(-2).join(" ") : String(e);
    return NextResponse.json(checks, { status: 500 });
  }
  try {
    checks.users = await db.user.count();
    checks.demoHrAccount = !!(await db.user.findUnique({ where: { email: "hr@salamat.test" } }));
  } catch {
    checks.tables = "missing — run `npx prisma migrate deploy`";
    return NextResponse.json(checks, { status: 500 });
  }
  if (!checks.users) checks.hint = "Database is empty — run `npm run db:seed` (add it to the build command).";
  else if (!checks.AUTH_SECRET_set) checks.hint = "Set AUTH_SECRET in the environment variables, then redeploy.";
  return NextResponse.json(checks, { status: checks.users && checks.AUTH_SECRET_set ? 200 : 500 });
}
