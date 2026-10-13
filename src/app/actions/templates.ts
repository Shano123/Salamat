"use server";
import { ShiftType } from "@prisma/client";
import { audit } from "@/lib/audit";
import { canManageDepartment, requirePermission } from "@/lib/auth";
import { ActionState, bool, num, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { validateTemplate } from "@/lib/domain/rules";
import { hhmmToMinutes } from "@/lib/domain/time";
import { notifyRole, notifyUsers, departmentManagerUserIds } from "@/lib/notify";
import { getRules } from "@/lib/settings";

const optTime = (fd: FormData, k: string) => (str(fd, k) ? hhmmToMinutes(str(fd, k)) : null);

export async function saveTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("templates.edit");
    const isHr = user.role === "HR_ADMIN" || user.role === "SUPER_ADMIN";
    const id = optStr(fd, "id");
    const ownerDepartmentId = optStr(fd, "ownerDepartmentId");
    if (!ownerDepartmentId && !isHr) throw new Error("Only HR can create company-wide templates.");
    if (ownerDepartmentId && !canManageDepartment(user, ownerDepartmentId)) throw new Error("You can only manage your own department's templates.");
    const type = str(fd, "type") as ShiftType;
    const data = {
      code: str(fd, "code").toUpperCase(),
      name: str(fd, "name"),
      color: str(fd, "color") || "#3b82f6",
      type,
      startMin: type === "OFF" ? 0 : hhmmToMinutes(str(fd, "start")),
      endMin: type === "OFF" ? 0 : hhmmToMinutes(str(fd, "end")),
      split2StartMin: type === "SPLIT" ? optTime(fd, "split2Start") : null,
      split2EndMin: type === "SPLIT" ? optTime(fd, "split2End") : null,
      coreStartMin: type === "FLEXIBLE" ? optTime(fd, "coreStart") : null,
      coreEndMin: type === "FLEXIBLE" ? optTime(fd, "coreEnd") : null,
      totalHours: type === "FLEXIBLE" ? num(fd, "totalHours") : null,
      breakMin: num(fd, "breakMin"),
      paidBreak: bool(fd, "paidBreak"),
      graceInMin: num(fd, "graceInMin", 10),
      graceOutMin: num(fd, "graceOutMin", 0),
      overnight: bool(fd, "overnight"),
      isClinical: bool(fd, "isClinical"),
      isRamadan: bool(fd, "isRamadan"),
      payCode: optStr(fd, "payCode"),
      requiredSkills: str(fd, "requiredSkills").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
      ownerDepartmentId,
    };
    if (!data.name) throw new Error("Name is required.");
    const rules = await getRules();
    const errors = validateTemplate({ id: id ?? "new", ...data }, rules);
    if (errors.length) throw new Error(`Blocked by company rules: ${errors.join(" ")}`);
    const status = isHr ? "APPROVED" : "PENDING";
    const saved = await db.$transaction(async (tx) => {
      const dup = await tx.shiftTemplate.findFirst({ where: { code: data.code, ownerDepartmentId, ...(id ? { id: { not: id } } : {}) } });
      if (dup) throw new Error(`Code ${data.code} is already used.`);
      if (id) {
        const before = await tx.shiftTemplate.findUniqueOrThrow({ where: { id } });
        if (before.ownerDepartmentId !== ownerDepartmentId && !isHr) throw new Error("Cannot move a template between departments.");
        const after = await tx.shiftTemplate.update({ where: { id }, data: { ...data, status, reviewedById: isHr ? user.id : null, reviewNote: null } });
        await audit(tx, user, "ShiftTemplate", id, "UPDATE", before, after);
        return after;
      }
      const created = await tx.shiftTemplate.create({ data: { ...data, status, reviewedById: isHr ? user.id : null } });
      await audit(tx, user, "ShiftTemplate", created.id, "CREATE", null, created);
      return created;
    });
    if (!isHr) await notifyRole(db, ["HR_ADMIN"], { type: "TEMPLATE_REVIEW", title: `Shift template ${saved.code} needs approval`, body: saved.name, link: "/templates?status=PENDING" });
    return isHr ? "Template saved and approved." : "Template saved. HR must approve it before it can be used on a roster.";
  }, "/templates");
}

export async function reviewTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("templates.approve");
    const id = str(fd, "id");
    const decision = str(fd, "decision") as "APPROVED" | "REJECTED" | "DISABLED";
    if (!["APPROVED", "REJECTED", "DISABLED"].includes(decision)) throw new Error("Invalid decision.");
    const note = optStr(fd, "note");
    if (decision !== "APPROVED" && !note) throw new Error("Add a note explaining why.");
    const rules = await getRules();
    await db.$transaction(async (tx) => {
      const before = await tx.shiftTemplate.findUniqueOrThrow({ where: { id } });
      if (decision === "APPROVED") {
        const errors = validateTemplate({ ...before, type: before.type, status: before.status }, rules);
        if (errors.length) throw new Error(`Template breaks company rules: ${errors.join(" ")}`);
      }
      const after = await tx.shiftTemplate.update({ where: { id }, data: { status: decision, reviewedById: user.id, reviewNote: note } });
      await audit(tx, user, "ShiftTemplate", id, decision, before, after, note);
      if (before.ownerDepartmentId) {
        await notifyUsers(tx, await departmentManagerUserIds(tx, before.ownerDepartmentId), { type: "TEMPLATE_REVIEWED", title: `Template ${before.code} ${decision.toLowerCase()}`, body: note ?? "", link: "/templates" });
      }
    });
    return `Template ${decision.toLowerCase()}.`;
  }, "/templates");
}
