// Fingerprint device ingestion (ZKTeco or similar). A small connector at each branch pulls
// attendance logs from the device every few minutes and posts them here with the device token.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parsePunchType } from "@/lib/domain/punchImport";
import { recordPunch } from "@/lib/services/punch";

const Body = z.object({
  punches: z
    .array(
      z.object({
        employeeNo: z.string().min(1),
        timestamp: z.string().datetime({ offset: true }),
        type: z.union([z.string(), z.number()]).optional().nullable(),
      }),
    )
    .max(5000),
});

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing device token" }, { status: 401 });
  const device = await db.device.findUnique({ where: { apiToken: token } });
  if (!device) return NextResponse.json({ error: "Unknown device" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const nos = [...new Set(parsed.data.punches.map((p) => p.employeeNo.toLowerCase()))];
  const emps = await db.employee.findMany({ where: { employeeNo: { in: nos, mode: "insensitive" } }, select: { id: true, employeeNo: true, clockMethod: true } });
  const byNo = new Map(emps.map((e) => [e.employeeNo.toLowerCase(), e]));
  const results = { accepted: 0, duplicates: 0, rejected: [] as Array<{ employeeNo: string; timestamp: string; error: string }> };

  for (const p of parsed.data.punches) {
    const emp = byNo.get(p.employeeNo.toLowerCase());
    if (!emp) {
      results.rejected.push({ employeeNo: p.employeeNo, timestamp: p.timestamp, error: "Unknown employee" });
      continue;
    }
    if (emp.clockMethod === "MOBILE") {
      results.rejected.push({ employeeNo: p.employeeNo, timestamp: p.timestamp, error: "Employee is set to phone clock-in only" });
      continue;
    }
    const type = parsePunchType(p.type ?? null);
    if (type === "INVALID") {
      results.rejected.push({ employeeNo: p.employeeNo, timestamp: p.timestamp, error: "Unknown punch type" });
      continue;
    }
    const ts = new Date(p.timestamp);
    const dup = await db.punch.findFirst({ where: { employeeId: emp.id, timestamp: ts } });
    if (dup) {
      results.duplicates++;
      continue;
    }
    try {
      await recordPunch({ employeeId: emp.id, type, source: "DEVICE", timestamp: ts, deviceId: device.id });
      results.accepted++;
    } catch (e) {
      results.rejected.push({ employeeNo: p.employeeNo, timestamp: p.timestamp, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
  return NextResponse.json(results);
}
