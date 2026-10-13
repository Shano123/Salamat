"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { canManageDepartment, CurrentUser, requireUser } from "@/lib/auth";
import { ActionState, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { publishBlockers } from "@/lib/domain/conflicts";
import { can } from "@/lib/domain/permissions";
import { applyRotation as rotate, bulkAssign as bulk, parsePattern } from "@/lib/domain/rotation";
import { addDays, dateRange, localDateISO, parseDateISO, toDateISO, weekStartOf } from "@/lib/domain/time";
import { notifyEmployees, notifyUsers, departmentManagerUserIds } from "@/lib/notify";
import { recalcMany } from "@/lib/services/attendance";
import { checkDepartmentRoster } from "@/lib/services/roster";
import { getRules } from "@/lib/settings";

type Tx = Prisma.TransactionClient;

async function weekPublished(tx: Tx | typeof db, departmentId: string, date: string): Promise<boolean> {
  const p = await tx.rosterPeriod.findUnique({ where: { departmentId_weekStart: { departmentId, weekStart: parseDateISO(weekStartOf(date)) } } });
  return p?.status === "PUBLISHED";
}

function assertCanEdit(user: CurrentUser, departmentId: string, employeeId: string, published: boolean) {
  if (!can(user.role, "roster.edit")) throw new Error("You cannot edit rosters.");
  if (user.role === "LINE_MANAGER") {
    if (published) throw new Error("Line managers can only edit drafts. Submit a change request instead.");
    if (!user.teamEmployeeIds.includes(employeeId)) throw new Error("Line managers can only roster their own team.");
    return;
  }
  if (!canManageDepartment(user, departmentId)) throw new Error("You can only roster your own department.");
  if (published && !can(user.role, "roster.editPublished")) throw new Error("You cannot change a published roster.");
}

async function assertTemplateUsable(tx: Tx, templateId: string, departmentId: string, employeeId: string, date: string) {
  const t = await tx.shiftTemplate.findUniqueOrThrow({ where: { id: templateId } });
  if (t.status !== "APPROVED") throw new Error(`Shift ${t.code} is not approved by HR yet.`);
  if (t.ownerDepartmentId && t.ownerDepartmentId !== departmentId) throw new Error(`Shift ${t.code} belongs to another department.`);
  if (t.isClinical) {
    const e = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
    if (e.licenseExpiry && toDateISO(e.licenseExpiry) < date) {
      throw new Error(`${e.nameEn}'s professional license expired on ${toDateISO(e.licenseExpiry)}; they cannot be rostered on a clinical shift.`);
    }
  }
  return t;
}

/** Sets or clears one roster cell (employee × date) in a department. */
export async function setCell(input: { departmentId: string; employeeId: string; date: string; templateId: string | null; reason?: string | null; locationId?: string | null }): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const { departmentId, employeeId, date, templateId } = input;
    const reason = input.reason?.trim() || null;
    const result = await db.$transaction(async (tx) => {
      const published = await weekPublished(tx, departmentId, date);
      assertCanEdit(user, departmentId, employeeId, published);
      const existing = await tx.shiftAssignment.findFirst({ where: { departmentId, employeeId, date: parseDateISO(date), isOpenShift: false } });
      const touchesPublished = published || existing?.status === "PUBLISHED";
      if (touchesPublished && !reason) throw new Error("A reason is required to change a published roster.");
      if (templateId) await assertTemplateUsable(tx, templateId, departmentId, employeeId, date);
      const dept = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });

      if (!templateId) {
        if (!existing) return null;
        await tx.attendanceRecord.deleteMany({ where: { assignmentId: existing.id, locked: false } });
        await tx.punch.updateMany({ where: { assignmentId: existing.id }, data: { assignmentId: null } });
        await tx.shiftAssignment.delete({ where: { id: existing.id } });
        await audit(tx, user, "ShiftAssignment", existing.id, "DELETE", existing, null, reason);
      } else if (existing) {
        if (existing.templateId === templateId) return existing;
        const after = await tx.shiftAssignment.update({ where: { id: existing.id }, data: { templateId, locationId: input.locationId ?? existing.locationId, version: { increment: 1 } } });
        await audit(tx, user, "ShiftAssignment", existing.id, "UPDATE", existing, after, reason);
      } else {
        const created = await tx.shiftAssignment.create({
          data: {
            employeeId,
            date: parseDateISO(date),
            templateId,
            departmentId,
            locationId: input.locationId ?? dept.locationId,
            status: published ? "PUBLISHED" : "DRAFT",
          },
        });
        await audit(tx, user, "ShiftAssignment", created.id, "CREATE", null, created, reason);
      }
      if (touchesPublished) {
        await notifyEmployees(tx, [employeeId], {
          type: "SHIFT_CHANGED",
          title: `Your shift on ${date} changed`,
          body: reason ?? "",
          link: "/me/schedule",
        });
      }
      return touchesPublished;
    });
    if (result) await recalcMany([{ employeeId, date }]);
    return "Saved.";
  }, "/roster");
}

export async function bulkAssign(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const departmentId = str(fd, "departmentId");
    const employeeIds = fd.getAll("employeeIds").map(String);
    const from = str(fd, "from");
    const to = str(fd, "to") || from;
    const days = fd.getAll("dow").map(Number);
    const templateId = str(fd, "templateId");
    if (!employeeIds.length) throw new Error("Choose at least one employee.");
    const dates = dateRange(from, to).filter((d) => !days.length || days.includes(parseDateISO(d).getUTCDay()));
    if (dates.length > 92) throw new Error("Bulk assign covers at most 3 months.");
    const n = await writeDrafts(user, departmentId, bulk(employeeIds, dates, templateId), str(fd, "mode") === "REPLACE");
    return `${n} shift(s) assigned as draft.`;
  }, "/roster");
}

export async function applyRotation(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const departmentId = str(fd, "departmentId");
    const employeeIds = fd.getAll("employeeIds").map(String);
    const templates = await db.shiftTemplate.findMany({ where: { status: "APPROVED", OR: [{ ownerDepartmentId: departmentId }, { ownerDepartmentId: null }] } });
    const { pattern, errors } = parsePattern(str(fd, "pattern"), new Map(templates.map((t) => [t.code.toUpperCase(), t.id])));
    if (errors.length) throw new Error(errors.join(" "));
    const weeks = Math.min(12, Math.max(1, Number(str(fd, "weeks") || 1)));
    const items = rotate({ employeeIds, start: str(fd, "start"), weeks, pattern, staggerDays: Number(str(fd, "stagger") || 0) });
    const n = await writeDrafts(user, departmentId, items, str(fd, "mode") === "REPLACE");
    return `${n} shift(s) generated as draft for ${weeks} week(s).`;
  }, "/roster");
}

export async function copyLastWeek(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const departmentId = str(fd, "departmentId");
    const weekStart = weekStartOf(str(fd, "weekStart"));
    const prev = addDays(weekStart, -7);
    const last = await db.shiftAssignment.findMany({
      where: { departmentId, isOpenShift: false, date: { gte: parseDateISO(prev), lte: parseDateISO(addDays(prev, 6)) }, OR: [{ loanStatus: null }, { loanStatus: "ACCEPTED" }] },
    });
    if (!last.length) throw new Error("Last week has no shifts to copy.");
    const n = await writeDrafts(
      user,
      departmentId,
      last.map((a) => ({ employeeId: a.employeeId, date: addDays(toDateISO(a.date), 7), templateId: a.templateId })),
      false,
    );
    return `${n} shift(s) copied into empty days.`;
  }, "/roster");
}

/** Writes draft assignments; merge fills empty days only, replace overwrites drafts on those days. */
async function writeDrafts(user: CurrentUser, departmentId: string, items: Array<{ employeeId: string; date: string; templateId: string }>, replace: boolean): Promise<number> {
  return db.$transaction(
    async (tx) => {
      const dept = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });
      let n = 0;
      const checked = new Set<string>();
      for (const it of items) {
        if (await weekPublished(tx, departmentId, it.date)) continue; // published weeks are changed cell by cell with a reason
        assertCanEdit(user, departmentId, it.employeeId, false);
        if (!checked.has(`${it.templateId}|${it.employeeId}`)) {
          await assertTemplateUsable(tx, it.templateId, departmentId, it.employeeId, it.date).catch((e) => {
            if (String(e.message).includes("license")) return; // license issues surface as blocking conflicts
            throw e;
          });
          checked.add(`${it.templateId}|${it.employeeId}`);
        }
        const existing = await tx.shiftAssignment.findFirst({ where: { departmentId, employeeId: it.employeeId, date: parseDateISO(it.date), isOpenShift: false } });
        if (existing) {
          if (!replace || existing.status === "PUBLISHED" || existing.templateId === it.templateId) continue;
          const after = await tx.shiftAssignment.update({ where: { id: existing.id }, data: { templateId: it.templateId, version: { increment: 1 } } });
          await audit(tx, user, "ShiftAssignment", existing.id, "UPDATE", existing, after, "bulk");
        } else {
          const created = await tx.shiftAssignment.create({
            data: { employeeId: it.employeeId, date: parseDateISO(it.date), templateId: it.templateId, departmentId, locationId: dept.locationId, status: "DRAFT" },
          });
          await audit(tx, user, "ShiftAssignment", created.id, "CREATE", null, created, "bulk");
        }
        n++;
      }
      return n;
    },
    { timeout: 60_000 },
  );
}

export async function publishRoster(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const departmentId = str(fd, "departmentId");
    if (!can(user.role, "roster.publish") || !canManageDepartment(user, departmentId)) throw new Error("Only the department manager or HR can publish.");
    const from = weekStartOf(str(fd, "from"));
    const to = addDays(weekStartOf(str(fd, "to") || from), 6);
    const override = optStr(fd, "overrideReason");
    const { conflicts } = await checkDepartmentRoster(departmentId, from, to);
    const blockers = publishBlockers(conflicts, !!override);
    if (blockers.length) {
      const sample = blockers.slice(0, 5).map((c) => c.message).join(" ");
      throw new Error(`Cannot publish: ${blockers.length} blocking conflict(s). ${sample}${blockers.some((b) => b.kind === "UNDERSTAFFED") ? " Below minimum staffing needs an L2 override reason." : ""}`);
    }
    const rules = await getRules();
    const today = localDateISO(new Date(), rules.timezone);
    const affected = await db.$transaction(async (tx) => {
      const drafts = await tx.shiftAssignment.findMany({
        where: { departmentId, status: "DRAFT", date: { gte: parseDateISO(from), lte: parseDateISO(to) }, OR: [{ loanStatus: null }, { loanStatus: "ACCEPTED" }] },
      });
      await tx.shiftAssignment.updateMany({ where: { id: { in: drafts.map((d) => d.id) } }, data: { status: "PUBLISHED" } });
      const batchIds = [...new Set(drafts.map((d) => d.importBatchId).filter((x): x is string => !!x))];
      if (batchIds.length) await tx.rosterImportBatch.updateMany({ where: { id: { in: batchIds }, status: "DRAFT" }, data: { status: "APPLIED" } });
      for (let w = from; w <= to; w = addDays(w, 7)) {
        const period = await tx.rosterPeriod.upsert({
          where: { departmentId_weekStart: { departmentId, weekStart: parseDateISO(w) } },
          create: { departmentId, weekStart: parseDateISO(w), status: "PUBLISHED", publishedById: user.id, publishedAt: new Date(), overrideReason: override },
          update: { status: "PUBLISHED", publishedById: user.id, publishedAt: new Date(), overrideReason: override },
        });
        await audit(tx, user, "RosterPeriod", period.id, "PUBLISH", null, { weekStart: w, shifts: drafts.filter((d) => weekStartOf(toDateISO(d.date)) === w).length }, override);
      }
      const ids = [...new Set(drafts.map((d) => d.employeeId))];
      await notifyEmployees(tx, ids, { type: "ROSTER_PUBLISHED", title: "Your roster is published", body: `${from} → ${to}`, link: "/me/schedule" });
      return drafts;
    });
    const past = affected.filter((a) => toDateISO(a.date) <= today).map((a) => ({ employeeId: a.employeeId, date: toDateISO(a.date) }));
    if (past.length) await recalcMany(past);
    const warnings = conflicts.filter((c) => c.severity === "warning").length;
    return `Published ${affected.length} shift(s) for ${from} → ${to}.${warnings ? ` ${warnings} warning(s) acknowledged.` : ""}`;
  }, ["/roster", "/me/schedule"]);
}

export async function unpublishWeek(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const departmentId = str(fd, "departmentId");
    if (!can(user.role, "roster.publish") || !canManageDepartment(user, departmentId)) throw new Error("Not allowed.");
    const reason = str(fd, "reason");
    if (!reason) throw new Error("A reason is required.");
    const weekStart = weekStartOf(str(fd, "weekStart"));
    await db.$transaction(async (tx) => {
      const p = await tx.rosterPeriod.update({ where: { departmentId_weekStart: { departmentId, weekStart: parseDateISO(weekStart) } }, data: { status: "DRAFT" } });
      await audit(tx, user, "RosterPeriod", p.id, "REOPEN", { status: "PUBLISHED" }, { status: "DRAFT" }, reason);
    });
    return "Week reopened for editing. Published shifts stay visible to employees until you publish again.";
  }, "/roster");
}

/** Home manager offers an employee to another department for one shift; the host manager accepts. */
export async function loanEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const employeeId = str(fd, "employeeId");
    const hostDepartmentId = str(fd, "hostDepartmentId");
    const date = str(fd, "date");
    const templateId = str(fd, "templateId");
    const emp = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { homeDepartment: true } });
    const isFloat = emp.homeDepartment.isFloatPool;
    const hostManages = canManageDepartment(user, hostDepartmentId);
    if (!canManageDepartment(user, emp.homeDepartmentId) && !(isFloat && hostManages)) throw new Error("Only the home department (or the host for float pool staff) can arrange a loan.");
    await db.$transaction(async (tx) => {
      await assertTemplateUsable(tx, templateId, hostDepartmentId, employeeId, date);
      const a = await tx.shiftAssignment.create({
        data: { employeeId, date: parseDateISO(date), templateId, departmentId: hostDepartmentId, status: "DRAFT", loanStatus: hostManages ? "ACCEPTED" : "PENDING" },
      });
      await audit(tx, user, "ShiftAssignment", a.id, "LOAN", null, a);
      if (!hostManages) {
        await notifyUsers(tx, await departmentManagerUserIds(tx, hostDepartmentId), {
          type: "LOAN_OFFER",
          title: `Loan offer: ${emp.nameEn} on ${date}`,
          body: `${emp.homeDepartment.nameEn} offers ${emp.nameEn} for one shift.`,
          link: `/roster?dept=${hostDepartmentId}&week=${weekStartOf(date)}`,
        });
      }
    });
    return hostManages ? "Added to the roster as draft." : "Loan offered; waiting for the host manager to accept.";
  }, "/roster");
}

export async function decideLoan(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const id = str(fd, "assignmentId");
    const accept = str(fd, "decision") === "ACCEPT";
    await db.$transaction(async (tx) => {
      const a = await tx.shiftAssignment.findUniqueOrThrow({ where: { id } });
      if (!canManageDepartment(user, a.departmentId)) throw new Error("Only the host department manager can accept a loan.");
      if (a.loanStatus !== "PENDING") throw new Error("This loan is not pending.");
      if (accept) {
        const after = await tx.shiftAssignment.update({ where: { id }, data: { loanStatus: "ACCEPTED" } });
        await audit(tx, user, "ShiftAssignment", id, "LOAN_ACCEPT", a, after);
      } else {
        await tx.shiftAssignment.delete({ where: { id } });
        await audit(tx, user, "ShiftAssignment", id, "LOAN_DECLINE", a, null);
      }
    });
    return accept ? "Loan accepted." : "Loan declined.";
  }, "/roster");
}

export async function revalidateRoster() {
  revalidatePath("/roster");
}
