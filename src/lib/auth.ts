import "server-only";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { Action, activeDelegatorIds, can, isCompanyWide, RoleName, withDescendants } from "./domain/permissions";
import { toDateISO } from "./domain/time";
import { SESSION_COOKIE, verifySession } from "./session";

const RANK: Record<RoleName, number> = {
  EMPLOYEE: 0,
  LINE_MANAGER: 1,
  DEPT_MANAGER: 2,
  HR_VIEWER: 3,
  HR_ADMIN: 4,
  SUPER_ADMIN: 5,
};

export interface CurrentUser {
  id: string;
  email: string;
  /** Own role. */
  baseRole: RoleName;
  /** Effective role, including rights delegated to this user for today. */
  role: RoleName;
  locale: "en" | "ar";
  employeeId: string | null;
  employeeName: string;
  homeDepartmentId: string | null;
  /** Departments this user manages (with descendants and delegations), or ALL. */
  departments: string[] | "ALL";
  /** Employees this user line-manages (direct reports, including delegations). */
  teamEmployeeIds: string[];
  delegatedFrom: string[];
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const uid = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const user = await db.user.findUnique({
    where: { id: uid },
    include: { employee: true, scopes: true },
  });
  if (!user) return null;

  const today = toDateISO(new Date());
  const delegations = await db.delegation.findMany({
    where: { toUserId: uid, startDate: { lte: new Date(today) }, endDate: { gte: new Date(today) } },
  });
  const delegatorIds = activeDelegatorIds(
    uid,
    delegations.map((d) => ({ fromUserId: d.fromUserId, toUserId: d.toUserId, startDate: toDateISO(d.startDate), endDate: toDateISO(d.endDate) })),
    today,
  );
  const delegators = delegatorIds.length
    ? await db.user.findMany({ where: { id: { in: delegatorIds } }, include: { scopes: true } })
    : [];

  let role = user.role as RoleName;
  for (const d of delegators) if (RANK[d.role as RoleName] > RANK[role] && !isCompanyWide(d.role as RoleName)) role = d.role as RoleName;

  let departments: string[] | "ALL" = "ALL";
  if (!isCompanyWide(role)) {
    const allDepts = await db.department.findMany({ select: { id: true, parentId: true } });
    const direct = [...user.scopes, ...delegators.flatMap((d) => d.scopes)].map((s) => s.departmentId);
    departments = role === "EMPLOYEE" ? [] : withDescendants(direct, allDepts);
  }

  const managerEmployeeIds = [user.employeeId, ...delegators.map((d) => d.employeeId)].filter(Boolean) as string[];
  const team = managerEmployeeIds.length
    ? await db.employee.findMany({ where: { lineManagerId: { in: managerEmployeeIds } }, select: { id: true } })
    : [];

  return {
    id: user.id,
    email: user.email,
    baseRole: user.role as RoleName,
    role,
    locale: user.locale === "ar" ? "ar" : "en",
    employeeId: user.employeeId,
    employeeName: user.employee ? (user.locale === "ar" ? user.employee.nameAr : user.employee.nameEn) : user.email,
    homeDepartmentId: user.employee?.homeDepartmentId ?? null,
    departments,
    teamEmployeeIds: team.map((t) => t.id),
    delegatedFrom: delegatorIds,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
  }
}

export async function requirePermission(action: Action): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.role, action)) throw new ForbiddenError();
  return u;
}

/** For pages: render a 403 notice instead of throwing. */
export async function pageGuard(action: Action): Promise<CurrentUser | null> {
  const u = await requireUser();
  return can(u.role, action) ? u : null;
}

export function canManageDepartment(u: CurrentUser, departmentId: string): boolean {
  if (u.role === "HR_ADMIN" || u.role === "SUPER_ADMIN") return true;
  return u.departments !== "ALL" && u.departments.includes(departmentId) && (u.role === "DEPT_MANAGER" || u.role === "LINE_MANAGER");
}

export function canViewDepartment(u: CurrentUser, departmentId: string): boolean {
  return u.departments === "ALL" || u.departments.includes(departmentId);
}

/** Row-level scope: which employees a user may see. */
export function employeeScope(u: CurrentUser): Prisma.EmployeeWhereInput {
  if (u.departments === "ALL") return {};
  if (u.role === "EMPLOYEE") return { id: u.employeeId ?? "__none__" };
  const or: Prisma.EmployeeWhereInput[] = [{ id: { in: u.teamEmployeeIds } }];
  if (u.employeeId) or.push({ id: u.employeeId });
  if (u.role === "DEPT_MANAGER") or.push({ homeDepartmentId: { in: u.departments } });
  else if (u.departments.length) or.push({ homeDepartmentId: { in: u.departments } });
  return { OR: or };
}

/** Departments a user can pick in department selectors. */
export async function visibleDepartments(u: CurrentUser) {
  return db.department.findMany({
    where: u.departments === "ALL" ? {} : { id: { in: u.departments.length ? u.departments : u.homeDepartmentId ? [u.homeDepartmentId] : [] } },
    orderBy: [{ nameEn: "asc" }],
  });
}
