import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { shiftWindow } from "../domain/shift";
import { addDays, localDateISO, parseDateISO, toDateISO } from "../domain/time";
import { getRules } from "../settings";
import { approvedLeave, toTemplateLike } from "./attendance";

export type LiveState = "IN" | "OUT" | "LATE_IN" | "LATE_NOT_IN" | "NOT_YET" | "ABSENT" | "ON_LEAVE" | "MISSING_OUT";

export interface LiveRow {
  assignmentId: string;
  employeeId: string;
  employeeNo: string;
  name: string;
  nameAr: string;
  department: string;
  departmentId: string;
  location: string;
  code: string;
  color: string;
  start: Date;
  end: Date;
  firstIn: Date | null;
  lastOut: Date | null;
  state: LiveState;
}

/** Who is in, late or absent right now, for shifts that started today or are still running. */
export async function liveBoard(employeeWhere: Prisma.EmployeeWhereInput, now = new Date()): Promise<LiveRow[]> {
  const rules = await getRules();
  const tz = rules.timezone;
  const today = localDateISO(now, tz);
  const assignments = await db.shiftAssignment.findMany({
    where: {
      status: "PUBLISHED",
      isOpenShift: false,
      date: { gte: parseDateISO(addDays(today, -1)), lte: parseDateISO(today) },
      employee: employeeWhere,
      template: { type: { not: "OFF" } },
    },
    include: { employee: true, template: true, department: true, location: true },
  });
  const ids = [...new Set(assignments.map((a) => a.employeeId))];
  const punches = await db.punch.findMany({
    where: { employeeId: { in: ids }, timestamp: { gte: parseDateISO(addDays(today, -2)) } },
    orderBy: { timestamp: "asc" },
  });
  const leave = await approvedLeave(ids, today, today);
  const rows: LiveRow[] = [];
  for (const a of assignments) {
    const date = toDateISO(a.date);
    const t = toTemplateLike(a.template);
    const w = shiftWindow(date, t, a.location?.timezone ?? tz);
    if (!w) continue;
    if (date !== today && w.end < now) continue; // yesterday's shift already over
    const own = punches.filter(
      (p) => p.employeeId === a.employeeId && (p.assignmentId === a.id || (!p.assignmentId && p.timestamp >= new Date(w.start.getTime() - 4 * 3600_000) && p.timestamp <= new Date(w.end.getTime() + 4 * 3600_000))),
    );
    const firstIn = own.find((p) => p.type === "IN" || p.type === null)?.timestamp ?? null;
    const outs = own.filter((p) => p.type === "OUT");
    const lastOut = outs.length ? outs[outs.length - 1].timestamp : null;
    const graceEnd = new Date(w.start.getTime() + t.graceInMin * 60_000);
    let state: LiveState;
    if (leave.some((l) => l.employeeId === a.employeeId && today >= l.from && today <= l.to)) state = "ON_LEAVE";
    else if (firstIn && lastOut && lastOut > firstIn) state = "OUT";
    else if (firstIn) state = now > w.end ? "MISSING_OUT" : firstIn > graceEnd ? "LATE_IN" : "IN";
    else if (t.type === "ON_CALL") continue;
    else if (now > w.end) state = "ABSENT";
    else if (now > graceEnd) state = "LATE_NOT_IN";
    else state = "NOT_YET";
    rows.push({
      assignmentId: a.id,
      employeeId: a.employeeId,
      employeeNo: a.employee.employeeNo,
      name: a.employee.nameEn,
      nameAr: a.employee.nameAr,
      department: a.department.nameEn,
      departmentId: a.departmentId,
      location: a.location?.name ?? "—",
      code: a.template.code,
      color: a.template.color,
      start: w.start,
      end: w.end,
      firstIn,
      lastOut,
      state,
    });
  }
  return rows.sort((x, y) => x.start.getTime() - y.start.getTime());
}
