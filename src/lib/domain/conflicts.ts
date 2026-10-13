import { CompanyRulesLike, dailyLimitHours, weeklyLimitHours } from "./rules";
import { scheduledMinutes, spanOf, TemplateLike } from "./shift";
import { addDays, DAY_MIN, diffDays, weekStartOf } from "./time";

export type ConflictKind =
  | "UNKNOWN_TEMPLATE"
  | "TEMPLATE_NOT_APPROVED"
  | "OVERLAP"
  | "REST"
  | "DAILY_HOURS"
  | "WEEKLY_HOURS"
  | "ON_LEAVE"
  | "UNDERSTAFFED"
  | "MISSING_SKILL"
  | "LICENSE_EXPIRED";

/** blocking: cannot publish. override: L2 may publish with a reason. warning: shown, not blocking. */
export type ConflictSeverity = "blocking" | "override" | "warning";

export const SEVERITY: Record<ConflictKind, ConflictSeverity> = {
  UNKNOWN_TEMPLATE: "blocking",
  TEMPLATE_NOT_APPROVED: "blocking",
  OVERLAP: "blocking",
  LICENSE_EXPIRED: "blocking",
  UNDERSTAFFED: "override",
  REST: "warning",
  DAILY_HOURS: "warning",
  WEEKLY_HOURS: "warning",
  ON_LEAVE: "warning",
  MISSING_SKILL: "warning",
};

export interface Conflict {
  kind: ConflictKind;
  severity: ConflictSeverity;
  date: string;
  employeeId?: string;
  templateId?: string;
  assignmentKey?: string;
  message: string;
}

export interface RosterEmployee {
  id: string;
  name: string;
  skills: string[];
  licenseExpiry?: string | null;
  ramadanHours?: boolean;
}

export interface RosterAssignment {
  key: string; // id or a temporary key for unsaved/imported rows
  employeeId: string;
  date: string;
  templateId: string;
  departmentId: string;
}

export interface StaffingRule {
  templateId: string;
  skill?: string | null;
  minCount: number;
}

export interface LeaveSpan {
  employeeId: string;
  from: string;
  to: string;
}

export interface RosterCheckInput {
  rules: CompanyRulesLike;
  departmentId: string;
  /** Dates being checked (e.g. the week or the import range). */
  dates: string[];
  employees: Map<string, RosterEmployee>;
  templates: Map<string, TemplateLike>;
  /** Assignments for the checked employees, including neighbouring days and other departments. */
  assignments: RosterAssignment[];
  leave: LeaveSpan[];
  staffing: StaffingRule[];
}

interface Placed {
  a: RosterAssignment;
  t: TemplateLike;
  start: number; // absolute minutes from base date
  end: number;
}

export function checkRoster(input: RosterCheckInput): Conflict[] {
  const { rules, dates, employees, templates, assignments, leave, staffing, departmentId } = input;
  if (!dates.length) return [];
  const inRange = new Set(dates);
  const base = addDays(dates[0], -7);
  const out: Conflict[] = [];
  const push = (c: Omit<Conflict, "severity">) => out.push({ ...c, severity: SEVERITY[c.kind] });
  const name = (id: string) => employees.get(id)?.name ?? id;

  const byEmployee = new Map<string, Placed[]>();
  for (const a of assignments) {
    const t = templates.get(a.templateId);
    const relevant = inRange.has(a.date);
    if (!t) {
      if (relevant) push({ kind: "UNKNOWN_TEMPLATE", date: a.date, employeeId: a.employeeId, assignmentKey: a.key, message: "Unknown shift code." });
      continue;
    }
    if (relevant && a.departmentId === departmentId) {
      if (t.status && t.status !== "APPROVED") {
        push({ kind: "TEMPLATE_NOT_APPROVED", date: a.date, employeeId: a.employeeId, templateId: t.id, assignmentKey: a.key, message: `Shift ${t.code} is not approved by HR.` });
      }
      const emp = employees.get(a.employeeId);
      if (emp && t.type !== "OFF") {
        if (t.isClinical && emp.licenseExpiry && emp.licenseExpiry < a.date) {
          push({ kind: "LICENSE_EXPIRED", date: a.date, employeeId: a.employeeId, assignmentKey: a.key, message: `${emp.name}'s professional license expired on ${emp.licenseExpiry}.` });
        }
        const missing = (t.requiredSkills ?? []).filter((s) => !emp.skills.includes(s));
        if (missing.length) {
          push({ kind: "MISSING_SKILL", date: a.date, employeeId: a.employeeId, assignmentKey: a.key, message: `${emp.name} lacks ${missing.join(", ")} for ${t.code}.` });
        }
      }
      if (t.type !== "OFF" && leave.some((l) => l.employeeId === a.employeeId && a.date >= l.from && a.date <= l.to)) {
        push({ kind: "ON_LEAVE", date: a.date, employeeId: a.employeeId, assignmentKey: a.key, message: `${name(a.employeeId)} is on approved leave.` });
      }
    }
    const span = spanOf(t);
    if (!span) continue;
    const offset = diffDays(base, a.date) * DAY_MIN;
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push({ a, t, start: offset + span[0], end: offset + span[1] });
    byEmployee.set(a.employeeId, list);
  }

  const minRest = rules.minRestHours * 60;
  for (const [employeeId, list] of byEmployee) {
    list.sort((x, y) => x.start - y.start);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (!inRange.has(cur.a.date) && !inRange.has(prev.a.date)) continue;
      if (cur.a.departmentId !== departmentId && prev.a.departmentId !== departmentId) continue;
      const date = inRange.has(cur.a.date) ? cur.a.date : prev.a.date;
      const key = inRange.has(cur.a.date) ? cur.a.key : prev.a.key;
      if (cur.start < prev.end) {
        push({ kind: "OVERLAP", date, employeeId, assignmentKey: key, message: `${name(employeeId)}: ${prev.t.code} (${prev.a.date}) overlaps ${cur.t.code} (${cur.a.date}).` });
      } else if (cur.start - prev.end < minRest && prev.t.type !== "ON_CALL" && cur.t.type !== "ON_CALL") {
        const gap = ((cur.start - prev.end) / 60).toFixed(1);
        push({ kind: "REST", date, employeeId, assignmentKey: key, message: `${name(employeeId)} has only ${gap}h rest before ${cur.t.code} (minimum ${rules.minRestHours}h).` });
      }
    }

    const emp = employees.get(employeeId);
    const ramadan = emp?.ramadanHours ?? true;
    const perDay = new Map<string, number>();
    for (const p of list) perDay.set(p.a.date, (perDay.get(p.a.date) ?? 0) + scheduledMinutes(p.t));
    for (const [date, mins] of perDay) {
      if (!inRange.has(date)) continue;
      const limit = dailyLimitHours(date, rules, ramadan);
      if (mins / 60 > limit) {
        push({ kind: "DAILY_HOURS", date, employeeId, message: `${name(employeeId)} is scheduled ${(mins / 60).toFixed(1)}h on ${date} (limit ${limit}h).` });
      }
    }
    const weeks = new Set(dates.map((d) => weekStartOf(d)));
    for (const ws of weeks) {
      const weekDates = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      const mins = weekDates.reduce((s, d) => s + (perDay.get(d) ?? 0), 0);
      const limit = weeklyLimitHours(weekDates, rules, ramadan);
      if (mins / 60 > limit) {
        push({ kind: "WEEKLY_HOURS", date: ws, employeeId, message: `${name(employeeId)} is scheduled ${(mins / 60).toFixed(1)}h in the week of ${ws} (limit ${limit}h).` });
      }
    }
  }

  for (const date of dates) {
    const onDay = assignments.filter((a) => a.date === date && a.departmentId === departmentId);
    for (const rule of staffing) {
      const count = onDay.filter((a) => {
        if (a.templateId !== rule.templateId) return false;
        if (!rule.skill) return true;
        return employees.get(a.employeeId)?.skills.includes(rule.skill) ?? false;
      }).length;
      if (count < rule.minCount) {
        const code = templates.get(rule.templateId)?.code ?? rule.templateId;
        push({ kind: "UNDERSTAFFED", date, templateId: rule.templateId, message: `${code} on ${date}: ${count} of ${rule.minCount} required${rule.skill ? ` ${rule.skill}` : ""}.` });
      }
    }
  }
  return out;
}

export function publishBlockers(conflicts: Conflict[], hasOverride: boolean): Conflict[] {
  return conflicts.filter((c) => c.severity === "blocking" || (c.severity === "override" && !hasOverride));
}
