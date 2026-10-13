import "server-only";
import { employeeScope, CurrentUser } from "../auth";
import { db } from "../db";
import { PayrollRow } from "../domain/payroll";
import { scheduledMinutes } from "../domain/shift";
import { diffDays, formatTime, parseDateISO, toDateISO } from "../domain/time";
import { getRules } from "../settings";
import { toTemplateLike } from "./attendance";

export const REPORTS = {
  daily: "Daily attendance",
  timesheet: "Monthly timesheet",
  lateness: "Lateness",
  absence: "Absence",
  overtime: "Overtime",
  leave: "Leave balances",
  rosterVsActual: "Roster vs actual",
  scorecard: "Department scorecards",
} as const;
export type ReportKind = keyof typeof REPORTS;

export interface ReportParams {
  from: string;
  to: string;
  departmentId?: string | null;
}

export interface Table {
  headers: string[];
  rows: Array<Array<string | number>>;
}

const h = (m: number) => Math.round((m / 60) * 100) / 100;

async function shifts(user: CurrentUser, p: ReportParams) {
  return db.shiftAssignment.findMany({
    where: {
      status: "PUBLISHED",
      date: { gte: parseDateISO(p.from), lte: parseDateISO(p.to) },
      employee: employeeScope(user),
      ...(p.departmentId ? { departmentId: p.departmentId } : {}),
    },
    include: { employee: { include: { homeDepartment: true } }, template: true, attendance: true, department: true },
    orderBy: [{ date: "asc" }],
  });
}

type ShiftRow = Awaited<ReturnType<typeof shifts>>[number];

interface Agg {
  emp: ShiftRow["employee"];
  shifts: number;
  scheduled: number;
  worked: number;
  late: number;
  lateCount: number;
  early: number;
  overtime: number;
  unapprovedOt: number;
  absent: number;
  leave: number;
  onCall: number;
  missing: number;
  present: number;
}

function aggregate(list: ShiftRow[]): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const s of list) {
    if (s.template.type === "OFF") continue;
    const a = m.get(s.employeeId) ?? { emp: s.employee, shifts: 0, scheduled: 0, worked: 0, late: 0, lateCount: 0, early: 0, overtime: 0, unapprovedOt: 0, absent: 0, leave: 0, onCall: 0, missing: 0, present: 0 };
    a.shifts++;
    a.scheduled += scheduledMinutes(toTemplateLike(s.template));
    const r = s.attendance;
    if (s.template.type === "ON_CALL") a.onCall++;
    if (r) {
      a.worked += r.workedMin;
      a.late += r.lateMin;
      if (r.lateMin) a.lateCount++;
      a.early += r.earlyMin;
      a.overtime += r.overtimeMin;
      a.unapprovedOt += r.unapprovedOvertimeMin;
      if (r.status === "ABSENT") a.absent++;
      if (r.status === "ON_LEAVE") a.leave++;
      if (r.missingPunch) a.missing++;
      if (["PRESENT", "LATE", "EARLY_LEAVE", "LATE_AND_EARLY"].includes(r.status)) a.present++;
    }
    m.set(s.employeeId, a);
  }
  return m;
}

export async function buildReport(kind: ReportKind, user: CurrentUser, p: ReportParams): Promise<Table> {
  if (diffDays(p.from, p.to) > 92) throw new Error("Reports cover at most 3 months.");
  const rules = await getRules();
  const tz = rules.timezone;
  switch (kind) {
    case "daily": {
      const list = await shifts(user, p);
      return {
        headers: ["Date", "Employee No", "Name", "Department", "Shift", "In", "Out", "Worked h", "Late min", "Early min", "OT h (approved)", "Status"],
        rows: list
          .filter((s) => s.template.type !== "OFF")
          .map((s) => [
            toDateISO(s.date),
            s.employee.employeeNo,
            s.employee.nameEn,
            s.department.nameEn,
            s.template.code,
            s.attendance?.firstIn ? formatTime(s.attendance.firstIn, tz) : "",
            s.attendance?.lastOut ? formatTime(s.attendance.lastOut, tz) : "",
            h(s.attendance?.workedMin ?? 0),
            s.attendance?.lateMin ?? 0,
            s.attendance?.earlyMin ?? 0,
            h(s.attendance?.overtimeMin ?? 0),
            s.attendance?.status ?? "SCHEDULED",
          ]),
      };
    }
    case "timesheet":
    case "lateness":
    case "absence":
    case "overtime": {
      const agg = [...aggregate(await shifts(user, p)).values()].sort((a, b) => a.emp.nameEn.localeCompare(b.emp.nameEn));
      const base = (a: Agg) => [a.emp.employeeNo, a.emp.nameEn, a.emp.homeDepartment.nameEn];
      if (kind === "timesheet")
        return {
          headers: ["Employee No", "Name", "Department", "Shifts", "Scheduled h", "Worked h", "Late min", "Early min", "OT h (approved)", "OT h (unapproved)", "Absent", "Leave", "On-call", "Missing punches"],
          rows: agg.map((a) => [...base(a), a.shifts, h(a.scheduled), h(a.worked), a.late, a.early, h(a.overtime), h(a.unapprovedOt), a.absent, a.leave, a.onCall, a.missing]),
        };
      if (kind === "lateness")
        return {
          headers: ["Employee No", "Name", "Department", "Late shifts", "Late minutes", "Early leaves (min)", "Punctuality %"],
          rows: agg.filter((a) => a.lateCount || a.early).map((a) => [...base(a), a.lateCount, a.late, a.early, a.present ? Math.round(((a.present - a.lateCount) / a.present) * 100) : 0]),
        };
      if (kind === "absence")
        return {
          headers: ["Employee No", "Name", "Department", "Scheduled shifts", "Absent", "Missing punches", "Absence %"],
          rows: agg.filter((a) => a.absent || a.missing).map((a) => [...base(a), a.shifts, a.absent, a.missing, Math.round((a.absent / Math.max(1, a.shifts)) * 100)]),
        };
      return {
        headers: ["Employee No", "Name", "Department", "Approved OT h", "Unapproved extra h (not paid)", "Scheduled h", "Worked h"],
        rows: agg.filter((a) => a.overtime || a.unapprovedOt).map((a) => [...base(a), h(a.overtime), h(a.unapprovedOt), h(a.scheduled), h(a.worked)]),
      };
    }
    case "leave": {
      const year = Number(p.from.slice(0, 4));
      const balances = await db.leaveBalance.findMany({
        where: { year, employee: { ...employeeScope(user), ...(p.departmentId ? { homeDepartmentId: p.departmentId } : {}) } },
        include: { employee: { include: { homeDepartment: true } }, leaveType: true },
        orderBy: [{ employee: { nameEn: "asc" } }],
      });
      return {
        headers: ["Employee No", "Name", "Department", "Leave type", "Year", "Entitled", "Used", "Remaining"],
        rows: balances.map((b) => [b.employee.employeeNo, b.employee.nameEn, b.employee.homeDepartment.nameEn, b.leaveType.nameEn, b.year, b.entitled, b.used, Math.round((b.entitled - b.used) * 10) / 10]),
      };
    }
    case "rosterVsActual": {
      const list = await shifts(user, p);
      return {
        headers: ["Date", "Employee No", "Name", "Shift", "Scheduled h", "Worked h", "Difference h", "Status"],
        rows: list
          .filter((s) => s.template.type !== "OFF")
          .map((s) => {
            const sch = scheduledMinutes(toTemplateLike(s.template));
            const w = s.attendance?.workedMin ?? 0;
            return [toDateISO(s.date), s.employee.employeeNo, s.employee.nameEn, s.template.code, h(sch), h(w), h(w - sch), s.attendance?.status ?? "SCHEDULED"];
          }),
      };
    }
    case "scorecard": {
      const list = await shifts(user, p);
      const byDept = new Map<string, { name: string; list: ShiftRow[] }>();
      for (const s of list) {
        const d = byDept.get(s.departmentId) ?? { name: s.department.nameEn, list: [] };
        d.list.push(s);
        byDept.set(s.departmentId, d);
      }
      const periods = await db.rosterPeriod.findMany({
        where: { weekStart: { gte: parseDateISO(p.from), lte: parseDateISO(p.to) }, departmentId: { in: [...byDept.keys()] } },
      });
      const rows: Table["rows"] = [];
      for (const [id, d] of byDept) {
        const agg = [...aggregate(d.list).values()];
        const sum = (k: keyof Agg) => agg.reduce((s, a) => s + (a[k] as number), 0);
        const present = sum("present");
        const shiftsN = sum("shifts") - sum("leave") - sum("onCall");
        const ps = periods.filter((x) => x.departmentId === id);
        const ahead = ps.filter((x) => x.publishedAt && diffDays(toDateISO(x.publishedAt), toDateISO(x.weekStart)) >= rules.publishDeadlineDays).length;
        rows.push([
          d.name,
          sum("shifts"),
          present ? Math.round(((present - sum("lateCount")) / present) * 100) : 0,
          shiftsN ? Math.round((present / shiftsN) * 100) : 0,
          h(sum("overtime")),
          h(sum("unapprovedOt")),
          sum("absent"),
          ps.length ? Math.round((ahead / ps.length) * 100) : 0,
        ]);
      }
      return { headers: ["Department", "Shifts", "Punctuality %", "Roster adherence % (clocked in)", "Approved OT h", "Unapproved extra h", "Absences", `Published ${rules.publishDeadlineDays}+ days ahead %`], rows };
    }
  }
}

/** Rows for the payroll export: approved hours and overtime only. */
export async function payrollRows(user: CurrentUser, p: ReportParams): Promise<PayrollRow[]> {
  const list = await shifts(user, p);
  const agg = aggregate(list);
  const overtimeReqs = await db.request.findMany({ where: { type: "OVERTIME", status: "APPROVED", requesterId: { in: [...agg.keys()] } } });
  const leave = await db.request.findMany({ where: { type: "LEAVE", status: "APPROVED", requesterId: { in: [...agg.keys()] } } });
  return [...agg.values()]
    .sort((a, b) => a.emp.employeeNo.localeCompare(b.emp.employeeNo))
    .map((a) => {
      const toil = overtimeReqs
        .filter((r) => r.requesterId === a.emp.id)
        .map((r) => r.payload as { date: string; minutes: number; compensation: string })
        .filter((x) => x.compensation === "TOIL" && x.date >= p.from && x.date <= p.to)
        .reduce((s, x) => s + x.minutes, 0);
      const toilMin = Math.min(toil, a.overtime);
      const leaveDays = leave
        .filter((r) => r.requesterId === a.emp.id)
        .map((r) => r.payload as { from: string; to: string; days: number })
        .filter((x) => x.to >= p.from && x.from <= p.to)
        .reduce((s, x) => s + x.days, 0);
      return {
        employeeNo: a.emp.employeeNo,
        nameEn: a.emp.nameEn,
        nameAr: a.emp.nameAr,
        department: a.emp.homeDepartment.nameEn,
        costCenter: a.emp.homeDepartment.costCenter ?? "",
        periodStart: p.from,
        periodEnd: p.to,
        scheduledShifts: a.shifts,
        scheduledHours: h(a.scheduled),
        workedHours: h(a.worked),
        overtimeHours: h(a.overtime),
        overtimePaidHours: h(a.overtime - toilMin),
        toilHours: h(toilMin),
        lateMinutes: a.late,
        earlyMinutes: a.early,
        absentDays: a.absent,
        leaveDays,
        onCallShifts: a.onCall,
        missingPunches: a.missing,
      };
    });
}
