export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  HR_VIEWER: "HR Viewer",
  DEPT_MANAGER: "Department Manager",
  LINE_MANAGER: "Line Manager",
  EMPLOYEE: "Employee",
};

export const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;
