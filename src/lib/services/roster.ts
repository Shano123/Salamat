import "server-only";
import { db } from "../db";
import { checkRoster, Conflict, RosterAssignment, RosterEmployee } from "../domain/conflicts";
import { TemplateLike } from "../domain/shift";
import { addDays, parseDateISO, toDateISO } from "../domain/time";
import { getRules } from "../settings";
import { approvedLeave, toTemplateLike } from "./attendance";

export async function departmentEmployees(departmentId: string) {
  return db.employee.findMany({
    where: { homeDepartmentId: departmentId, status: "ACTIVE" },
    orderBy: [{ jobTitle: "asc" }, { nameEn: "asc" }],
  });
}

/** Templates usable by a department: its own plus company-wide (no owner). */
export async function departmentTemplates(departmentId: string, onlyApproved = false) {
  return db.shiftTemplate.findMany({
    where: {
      OR: [{ ownerDepartmentId: departmentId }, { ownerDepartmentId: null }],
      ...(onlyApproved ? { status: "APPROVED" } : { status: { not: "REJECTED" } }),
    },
    orderBy: [{ startMin: "asc" }, { code: "asc" }],
  });
}

/**
 * Runs all roster checks for a department over a date range. `overrides` lets callers
 * check a proposed state (e.g. an import preview) before anything is saved.
 */
export async function checkDepartmentRoster(
  departmentId: string,
  from: string,
  to: string,
  overrides?: { add: RosterAssignment[]; removeIds: string[]; extraEmployeeIds?: string[] },
): Promise<{ conflicts: Conflict[]; templates: Map<string, TemplateLike> }> {
  const rules = await getRules();
  const home = await departmentEmployees(departmentId);
  const inDept = await db.shiftAssignment.findMany({
    where: { departmentId, date: { gte: parseDateISO(from), lte: parseDateISO(to) } },
    select: { employeeId: true },
  });
  const employeeIds = [...new Set([...home.map((e) => e.id), ...inDept.map((a) => a.employeeId), ...(overrides?.extraEmployeeIds ?? [])])];
  const employees = await db.employee.findMany({ where: { id: { in: employeeIds } } });
  const existing = await db.shiftAssignment.findMany({
    where: { employeeId: { in: employeeIds }, date: { gte: parseDateISO(addDays(from, -7)), lte: parseDateISO(addDays(to, 7)) }, isOpenShift: false },
  });
  const removed = new Set(overrides?.removeIds ?? []);
  const assignments: RosterAssignment[] = [
    ...existing
      .filter((a) => !removed.has(a.id))
      .map((a) => ({ key: a.id, employeeId: a.employeeId, date: toDateISO(a.date), templateId: a.templateId, departmentId: a.departmentId })),
    ...(overrides?.add ?? []),
  ];
  const templateRows = await db.shiftTemplate.findMany({ where: { id: { in: [...new Set(assignments.map((a) => a.templateId))] } } });
  const staffingRows = await db.staffingRequirement.findMany({ where: { departmentId } });
  const staffTemplates = await db.shiftTemplate.findMany({ where: { id: { in: staffingRows.map((s) => s.templateId) } } });
  const templates = new Map<string, TemplateLike>([...templateRows, ...staffTemplates].map((t) => [t.id, toTemplateLike(t)]));
  const empMap = new Map<string, RosterEmployee>(
    employees.map((e) => [
      e.id,
      { id: e.id, name: e.nameEn, skills: e.skills, licenseExpiry: e.licenseExpiry ? toDateISO(e.licenseExpiry) : null, ramadanHours: e.ramadanHours },
    ]),
  );
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const conflicts = checkRoster({
    rules,
    departmentId,
    dates,
    employees: empMap,
    templates,
    assignments,
    leave: await approvedLeave(employeeIds, addDays(from, -7), addDays(to, 7)),
    staffing: staffingRows.map((s) => ({ templateId: s.templateId, skill: s.skill, minCount: s.minCount })),
  });
  return { conflicts, templates };
}
