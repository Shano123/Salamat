"use server";
import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { canManageDepartment, requirePermission } from "@/lib/auth";
import { ActionState, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/domain/payroll";
import { buildEmployeeMap } from "@/lib/domain/employeeNo";
import { DEFAULT_MAPPING, parsePunchRows, PunchMapping } from "@/lib/domain/punchImport";
import { localDateISO, toDateISO } from "@/lib/domain/time";
import { readSheet } from "@/lib/excel";
import { notifyRole } from "@/lib/notify";
import { recalcMany } from "@/lib/services/attendance";
import { lockedRanges } from "@/lib/services/periods";
import { getRules } from "@/lib/settings";

export interface PunchImportResult {
  step: "columns" | "preview" | "applied";
  headers: string[];
  mappings: Array<{ name: string; mapping: PunchMapping }>;
  ok?: number;
  duplicates?: number;
  errors?: Array<{ row: number; message: string }>;
  sample?: Array<{ employeeNo: string; time: string; type: string | null }>;
  errorCsv?: string;
}

export async function importPunches(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("punches.import");
    const isHr = user.role === "HR_ADMIN" || user.role === "SUPER_ADMIN";
    const step = str(fd, "step") as "columns" | "preview" | "apply";
    const file = fd.get("file") as File | null;
    if (!file || !file.size) throw new Error("Choose a file.");
    const sheet = await readSheet(file, /raw\s*punch|punch/i);
    const headers = (sheet[0] ?? []).map((h) => String(h ?? "").trim());
    const saved = await db.columnMapping.findMany({ where: { kind: "PUNCH" }, orderBy: { name: "asc" } });
    const mappings = saved.map((m) => ({ name: m.name, mapping: m.mapping as unknown as PunchMapping }));
    const result: PunchImportResult = { step: "columns", headers, mappings };
    if (step === "columns") return { ok: `${sheet.length - 1} row(s), ${headers.length} column(s). Map the columns.`, data: result };

    const mapping: PunchMapping = JSON.parse(str(fd, "mapping") || JSON.stringify(DEFAULT_MAPPING));
    const brand = str(fd, "brand");
    if (brand && str(fd, "saveMapping") === "on") {
      await db.columnMapping.upsert({ where: { kind_name: { kind: "PUNCH", name: brand } }, create: { kind: "PUNCH", name: brand, mapping: mapping as unknown as Prisma.InputJsonValue }, update: { mapping: mapping as unknown as Prisma.InputJsonValue } });
    }
    const rules = await getRules();
    const deptId = isHr ? null : str(fd, "departmentId");
    if (!isHr && (!deptId || !canManageDepartment(user, deptId))) throw new Error("Department managers import for their own department only.");
    const employees = await db.employee.findMany({ where: deptId ? { homeDepartmentId: deptId } : {}, select: { id: true, employeeNo: true } });
    const empMap = buildEmployeeMap(employees.map((e) => ({ employeeNo: e.employeeNo, value: e.id })));
    const timestamps = await db.punch.findMany({ where: { employeeId: { in: employees.map((e) => e.id) } }, select: { employeeId: true, timestamp: true } });
    const preview = parsePunchRows(headers, sheet.slice(1), mapping, {
      tz: rules.timezone,
      employees: empMap,
      lockedRanges: await lockedRanges(),
      existingKeys: new Set(timestamps.map((p) => `${p.employeeId}|${p.timestamp.toISOString()}`)),
    });
    Object.assign(result, {
      step: "preview",
      ok: preview.ok.length,
      duplicates: preview.duplicates.length,
      errors: preview.errors.slice(0, 1000).map((e) => ({ row: e.row, message: e.message })),
      sample: preview.ok.slice(0, 10).map((p) => ({ employeeNo: p.employeeNo, time: p.timestamp.toISOString(), type: p.type })),
      errorCsv: preview.errors.length ? toCsv([...headers, "ERROR"], preview.errors.map((e) => [...e.raw.map((c) => (c instanceof Date ? c.toISOString() : (c as string | number | null))), `Row ${e.row}: ${e.message}`])) : undefined,
    });
    if (step === "preview") return { ok: "Preview ready. Duplicates are skipped, never double-counted.", data: result };

    if (!preview.ok.length) throw new Error("No valid rows to import.");
    const devices = await db.device.findMany({ select: { id: true, serialNo: true, name: true } });
    const deviceId = (d: string | null) => (d ? devices.find((x) => x.serialNo === d || x.name === d)?.id ?? null : null);
    if (!isHr) {
      const batch = await db.punchImportBatch.create({
        data: {
          uploadedById: user.id, fileName: file.name, brand: brand || null, rowCount: sheet.length - 1, okCount: preview.ok.length, errorCount: preview.errors.length, dupCount: preview.duplicates.length,
          status: "DRAFT", departmentId: deptId,
          pending: preview.ok.map((p) => ({ employeeId: p.employeeId, timestamp: p.timestamp.toISOString(), type: p.type, device: p.device })) as Prisma.InputJsonValue,
        },
      });
      await audit(db, user, "PunchImportBatch", batch.id, "IMPORT_PENDING", null, { file: file.name, ok: preview.ok.length });
      await notifyRole(db, ["HR_ADMIN"], { type: "PUNCH_IMPORT_REVIEW", title: "Punch import waiting for approval", body: `${file.name}: ${preview.ok.length} punches`, link: "/punches/import" });
      return { ok: `${preview.ok.length} punch(es) sent to HR for approval. They count once approved.`, data: { ...result, step: "applied" } };
    }
    const batch = await db.$transaction(
      async (tx) => {
        const b = await tx.punchImportBatch.create({
          data: { uploadedById: user.id, fileName: file.name, brand: brand || null, rowCount: sheet.length - 1, okCount: preview.ok.length, errorCount: preview.errors.length, dupCount: preview.duplicates.length, status: "APPLIED" },
        });
        await tx.punch.createMany({
          data: preview.ok.map((p) => ({ employeeId: p.employeeId, timestamp: p.timestamp, type: p.type, source: "EXCEL_IMPORT" as const, deviceId: deviceId(p.device), importBatchId: b.id })),
          skipDuplicates: true,
        });
        await audit(tx, user, "PunchImportBatch", b.id, "IMPORT", null, { file: file.name, ok: preview.ok.length, errors: preview.errors.length, duplicates: preview.duplicates.length });
        return b;
      },
      { timeout: 120_000 },
    );
    await recalcMany(preview.ok.map((p) => ({ employeeId: p.employeeId, date: localDateISO(p.timestamp, rules.timezone) })));
    return { ok: `Imported ${preview.ok.length} punch(es) (batch ${batch.id.slice(-6)}). Attendance recalculated for the affected days.`, data: { ...result, step: "applied" } };
  }, "/punches/import");
}

export async function decidePunchBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("periods.lock"); // HR only
    const batch = await db.punchImportBatch.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (batch.status !== "DRAFT") throw new Error("Batch is not pending.");
    if (str(fd, "decision") !== "APPROVE") {
      await db.punchImportBatch.update({ where: { id: batch.id }, data: { status: "UNDONE" } });
      await audit(db, user, "PunchImportBatch", batch.id, "REJECT", null, null);
      return "Batch rejected.";
    }
    const rules = await getRules();
    const pending = (batch.pending as Array<{ employeeId: string; timestamp: string; type: "IN" | "OUT" | "BREAK_START" | "BREAK_END" | null }>) ?? [];
    const locked = await lockedRanges();
    const rows = pending.filter((p) => {
      const d = localDateISO(new Date(p.timestamp), rules.timezone);
      return !locked.some((r) => d >= r.from && d <= r.to);
    });
    await db.$transaction(async (tx) => {
      await tx.punch.createMany({ data: rows.map((p) => ({ employeeId: p.employeeId, timestamp: new Date(p.timestamp), type: p.type, source: "EXCEL_IMPORT" as const, importBatchId: batch.id })), skipDuplicates: true });
      await tx.punchImportBatch.update({ where: { id: batch.id }, data: { status: "APPLIED", pending: Prisma.JsonNull } });
      await audit(tx, user, "PunchImportBatch", batch.id, "APPROVE", null, { punches: rows.length });
    });
    await recalcMany(rows.map((p) => ({ employeeId: p.employeeId, date: localDateISO(new Date(p.timestamp), rules.timezone) })));
    return `Approved ${rows.length} punch(es).`;
  }, "/punches/import");
}

export async function undoPunchBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("periods.lock");
    const batch = await db.punchImportBatch.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { punches: { select: { employeeId: true, timestamp: true } } } });
    if (batch.status !== "APPLIED") throw new Error("Only applied batches can be undone.");
    const rules = await getRules();
    const locked = await lockedRanges();
    const days = batch.punches.map((p) => ({ employeeId: p.employeeId, date: localDateISO(p.timestamp, rules.timezone) }));
    if (days.some((d) => locked.some((r) => d.date >= r.from && d.date <= r.to))) throw new Error("Part of this batch is in a locked period; reopen it first.");
    await db.$transaction(async (tx) => {
      await tx.punch.deleteMany({ where: { importBatchId: batch.id } });
      await tx.punchImportBatch.update({ where: { id: batch.id }, data: { status: "UNDONE" } });
      await audit(tx, user, "PunchImportBatch", batch.id, "UNDO", { punches: batch.punches.length }, null);
    });
    await recalcMany(days);
    return `Removed ${batch.punches.length} punch(es) and recalculated.`;
  }, "/punches/import");
}

/** Template in the fingerprint device's raw export layout (Raw Punch sheet): one row per punch, no IN/OUT type. */
export async function punchTemplateCsv(): Promise<string> {
  const d = toDateISO(new Date());
  const day = new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return toCsv(["EmpID", "Day", "Date", "Time", "Date and Time"], [
    ["91070", day, d, "07:58:12", `${d} 07:58:12`],
    ["91070", day, d, "16:01:40", `${d} 16:01:40`],
  ]);
}
