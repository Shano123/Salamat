"use server";
import bcrypt from "bcryptjs";
import { PunchType } from "@prisma/client";
import { db } from "@/lib/db";
import { formatTime } from "@/lib/domain/time";
import { recordPunch, suggestNextType } from "@/lib/services/punch";
import { getRules } from "@/lib/settings";

const attempts = new Map<string, { n: number; until: number }>();

export async function kioskPunch(input: { token: string; employeeNo: string; pin: string; type?: PunchType | "AUTO" }): Promise<{ ok?: string; error?: string }> {
  const device = await db.device.findUnique({ where: { apiToken: input.token } });
  if (!device || device.kind !== "KIOSK") return { error: "This kiosk is not registered. Ask HR for the kiosk link." };
  const key = `${device.id}:${input.employeeNo}`;
  const a = attempts.get(key);
  if (a && a.until > Date.now()) return { error: "Too many wrong PINs. Try again in 5 minutes." };
  const emp = await db.employee.findFirst({ where: { employeeNo: { equals: input.employeeNo.trim(), mode: "insensitive" }, status: "ACTIVE" } });
  if (!emp || !emp.kioskPin || !(await bcrypt.compare(input.pin, emp.kioskPin))) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(key, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { error: "Employee number or PIN is incorrect." };
  }
  attempts.delete(key);
  try {
    const type = !input.type || input.type === "AUTO" ? await suggestNextType(emp.id) : input.type;
    const p = await recordPunch({ employeeId: emp.id, type, source: "KIOSK", deviceId: device.id });
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    const rules = await getRules();
    return { ok: `${emp.nameEn} / ${emp.nameAr} — ${type.replace("_", " ")} ${formatTime(p.timestamp, rules.timezone)}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
