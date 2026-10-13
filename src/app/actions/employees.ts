"use server";
import bcrypt from "bcryptjs";
import { ClockMethod, EmployeeStatus } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ActionState, bool, num, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { cellToDateISO } from "@/lib/domain/rosterImport";
import { parseDateISO } from "@/lib/domain/time";
import { readSheet } from "@/lib/excel";
import { parseWeekend } from "@/lib/weekdays";

const skillsOf = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);

export async function saveEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("employees.edit");
    const id = optStr(fd, "id");
    const pin = str(fd, "kioskPin");
    if (pin && !/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4–8 digits.");
    const data = {
      employeeNo: str(fd, "employeeNo"),
      nameEn: str(fd, "nameEn"),
      nameAr: str(fd, "nameAr"),
      homeDepartmentId: str(fd, "homeDepartmentId"),
      jobTitle: str(fd, "jobTitle"),
      contractHours: num(fd, "contractHours", 48),
      weekendDays: fd.getAll("weekendDays").map(Number),
      skills: skillsOf(str(fd, "skills")),
      licenseNo: optStr(fd, "licenseNo"),
      licenseExpiry: optStr(fd, "licenseExpiry") ? parseDateISO(str(fd, "licenseExpiry")) : null,
      isClinical: bool(fd, "isClinical"),
      ramadanHours: bool(fd, "ramadanHours"),
      clockMethod: str(fd, "clockMethod") as ClockMethod,
      lineManagerId: optStr(fd, "lineManagerId"),
      workLocationId: optStr(fd, "workLocationId"),
      status: (str(fd, "status") || "ACTIVE") as EmployeeStatus,
      ...(pin ? { kioskPin: await bcrypt.hash(pin, 10) } : {}),
      ...(bool(fd, "resetDevices") ? { boundDevices: [] } : {}),
    };
    if (!data.employeeNo || !data.nameEn || !data.nameAr || !data.jobTitle) throw new Error("Employee number, names and job title are required.");
    if (data.lineManagerId && data.lineManagerId === id) throw new Error("An employee cannot be their own line manager.");
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.employee.findUniqueOrThrow({ where: { id } });
        const after = await tx.employee.update({ where: { id }, data });
        await audit(tx, user, "Employee", id, "UPDATE", { ...before, kioskPin: undefined }, { ...after, kioskPin: undefined });
      } else {
        const created = await tx.employee.create({ data });
        await audit(tx, user, "Employee", created.id, "CREATE", null, { ...created, kioskPin: undefined });
      }
    });
    return "Employee saved.";
  }, "/employees");
}

const COLS = ["employee_no", "name_en", "name_ar", "department_code", "job_title", "work_location", "contract_hours", "weekend_days", "skills", "license_no", "license_expiry", "line_manager_no", "is_clinical", "clock_method", "email"];

export async function importEmployees(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("employees.edit");
    const file = fd.get("file") as File | null;
    if (!file || !file.size) throw new Error("Choose a file.");
    const apply = str(fd, "apply") === "1";
    const rows = await readSheet(file);
    const header = (rows[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
    const col = (k: string) => header.indexOf(k);
    const missing = ["employee_no", "name_en", "name_ar", "department_code", "job_title"].filter((k) => col(k) < 0);
    if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}. Expected: ${COLS.join(", ")}.`);
    const depts = new Map((await db.department.findMany()).map((d) => [d.code.toUpperCase(), d.id]));
    const locs = new Map((await db.location.findMany()).map((l) => [l.name.toLowerCase(), l.id]));
    const errors: string[] = [];
    const parsed: Array<{ row: number; data: Record<string, unknown>; manager: string; email: string }> = [];
    const seen = new Set<string>();
    rows.slice(1).forEach((r, i) => {
      const row = i + 2;
      const get = (k: string) => (col(k) >= 0 ? String(r[col(k)] ?? "").trim() : "");
      if (r.every((c) => String(c ?? "").trim() === "")) return;
      try {
        const no = get("employee_no");
        if (!no) throw new Error("employee_no is empty");
        if (seen.has(no)) throw new Error(`duplicate employee_no ${no}`);
        seen.add(no);
        const dept = depts.get(get("department_code").toUpperCase());
        if (!dept) throw new Error(`unknown department_code "${get("department_code")}"`);
        const loc = get("work_location");
        if (loc && !locs.has(loc.toLowerCase())) throw new Error(`unknown work_location "${loc}"`);
        const expiryRaw = col("license_expiry") >= 0 ? r[col("license_expiry")] : null;
        const expiry = expiryRaw ? cellToDateISO(expiryRaw) : null;
        if (expiryRaw && !expiry) throw new Error(`invalid license_expiry "${expiryRaw}"`);
        const hours = get("contract_hours") ? Number(get("contract_hours")) : 48;
        if (!Number.isFinite(hours)) throw new Error("contract_hours is not a number");
        const method = (get("clock_method") || "BOTH").toUpperCase();
        if (!["FINGERPRINT", "MOBILE", "BOTH"].includes(method)) throw new Error(`clock_method must be FINGERPRINT, MOBILE or BOTH`);
        if (!get("name_en") || !get("name_ar") || !get("job_title")) throw new Error("name_en, name_ar and job_title are required");
        parsed.push({
          row,
          manager: get("line_manager_no"),
          email: get("email").toLowerCase(),
          data: {
            employeeNo: no,
            nameEn: get("name_en"),
            nameAr: get("name_ar"),
            homeDepartmentId: dept,
            jobTitle: get("job_title"),
            workLocationId: loc ? locs.get(loc.toLowerCase()) : null,
            contractHours: hours,
            weekendDays: parseWeekend(get("weekend_days")),
            skills: skillsOf(get("skills")),
            licenseNo: get("license_no") || null,
            licenseExpiry: expiry ? parseDateISO(expiry) : null,
            isClinical: ["yes", "true", "1", "y"].includes(get("is_clinical").toLowerCase()),
            clockMethod: method,
          },
        });
      } catch (e) {
        errors.push(`Row ${row}: ${e instanceof Error ? e.message : e}`);
      }
    });
    const known = new Set([...seen, ...(await db.employee.findMany({ select: { employeeNo: true } })).map((e) => e.employeeNo)]);
    for (const p of parsed) if (p.manager && !known.has(p.manager)) errors.push(`Row ${p.row}: unknown line_manager_no "${p.manager}"`);
    if (errors.length) return { error: `${errors.length} problem(s); nothing was imported.\n${errors.slice(0, 30).join("\n")}` };
    if (!apply) return { ok: `${parsed.length} row(s) valid. Click Import to save.` };

    const defaultPassword = await bcrypt.hash(str(fd, "initialPassword") || "ChangeMe!2026", 10);
    await db.$transaction(
      async (tx) => {
        for (const p of parsed) {
          const no = p.data.employeeNo as string;
          const e = await tx.employee.upsert({ where: { employeeNo: no }, create: p.data as never, update: p.data as never });
          if (p.email && !(await tx.user.findUnique({ where: { email: p.email } }))) {
            await tx.user.create({ data: { email: p.email, passwordHash: defaultPassword, role: "EMPLOYEE", employeeId: e.id } });
          }
        }
        for (const p of parsed) {
          if (!p.manager) continue;
          const mgr = await tx.employee.findUniqueOrThrow({ where: { employeeNo: p.manager } });
          await tx.employee.update({ where: { employeeNo: p.data.employeeNo as string }, data: { lineManagerId: mgr.id } });
        }
        await audit(tx, user, "Employee", "bulk", "IMPORT", null, { file: file.name, rows: parsed.length });
      },
      { timeout: 120_000 },
    );
    return `Imported ${parsed.length} employee(s).`;
  }, "/employees");
}
