"use server";
import { DepartmentKind, DepartmentLevel } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ActionState, bool, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { withDescendants } from "@/lib/domain/permissions";

export async function saveDepartment(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("departments.edit");
    const id = optStr(fd, "id");
    const parentId = optStr(fd, "parentId");
    const data = {
      code: str(fd, "code").toUpperCase(),
      nameEn: str(fd, "nameEn"),
      nameAr: str(fd, "nameAr"),
      kind: str(fd, "kind") as DepartmentKind,
      level: str(fd, "level") as DepartmentLevel,
      parentId,
      costCenter: optStr(fd, "costCenter"),
      locationId: optStr(fd, "locationId"),
      isFloatPool: bool(fd, "isFloatPool"),
    };
    if (!data.code || !data.nameEn || !data.nameAr) throw new Error("Code and both names are required.");
    if (id && parentId) {
      const all = await db.department.findMany({ select: { id: true, parentId: true } });
      if (withDescendants([id], all).includes(parentId)) throw new Error("A department cannot be inside itself.");
    }
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.department.findUniqueOrThrow({ where: { id } });
        const after = await tx.department.update({ where: { id }, data });
        await audit(tx, user, "Department", id, "UPDATE", before, after);
      } else {
        const created = await tx.department.create({ data });
        await audit(tx, user, "Department", created.id, "CREATE", null, created);
      }
    });
    return "Department saved.";
  }, "/departments");
}

export async function setManagers(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("departments.edit");
    const departmentId = str(fd, "departmentId");
    const userIds = fd.getAll("userIds").map(String);
    await db.$transaction(async (tx) => {
      const before = await tx.userDepartmentScope.findMany({ where: { departmentId } });
      await tx.userDepartmentScope.deleteMany({ where: { departmentId } });
      if (userIds.length) await tx.userDepartmentScope.createMany({ data: userIds.map((userId) => ({ userId, departmentId })) });
      await audit(tx, user, "Department", departmentId, "SET_MANAGERS", before.map((b) => b.userId), userIds);
    });
    return "Managers updated.";
  }, "/departments");
}
