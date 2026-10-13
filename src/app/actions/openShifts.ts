"use server";
import { audit } from "@/lib/audit";
import { canManageDepartment, requireUser } from "@/lib/auth";
import { ActionState, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { parseDateISO, toDateISO } from "@/lib/domain/time";
import { departmentManagerUserIds, notifyEmployees, notifyUsers } from "@/lib/notify";

export async function postOpenShift(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const departmentId = str(fd, "departmentId");
    if (!can(user.role, "roster.publish") || !canManageDepartment(user, departmentId)) throw new Error("Only the department manager can post open shifts.");
    const t = await db.shiftTemplate.findUniqueOrThrow({ where: { id: str(fd, "templateId") } });
    if (t.status !== "APPROVED") throw new Error("Shift template is not approved.");
    const count = Math.min(10, Math.max(1, Number(str(fd, "count") || 1)));
    await db.$transaction(async (tx) => {
      const dept = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });
      for (let i = 0; i < count; i++) {
        const os = await tx.openShift.create({
          data: { departmentId, date: parseDateISO(str(fd, "date")), templateId: t.id, locationId: dept.locationId, note: optStr(fd, "note"), requiredSkill: optStr(fd, "requiredSkill"), createdById: user.id },
        });
        await audit(tx, user, "OpenShift", os.id, "CREATE", null, os);
      }
      const eligible = await tx.employee.findMany({
        where: { status: "ACTIVE", OR: [{ homeDepartmentId: departmentId }, { homeDepartment: { isFloatPool: true } }] },
        select: { id: true },
      });
      await notifyEmployees(tx, eligible.map((e) => e.id), { type: "OPEN_SHIFT", title: `Open shift: ${t.code} on ${str(fd, "date")}`, body: `${dept.nameEn} needs cover.`, link: "/open-shifts" });
    });
    return `${count} open shift(s) posted.`;
  }, "/open-shifts");
}

export async function claimOpenShift(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    if (!user.employeeId) throw new Error("Your account is not linked to an employee.");
    const os = await db.openShift.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (os.status !== "OPEN") throw new Error("This shift is no longer open.");
    const emp = await db.employee.findUniqueOrThrow({ where: { id: user.employeeId }, include: { homeDepartment: true } });
    if (emp.homeDepartmentId !== os.departmentId && !emp.homeDepartment.isFloatPool) throw new Error("You are not eligible for this department.");
    if (os.requiredSkill && !emp.skills.includes(os.requiredSkill)) throw new Error(`This shift needs ${os.requiredSkill}.`);
    const clash = await db.shiftAssignment.findFirst({ where: { employeeId: emp.id, date: os.date, template: { type: { not: "OFF" } } } });
    if (clash) throw new Error("You already have a shift that day.");
    await db.openShiftClaim.upsert({ where: { openShiftId_employeeId: { openShiftId: os.id, employeeId: emp.id } }, create: { openShiftId: os.id, employeeId: emp.id }, update: { status: "PENDING" } });
    await notifyUsers(db, await departmentManagerUserIds(db, os.departmentId), { type: "OPEN_SHIFT_CLAIM", title: `${emp.nameEn} claimed an open shift`, body: toDateISO(os.date), link: "/open-shifts" });
    return "Claimed. Your manager will confirm.";
  }, "/open-shifts");
}

export async function decideClaim(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const claim = await db.openShiftClaim.findUniqueOrThrow({ where: { id: str(fd, "claimId") }, include: { openShift: true } });
    const os = claim.openShift;
    if (!canManageDepartment(user, os.departmentId)) throw new Error("Not allowed.");
    if (os.status !== "OPEN") throw new Error("This shift is no longer open.");
    const approve = str(fd, "decision") === "APPROVE";
    await db.$transaction(async (tx) => {
      if (!approve) {
        await tx.openShiftClaim.update({ where: { id: claim.id }, data: { status: "REJECTED" } });
        return;
      }
      const emp = await tx.employee.findUniqueOrThrow({ where: { id: claim.employeeId } });
      const t = await tx.shiftTemplate.findUniqueOrThrow({ where: { id: os.templateId } });
      if (t.isClinical && emp.licenseExpiry && emp.licenseExpiry < os.date) throw new Error(`${emp.nameEn}'s license has expired.`);
      const a = await tx.shiftAssignment.create({
        data: { employeeId: emp.id, date: os.date, templateId: os.templateId, departmentId: os.departmentId, locationId: os.locationId, status: "PUBLISHED", loanStatus: emp.homeDepartmentId !== os.departmentId ? "ACCEPTED" : null },
      });
      await tx.openShiftClaim.update({ where: { id: claim.id }, data: { status: "APPROVED" } });
      await tx.openShiftClaim.updateMany({ where: { openShiftId: os.id, id: { not: claim.id } }, data: { status: "REJECTED" } });
      await tx.openShift.update({ where: { id: os.id }, data: { status: "FILLED", filledById: emp.id } });
      await audit(tx, user, "ShiftAssignment", a.id, "CREATE", null, a, `Open shift ${os.id} filled`);
      await notifyEmployees(tx, [emp.id], { type: "SHIFT_CHANGED", title: `Open shift confirmed: ${toDateISO(os.date)}`, body: t.code, link: "/me/schedule" });
    });
    return approve ? "Claim approved; the shift is on the roster." : "Claim rejected.";
  }, ["/open-shifts", "/roster"]);
}

export async function cancelOpenShift(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const os = await db.openShift.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (!canManageDepartment(user, os.departmentId)) throw new Error("Not allowed.");
    await db.openShift.update({ where: { id: os.id }, data: { status: "CANCELLED" } });
    await audit(db, user, "OpenShift", os.id, "CANCEL", os, { status: "CANCELLED" });
    return "Open shift cancelled.";
  }, "/open-shifts");
}
