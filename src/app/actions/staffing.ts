"use server";
import { audit } from "@/lib/audit";
import { canManageDepartment, requirePermission } from "@/lib/auth";
import { ActionState, num, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";

export async function addStaffing(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("templates.edit");
    const departmentId = str(fd, "departmentId");
    if (!canManageDepartment(user, departmentId)) throw new Error("Not allowed for this department.");
    const minCount = num(fd, "minCount");
    if (minCount < 1) throw new Error("Minimum must be at least 1.");
    const row = await db.staffingRequirement.create({
      data: { departmentId, templateId: str(fd, "templateId"), skill: optStr(fd, "skill")?.toUpperCase() ?? null, minCount },
    });
    await audit(db, user, "StaffingRequirement", row.id, "CREATE", null, row);
    return "Minimum staffing rule added.";
  }, "/staffing");
}

export async function removeStaffing(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("templates.edit");
    const row = await db.staffingRequirement.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (!canManageDepartment(user, row.departmentId)) throw new Error("Not allowed for this department.");
    await db.staffingRequirement.delete({ where: { id: row.id } });
    await audit(db, user, "StaffingRequirement", row.id, "DELETE", row, null);
    return "Removed.";
  }, "/staffing");
}
