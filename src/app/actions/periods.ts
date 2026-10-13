"use server";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ActionState, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { parseDateISO, toDateISO } from "@/lib/domain/time";
import { recalcMany } from "@/lib/services/attendance";

export async function createPeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("periods.lock");
    const start = str(fd, "start");
    const end = str(fd, "end");
    if (!start || !end || end < start) throw new Error("Invalid period dates.");
    const overlap = await db.attendancePeriod.findFirst({ where: { startDate: { lte: parseDateISO(end) }, endDate: { gte: parseDateISO(start) } } });
    if (overlap) throw new Error(`Overlaps the period ${toDateISO(overlap.startDate)} → ${toDateISO(overlap.endDate)}.`);
    const p = await db.attendancePeriod.create({ data: { startDate: parseDateISO(start), endDate: parseDateISO(end) } });
    await audit(db, user, "AttendancePeriod", p.id, "CREATE", null, p);
    return "Period created.";
  }, "/periods");
}

export async function lockPeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("periods.lock");
    const p = await db.attendancePeriod.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    const from = toDateISO(p.startDate);
    const to = toDateISO(p.endDate);
    const pending = await db.request.findMany({ where: { type: { in: ["CORRECTION", "OVERTIME"] }, status: { in: ["PENDING_L1", "PENDING_L2", "PENDING_HR"] } } });
    const blocking = pending.filter((r) => {
      const d = (r.payload as { date?: string }).date;
      return d && d >= from && d <= to;
    });
    if (blocking.length) throw new Error(`${blocking.length} correction/overtime request(s) for this period are still pending. Approve or reject them first.`);
    // Final recalculation so the locked numbers reflect every approved change.
    const shifts = await db.shiftAssignment.findMany({ where: { status: "PUBLISHED", date: { gte: p.startDate, lte: p.endDate } }, select: { employeeId: true, date: true } });
    await recalcMany(shifts.map((s) => ({ employeeId: s.employeeId, date: toDateISO(s.date) })));
    await db.$transaction(async (tx) => {
      await tx.attendanceRecord.updateMany({ where: { assignment: { date: { gte: p.startDate, lte: p.endDate } } }, data: { locked: true } });
      await tx.attendancePeriod.update({ where: { id: p.id }, data: { status: "LOCKED", lockedById: user.id, lockedAt: new Date() } });
      await audit(tx, user, "AttendancePeriod", p.id, "LOCK", { status: p.status }, { status: "LOCKED" });
    });
    return `Period ${from} → ${to} locked. Records are read-only.`;
  }, ["/periods", "/payroll"]);
}

export async function reopenPeriod(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("periods.lock");
    if (user.role !== "HR_ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Only HR Admin can reopen a period.");
    const reason = str(fd, "reason");
    if (!reason) throw new Error("A reason is required to reopen a locked period.");
    const p = await db.attendancePeriod.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    await db.$transaction(async (tx) => {
      await tx.attendanceRecord.updateMany({ where: { assignment: { date: { gte: p.startDate, lte: p.endDate } } }, data: { locked: false } });
      await tx.attendancePeriod.update({ where: { id: p.id }, data: { status: "OPEN" } });
      await audit(tx, user, "AttendancePeriod", p.id, "REOPEN", { status: "LOCKED" }, { status: "OPEN" }, reason);
    });
    return "Period reopened (logged).";
  }, ["/periods", "/payroll"]);
}
