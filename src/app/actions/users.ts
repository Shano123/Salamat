"use server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requirePermission, requireUser } from "@/lib/auth";
import { ActionState, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { parseDateISO } from "@/lib/domain/time";

const PRIVILEGED: Role[] = ["SUPER_ADMIN", "HR_ADMIN", "HR_VIEWER"];

function checkPassword(p: string) {
  if (p.length < 10) throw new Error("Password must be at least 10 characters.");
}

export async function saveUser(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requirePermission("users.manage");
    const id = optStr(fd, "id");
    const role = str(fd, "role") as Role;
    if (PRIVILEGED.includes(role) && actor.role !== "SUPER_ADMIN") throw new Error("Only the Super Admin can grant HR or admin roles.");
    const employeeId = optStr(fd, "employeeId");
    const password = str(fd, "password");
    if (password || !id) checkPassword(password);
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.user.findUniqueOrThrow({ where: { id } });
        if (PRIVILEGED.includes(before.role) && actor.role !== "SUPER_ADMIN") throw new Error("Only the Super Admin can change HR or admin users.");
        if (id === actor.id && role !== before.role) throw new Error("You cannot change your own role.");
        const after = await tx.user.update({ where: { id }, data: { role, employeeId, ...(passwordHash ? { passwordHash } : {}) } });
        await audit(tx, actor, "User", id, "UPDATE", { role: before.role, employeeId: before.employeeId }, { role: after.role, employeeId: after.employeeId, passwordReset: !!password });
      } else {
        const created = await tx.user.create({ data: { email: str(fd, "email").toLowerCase(), role, employeeId, passwordHash: passwordHash! } });
        await audit(tx, actor, "User", created.id, "CREATE", null, { email: created.email, role });
      }
    });
    return password ? "User saved. The new password works from the next sign-in." : "User saved.";
  }, "/users");
}

/** Any signed-in user changes their own password. */
export async function changeOwnPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireUser();
    const current = str(fd, "current");
    const next = str(fd, "next");
    if (next !== str(fd, "confirm")) throw new Error("The new passwords do not match.");
    checkPassword(next);
    const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new Error("Your current password is incorrect.");
    if (current === next) throw new Error("Choose a password different from the current one.");
    await db.user.update({ where: { id: actor.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
    await audit(db, actor, "User", actor.id, "CHANGE_OWN_PASSWORD");
    return "Password changed.";
  });
}

export async function addDelegation(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireUser();
    const isHr = actor.role === "HR_ADMIN" || actor.role === "SUPER_ADMIN";
    const fromUserId = isHr ? str(fd, "fromUserId") || actor.id : actor.id;
    if (!isHr && !["DEPT_MANAGER", "LINE_MANAGER"].includes(actor.baseRole)) throw new Error("Only managers can delegate.");
    const toUserId = str(fd, "toUserId");
    if (toUserId === fromUserId) throw new Error("Choose a different deputy.");
    const start = str(fd, "startDate");
    const end = str(fd, "endDate");
    if (!start || !end || end < start) throw new Error("Invalid date range.");
    const d = await db.delegation.create({ data: { fromUserId, toUserId, startDate: parseDateISO(start), endDate: parseDateISO(end) } });
    await audit(db, actor, "Delegation", d.id, "CREATE", null, d);
    return "Delegation saved. The deputy acts with your rights for those dates; every action is logged with their name.";
  }, "/users");
}

export async function removeDelegation(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const actor = await requireUser();
    const d = await db.delegation.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (d.fromUserId !== actor.id && actor.role !== "HR_ADMIN" && actor.role !== "SUPER_ADMIN") throw new Error("Not allowed.");
    await db.delegation.delete({ where: { id: d.id } });
    await audit(db, actor, "Delegation", d.id, "DELETE", d, null);
    return "Delegation removed.";
  }, "/users");
}
