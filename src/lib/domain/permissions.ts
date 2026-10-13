// Permission matrix from the PRD ("Roles and permissions").

export type RoleName = "SUPER_ADMIN" | "HR_ADMIN" | "HR_VIEWER" | "DEPT_MANAGER" | "LINE_MANAGER" | "EMPLOYEE";

export type Action =
  | "departments.edit"
  | "rules.edit"
  | "templates.edit"
  | "templates.approve"
  | "roster.view"
  | "roster.edit"
  | "roster.publish"
  | "roster.editPublished"
  | "roster.import"
  | "requests.approve"
  | "attendance.view"
  | "attendance.correct"
  | "periods.lock"
  | "payroll.export"
  | "reports.view"
  | "locations.edit"
  | "locations.view"
  | "employees.edit"
  | "employees.view"
  | "punches.import"
  | "users.manage"
  | "audit.view"
  | "clock"
  | "requests.create";

const ALL: RoleName[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_VIEWER", "DEPT_MANAGER", "LINE_MANAGER", "EMPLOYEE"];
const HR: RoleName[] = ["SUPER_ADMIN", "HR_ADMIN"];
const MANAGERS: RoleName[] = [...HR, "DEPT_MANAGER", "LINE_MANAGER"];

const MATRIX: Record<Action, RoleName[]> = {
  "departments.edit": HR,
  "rules.edit": HR,
  "templates.edit": [...HR, "DEPT_MANAGER"],
  "templates.approve": HR,
  "roster.view": [...MANAGERS, "HR_VIEWER"],
  "roster.edit": MANAGERS, // line managers edit their team's draft only
  "roster.publish": [...HR, "DEPT_MANAGER"],
  "roster.editPublished": [...HR, "DEPT_MANAGER"],
  "roster.import": [...HR, "DEPT_MANAGER"],
  "requests.approve": MANAGERS,
  "attendance.view": ALL,
  "attendance.correct": MANAGERS,
  "periods.lock": HR,
  "payroll.export": HR,
  "reports.view": [...MANAGERS, "HR_VIEWER"],
  "locations.edit": HR,
  "locations.view": [...HR, "HR_VIEWER", "DEPT_MANAGER"],
  "employees.edit": HR,
  "employees.view": [...MANAGERS, "HR_VIEWER"],
  "punches.import": [...HR, "DEPT_MANAGER"],
  "users.manage": HR,
  "audit.view": [...HR, "HR_VIEWER"],
  clock: ALL,
  "requests.create": ALL,
};

export function can(role: RoleName, action: Action): boolean {
  return MATRIX[action].includes(role);
}

export function isCompanyWide(role: RoleName): boolean {
  return role === "SUPER_ADMIN" || role === "HR_ADMIN" || role === "HR_VIEWER";
}

export interface DeptNode {
  id: string;
  parentId: string | null;
}

/** Expands department ids to include all their descendants (sub-departments and teams). */
export function withDescendants(ids: string[], all: DeptNode[]): string[] {
  const children = new Map<string, string[]>();
  for (const d of all) {
    if (!d.parentId) continue;
    children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  const out = new Set<string>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return [...out];
}

export interface DelegationLike {
  fromUserId: string;
  toUserId: string;
  startDate: string;
  endDate: string;
}

export function activeDelegatorIds(userId: string, delegations: DelegationLike[], today: string): string[] {
  return delegations
    .filter((d) => d.toUserId === userId && d.startDate <= today && d.endDate >= today)
    .map((d) => d.fromUserId);
}

/** Published-roster edits within this window need a reason and immediate notification. */
export function needsEditReason(shiftStart: Date, now: Date, editNoticeHours: number): boolean {
  return shiftStart.getTime() - now.getTime() < editNoticeHours * 3600_000;
}
