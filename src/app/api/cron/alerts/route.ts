// Scheduled job (call every 5 minutes, e.g. from cron or a platform scheduler):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/alerts
import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ESCALATION_HOURS } from "@/lib/domain/approval";
import { shiftWindow } from "@/lib/domain/shift";
import { addDays, formatTime, localDateISO, parseDateISO, toDateISO } from "@/lib/domain/time";
import { departmentManagerUserIds, notifyRole, notifyUsers } from "@/lib/notify";
import { approvedLeave, recalcMany, toTemplateLike } from "@/lib/services/attendance";
import { storageDir } from "@/lib/services/punch";
import { getRules } from "@/lib/settings";

const SELFIE_RETENTION_DAYS = 90;

async function once(userIds: string[], type: string, link: string) {
  const sent = await db.notification.findMany({ where: { type, link, userId: { in: userIds } }, select: { userId: true } });
  const done = new Set(sent.map((s) => s.userId));
  return userIds.filter((u) => !done.has(u));
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rules = await getRules();
  const tz = rules.timezone;
  const now = new Date();
  const today = localDateISO(now, tz);
  const stats = { missedIn: 0, missingOut: 0, license: 0, escalated: 0, selfiesPurged: 0, recalculated: 0 };

  // 1. Missed clock-in and missing clock-out for shifts running today / overnight from yesterday.
  const shifts = await db.shiftAssignment.findMany({
    where: { status: "PUBLISHED", date: { gte: parseDateISO(addDays(today, -1)), lte: parseDateISO(today) }, template: { type: { notIn: ["OFF", "ON_CALL"] } } },
    include: { template: true, employee: { include: { lineManager: { include: { user: true } }, user: true } }, location: true },
  });
  const leave = await approvedLeave(null, today, today);
  for (const a of shifts) {
    const w = shiftWindow(toDateISO(a.date), toTemplateLike(a.template), a.location?.timezone ?? tz);
    if (!w) continue;
    if (leave.some((l) => l.employeeId === a.employeeId && toDateISO(a.date) >= l.from && toDateISO(a.date) <= l.to)) continue;
    const punches = await db.punch.findMany({ where: { employeeId: a.employeeId, timestamp: { gte: new Date(w.start.getTime() - 4 * 3600_000), lte: new Date(w.end.getTime() + 4 * 3600_000) } } });
    const hasIn = punches.some((p) => p.type === "IN" || p.type === null);
    const hasOut = punches.some((p) => p.type === "OUT");
    const managers = [a.employee.lineManager?.user?.id, ...(await departmentManagerUserIds(db, a.departmentId))].filter(Boolean) as string[];
    const link = `/attendance?from=${toDateISO(a.date)}&to=${toDateISO(a.date)}&q=${a.employee.employeeNo}`;
    if (!hasIn && now.getTime() > w.start.getTime() + rules.missedClockInAlertMinutes * 60_000 && now < w.end) {
      const targets = await once([a.employee.user?.id, ...managers].filter(Boolean) as string[], "MISSED_CLOCK_IN", link);
      if (targets.length) {
        await notifyUsers(db, targets, { type: "MISSED_CLOCK_IN", title: `Not clocked in: ${a.employee.nameEn}`, body: `${a.template.code} started at ${formatTime(w.start, tz)}`, link });
        stats.missedIn++;
      }
    }
    if (hasIn && !hasOut && now.getTime() > w.end.getTime() + 30 * 60_000) {
      const targets = await once([a.employee.user?.id, ...managers].filter(Boolean) as string[], "MISSING_CLOCK_OUT", link);
      if (targets.length) {
        await notifyUsers(db, targets, { type: "MISSING_CLOCK_OUT", title: `Missing clock-out: ${a.employee.nameEn}`, body: `${a.template.code} ended at ${formatTime(w.end, tz)}. Submit a correction.`, link });
        stats.missingOut++;
      }
    }
  }

  // 2. Professional license alerts 60 and 30 days before expiry.
  for (const days of [60, 30]) {
    const target = addDays(today, days);
    const emps = await db.employee.findMany({ where: { status: "ACTIVE", licenseExpiry: parseDateISO(target) }, include: { user: true } });
    for (const e of emps) {
      const link = `/employees?q=${e.employeeNo}&license=${days}`;
      const managers = await departmentManagerUserIds(db, e.homeDepartmentId);
      const hr = (await db.user.findMany({ where: { role: "HR_ADMIN" }, select: { id: true } })).map((u) => u.id);
      const targets = await once([e.user?.id, ...managers, ...hr].filter(Boolean) as string[], "LICENSE_EXPIRY", link);
      if (targets.length) {
        await notifyUsers(db, targets, { type: "LICENSE_EXPIRY", title: `License expires in ${days} days: ${e.nameEn}`, body: `${e.licenseNo ?? "SCFHS"} expires ${target}. Clinical shifts are blocked after expiry.`, link });
        stats.license++;
      }
    }
  }

  // 3. Escalate requests not handled within 48 hours.
  const overdue = await db.request.findMany({
    where: { status: { in: ["PENDING_L1", "PENDING_L2"] }, escalatedAt: null, updatedAt: { lt: new Date(now.getTime() - ESCALATION_HOURS * 3600_000) } },
    include: { requester: true },
  });
  for (const r of overdue) {
    const next = r.status === "PENDING_L1" ? await departmentManagerUserIds(db, r.departmentId) : [];
    await notifyUsers(db, next, { type: "ESCALATION", title: `Overdue ${r.type.toLowerCase()} request: ${r.requester.nameEn}`, body: `Waiting more than ${ESCALATION_HOURS}h at ${r.status.replace("PENDING_", "")}.`, link: `/inbox?id=${r.id}` });
    await notifyRole(db, ["HR_ADMIN"], { type: "ESCALATION", title: `Overdue ${r.type.toLowerCase()} request: ${r.requester.nameEn}`, body: `Waiting more than ${ESCALATION_HOURS}h.`, link: `/inbox?id=${r.id}` });
    await db.request.update({ where: { id: r.id }, data: { escalatedAt: now } });
    stats.escalated++;
  }

  // 4. Selfie retention (PDPL): delete selfies older than 90 days.
  const old = await db.punch.findMany({ where: { photoUrl: { not: null }, timestamp: { lt: new Date(now.getTime() - SELFIE_RETENTION_DAYS * 86400_000) } }, select: { id: true, photoUrl: true } });
  for (const p of old) {
    const name = p.photoUrl!.split("/").pop()!;
    await unlink(path.join(storageDir(), "selfies", name)).catch(() => undefined);
    await db.punch.update({ where: { id: p.id }, data: { photoUrl: null } });
    stats.selfiesPurged++;
  }

  // 5. Close out yesterday: absences become final once shifts end.
  const yesterday = await db.shiftAssignment.findMany({ where: { status: "PUBLISHED", date: parseDateISO(addDays(today, -1)) }, select: { employeeId: true, date: true } });
  await recalcMany(yesterday.map((a) => ({ employeeId: a.employeeId, date: toDateISO(a.date) })));
  stats.recalculated = yesterday.length;

  return NextResponse.json({ ok: true, at: now.toISOString(), ...stats });
}
