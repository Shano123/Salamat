import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient | typeof db;

export interface NotifyInput {
  type: string;
  title: string;
  body: string;
  link?: string;
}

/** In-app notification (push delivery hooks in here once a push provider is configured). */
export async function notifyUsers(tx: Tx, userIds: Array<string | null | undefined>, n: NotifyInput) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await tx.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
}

export async function notifyEmployees(tx: Tx, employeeIds: string[], n: NotifyInput) {
  if (!employeeIds.length) return;
  const users = await tx.user.findMany({ where: { employeeId: { in: employeeIds } }, select: { id: true } });
  await notifyUsers(tx, users.map((u) => u.id), n);
}

export async function notifyRole(tx: Tx, roles: Array<"HR_ADMIN" | "SUPER_ADMIN">, n: NotifyInput) {
  const users = await tx.user.findMany({ where: { role: { in: roles } }, select: { id: true } });
  await notifyUsers(tx, users.map((u) => u.id), n);
}

/** Department managers (L2) of a department. */
export async function departmentManagerUserIds(tx: Tx, departmentId: string): Promise<string[]> {
  const scopes = await tx.userDepartmentScope.findMany({
    where: { departmentId, user: { role: "DEPT_MANAGER" } },
    select: { userId: true },
  });
  return scopes.map((s) => s.userId);
}
