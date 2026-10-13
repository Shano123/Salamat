import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { computeAttendance, matchPunches, PunchKind } from "../domain/attendance";
import { TemplateLike } from "../domain/shift";
import { addDays, parseDateISO, toDateISO } from "../domain/time";
import { getRules } from "../settings";
import { lockedRanges } from "./periods";

type Tx = Prisma.TransactionClient | typeof db;

export function toTemplateLike(t: {
  id: string;
  code: string;
  type: string;
  startMin: number;
  endMin: number;
  split2StartMin: number | null;
  split2EndMin: number | null;
  coreStartMin: number | null;
  coreEndMin: number | null;
  totalHours: number | null;
  breakMin: number;
  paidBreak: boolean;
  graceInMin: number;
  graceOutMin: number;
  overnight: boolean;
  isClinical: boolean;
  requiredSkills: string[];
  status: string;
}): TemplateLike {
  return { ...t, type: t.type as TemplateLike["type"], status: t.status as TemplateLike["status"] };
}

export interface LeaveSpan {
  employeeId: string;
  from: string;
  to: string;
}

export async function approvedLeave(employeeIds: string[] | null, from: string, to: string, tx: Tx = db): Promise<LeaveSpan[]> {
  const reqs = await tx.request.findMany({
    where: { type: "LEAVE", status: "APPROVED", ...(employeeIds ? { requesterId: { in: employeeIds } } : {}) },
    select: { requesterId: true, payload: true },
  });
  return reqs
    .map((r) => {
      const p = r.payload as { from: string; to: string };
      return { employeeId: r.requesterId, from: p.from, to: p.to };
    })
    .filter((l) => l.to >= from && l.from <= to);
}

/**
 * Recalculates attendance for an employee over a date range: matches punches to the
 * nearest published shift (overnight included) and upserts the AttendanceRecord.
 * Locked records are left untouched.
 */
export async function recalcAttendance(employeeId: string, from: string, to: string, tx: Tx = db, opts: { ignoreLock?: boolean } = {}) {
  const rules = await getRules();
  const tz = rules.timezone;
  const assignments = await tx.shiftAssignment.findMany({
    where: { employeeId, status: "PUBLISHED", date: { gte: parseDateISO(addDays(from, -1)), lte: parseDateISO(addDays(to, 1)) } },
    include: { template: true, attendance: true, location: true },
  });
  if (!assignments.length) return;
  const punches = await tx.punch.findMany({
    where: {
      employeeId,
      timestamp: { gte: parseDateISO(addDays(from, -2)), lte: parseDateISO(addDays(to, 3)) },
    },
    orderBy: { timestamp: "asc" },
  });
  const shifts = assignments.map((a) => ({ id: a.id, date: toDateISO(a.date), template: toTemplateLike(a.template) }));
  const matched = matchPunches(
    punches.map((p) => ({ id: p.id, timestamp: p.timestamp, type: p.type as PunchKind | null })),
    shifts,
    tz,
  );
  for (const p of punches) {
    const m = matched.get(p.id) ?? null;
    if (p.assignmentId !== m) await tx.punch.update({ where: { id: p.id }, data: { assignmentId: m } });
  }

  const leave = await approvedLeave([employeeId], from, to, tx);
  const holidays = await tx.holiday.findMany({ where: { date: { gte: parseDateISO(from), lte: parseDateISO(to) } } });
  const overtime = await tx.request.findMany({ where: { requesterId: employeeId, type: "OVERTIME", status: "APPROVED" } });
  const locked = await lockedRanges(tx);
  const now = new Date();

  for (const a of assignments) {
    const date = toDateISO(a.date);
    if (date < from || date > to) continue;
    const isLocked = a.attendance?.locked || locked.some((r) => date >= r.from && date <= r.to);
    if (isLocked && !opts.ignoreLock) continue;
    const own = punches.filter((p) => matched.get(p.id) === a.id);
    const approvedOvertimeMin = overtime
      .map((r) => r.payload as { date: string; minutes: number; assignmentId?: string })
      .filter((p) => p.assignmentId === a.id || (!p.assignmentId && p.date === date))
      .reduce((s, p) => s + Number(p.minutes || 0), 0);
    const r = computeAttendance({
      date,
      template: toTemplateLike(a.template),
      tz: a.location?.timezone ?? tz,
      punches: own.map((p) => ({ id: p.id, timestamp: p.timestamp, type: p.type as PunchKind | null })),
      now,
      onLeave: leave.some((l) => date >= l.from && date <= l.to),
      isHoliday: holidays.some((h) => toDateISO(h.date) === date && (!h.locationId || h.locationId === a.locationId)),
      approvedOvertimeMin,
      roundingMinutes: rules.roundingMinutes,
    });
    await tx.attendanceRecord.upsert({
      where: { assignmentId: a.id },
      create: { assignmentId: a.id, ...r, calculatedAt: now, locked: !!isLocked },
      update: { ...r, calculatedAt: now },
    });
  }
}

/** Recalculate for every employee with a punch or shift in the range (used after imports). */
export async function recalcMany(pairs: Array<{ employeeId: string; date: string }>, tx: Tx = db) {
  const byEmp = new Map<string, { from: string; to: string }>();
  for (const { employeeId, date } of pairs) {
    const cur = byEmp.get(employeeId);
    byEmp.set(employeeId, {
      from: !cur || addDays(date, -1) < cur.from ? addDays(date, -1) : cur.from,
      to: !cur || date > cur.to ? date : cur.to,
    });
  }
  for (const [employeeId, { from, to }] of byEmp) await recalcAttendance(employeeId, from, to, tx);
}
