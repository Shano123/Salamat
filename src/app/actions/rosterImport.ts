"use server";
import ExcelJS from "exceljs";
import { audit } from "@/lib/audit";
import { canManageDepartment, requireUser } from "@/lib/auth";
import { ActionState, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { RosterAssignment } from "@/lib/domain/conflicts";
import { can } from "@/lib/domain/permissions";
import { Cell, CellError, parseRosterSheet, planImport } from "@/lib/domain/rosterImport";
import { parseDateISO, toDateISO, weekStartOf } from "@/lib/domain/time";
import { readSheet } from "@/lib/excel";
import { notifyEmployees } from "@/lib/notify";
import { recalcMany } from "@/lib/services/attendance";
import { checkDepartmentRoster } from "@/lib/services/roster";

export interface RosterImportResult {
  layout: string;
  from: string | null;
  to: string | null;
  rows: number;
  create: number;
  replace: number;
  skipped: number;
  touchesPublished: boolean;
  errors: CellError[];
  warnings: string[];
  applied: boolean;
  errorReport?: string; // base64 xlsx
}

async function errorReport(rows: Cell[][], errors: CellError[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Roster");
  rows.forEach((r) => ws.addRow(r.map((c) => (c instanceof Date ? toDateISO(c) : c ?? ""))));
  for (const e of errors) {
    const cell = ws.getCell(e.row, e.col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
    cell.note = e.message;
  }
  const log = wb.addWorksheet("Errors");
  log.addRow(["Row", "Column", "Error"]);
  errors.forEach((e) => log.addRow([e.row, e.col, e.message]));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer).toString("base64");
}

export async function importRoster(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const departmentId = str(fd, "departmentId");
    const mode = str(fd, "mode") === "REPLACE" ? "REPLACE" : "MERGE";
    const apply = str(fd, "apply") === "1";
    const reason = str(fd, "reason");
    const file = fd.get("file") as File | null;
    if (!can(user.role, "roster.import") || !canManageDepartment(user, departmentId)) throw new Error("You can only import for your own department.");
    if (!file || !file.size) throw new Error("Choose an Excel or CSV file.");

    const sheet = await readSheet(file, /duty\s*roster|^roster$/i);
    const [employees, templates, locations] = await Promise.all([
      db.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true, employeeNo: true, homeDepartmentId: true } }),
      db.shiftTemplate.findMany({ where: { status: "APPROVED", OR: [{ ownerDepartmentId: departmentId }, { ownerDepartmentId: null }] } }),
      db.location.findMany({ select: { id: true, name: true } }),
    ]);
    const parsed = parseRosterSheet(sheet, {
      departmentId,
      employees: employees.map((e) => ({ id: e.id, employeeNo: e.employeeNo, departmentId: e.homeDepartmentId })),
      templates: templates.map((t) => ({ id: t.id, code: t.code })),
      locations,
    });
    const result: RosterImportResult = { layout: parsed.layout, from: parsed.from, to: parsed.to, rows: sheet.length - 1, create: 0, replace: 0, skipped: 0, touchesPublished: false, errors: [...parsed.errors], warnings: [], applied: false };

    if (parsed.from && parsed.to) {
      const existing = await db.shiftAssignment.findMany({
        where: { departmentId, isOpenShift: false, date: { gte: parseDateISO(parsed.from), lte: parseDateISO(parsed.to) } },
      });
      const plan = planImport(
        parsed.assignments,
        existing.map((e) => ({ id: e.id, employeeId: e.employeeId, date: toDateISO(e.date), status: e.status })),
        mode,
      );
      Object.assign(result, { create: plan.create.length, replace: plan.replace.length, skipped: plan.skipped.length, touchesPublished: plan.touchesPublished });

      // Same checks as the grid, on the state after import, before anything is saved.
      const add: RosterAssignment[] = [...plan.create, ...plan.replace.map((r) => r.next)].map((a) => ({ key: a.key, employeeId: a.employeeId, date: a.date, templateId: a.templateId, departmentId }));
      const { conflicts } = await checkDepartmentRoster(departmentId, parsed.from, parsed.to, { add, removeIds: plan.replace.map((r) => r.existing.id) });
      const byKey = new Map(parsed.assignments.map((a) => [a.key, a]));
      const byEmpDate = new Map(parsed.assignments.map((a) => [`${a.employeeId}|${a.date}`, a]));
      for (const c of conflicts) {
        const cell = (c.assignmentKey && byKey.get(c.assignmentKey)) || (c.employeeId ? byEmpDate.get(`${c.employeeId}|${c.date}`) : undefined);
        if (c.severity === "blocking" && cell) result.errors.push({ row: cell.row, col: cell.col, message: c.message });
        else result.warnings.push(c.message);
      }
      if (plan.touchesPublished && !reason) result.errors.push({ row: 1, col: 1, message: "Replacing a published week needs a reason (affected employees are notified)." });

      if (apply && !result.errors.length) {
        const touched = await db.$transaction(
          async (tx) => {
            const batch = await tx.rosterImportBatch.create({
              data: { departmentId, uploadedById: user.id, fileName: file.name, layout: parsed.layout, mode, fromDate: parseDateISO(parsed.from!), toDate: parseDateISO(parsed.to!), rowCount: result.rows, status: plan.touchesPublished ? "APPLIED" : "DRAFT", snapshot: plan.replace.map((r) => existing.find((e) => e.id === r.existing.id)) as never },
            });
            const published = new Map<string, boolean>();
            const isPub = async (date: string) => {
              const w = weekStartOf(date);
              if (!published.has(w)) {
                const p = await tx.rosterPeriod.findUnique({ where: { departmentId_weekStart: { departmentId, weekStart: parseDateISO(w) } } });
                published.set(w, p?.status === "PUBLISHED");
              }
              return published.get(w)!;
            };
            for (const a of plan.create) {
              await tx.shiftAssignment.create({
                data: { employeeId: a.employeeId, date: parseDateISO(a.date), templateId: a.templateId, departmentId, locationId: a.locationId, status: "DRAFT", importBatchId: batch.id },
              });
            }
            const notified: Array<{ employeeId: string; date: string }> = [];
            for (const { existing: ex, next } of plan.replace) {
              const before = existing.find((e) => e.id === ex.id)!;
              const pub = ex.status === "PUBLISHED" || (await isPub(next.date));
              const after = await tx.shiftAssignment.update({
                where: { id: ex.id },
                data: { templateId: next.templateId, locationId: next.locationId ?? before.locationId, version: { increment: 1 }, importBatchId: batch.id },
              });
              await audit(tx, user, "ShiftAssignment", ex.id, "UPDATE", before, after, pub ? reason : `import ${file.name}`);
              if (pub) notified.push({ employeeId: ex.employeeId, date: next.date });
            }
            await audit(tx, user, "RosterImportBatch", batch.id, "IMPORT", null, { file: file.name, from: parsed.from, to: parsed.to, rows: result.rows, create: plan.create.length, replace: plan.replace.length, mode }, reason || null);
            if (notified.length) {
              await notifyEmployees(tx, [...new Set(notified.map((n) => n.employeeId))], { type: "SHIFT_CHANGED", title: "Your published shifts changed", body: reason, link: "/me/schedule" });
            }
            return notified;
          },
          { timeout: 120_000 },
        );
        if (touched.length) await recalcMany(touched);
        result.applied = true;
      }
    }
    if (result.errors.length) result.errorReport = await errorReport(sheet, result.errors);
    return {
      ok: result.applied ? `Imported: ${result.create} new, ${result.replace} replaced, ${result.skipped} skipped. Review in the grid, then publish.` : result.errors.length ? "Fix the errors and re-upload." : "Preview ready. Nothing is saved yet.",
      data: result,
    };
  }, ["/roster", "/roster/import"]);
}

export async function undoRosterImport(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const id = str(fd, "batchId");
    await db.$transaction(async (tx) => {
      const batch = await tx.rosterImportBatch.findUniqueOrThrow({ where: { id } });
      if (!canManageDepartment(user, batch.departmentId)) throw new Error("Not allowed.");
      if (batch.status !== "DRAFT") throw new Error("Only imports that are still in draft can be undone.");
      const created = await tx.shiftAssignment.findMany({ where: { importBatchId: id } });
      if (created.some((a) => a.status === "PUBLISHED")) throw new Error("Part of this import is already published; change those cells in the grid instead.");
      const snapshot = (batch.snapshot as Array<{ id: string; templateId: string; locationId: string | null }> | null) ?? [];
      const restoredIds = new Set(snapshot.map((s) => s.id));
      for (const s of snapshot) await tx.shiftAssignment.update({ where: { id: s.id }, data: { templateId: s.templateId, locationId: s.locationId, importBatchId: null, version: { increment: 1 } } });
      await tx.shiftAssignment.deleteMany({ where: { importBatchId: id, id: { notIn: [...restoredIds] } } });
      await tx.rosterImportBatch.update({ where: { id }, data: { status: "UNDONE" } });
      await audit(tx, user, "RosterImportBatch", id, "UNDO", null, { removed: created.length - restoredIds.size, restored: restoredIds.size });
    });
    return "Import undone.";
  }, ["/roster", "/roster/import"]);
}
