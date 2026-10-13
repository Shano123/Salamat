"use server";
import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ActionState, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { PAYROLL_FIELDS, PayrollColumn, PayrollField } from "@/lib/domain/payroll";

export async function savePayrollMapping(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("payroll.export");
    const name = str(fd, "name");
    if (!name) throw new Error("Name the format (e.g. the payroll system).");
    const headers = fd.getAll("header").map(String);
    const fields = fd.getAll("field").map(String);
    const cols: PayrollColumn[] = headers
      .map((header, i) => ({ header: header.trim(), field: fields[i] as PayrollField }))
      .filter((c) => c.header && PAYROLL_FIELDS.includes(c.field));
    if (!cols.length) throw new Error("Add at least one column.");
    const m = await db.columnMapping.upsert({
      where: { kind_name: { kind: "PAYROLL", name } },
      create: { kind: "PAYROLL", name, mapping: cols as unknown as Prisma.InputJsonValue },
      update: { mapping: cols as unknown as Prisma.InputJsonValue },
    });
    await audit(db, user, "ColumnMapping", m.id, "SAVE", null, cols);
    return `Format "${name}" saved with ${cols.length} column(s).`;
  }, "/payroll");
}
