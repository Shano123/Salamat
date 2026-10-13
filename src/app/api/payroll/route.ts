import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { DEFAULT_PAYROLL_COLUMNS, mapPayroll, PayrollColumn, toCsv } from "@/lib/domain/payroll";
import { csvResponse, styleHeader, workbookResponse } from "@/lib/excel";
import { payrollRows } from "@/lib/services/reports";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "payroll.export")) return new Response("Forbidden", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Invalid dates", { status: 400 });
  const fmt = sp.get("mapping");
  const mapping = fmt ? await db.columnMapping.findUnique({ where: { kind_name: { kind: "PAYROLL", name: fmt } } }) : null;
  const columns = (mapping?.mapping as unknown as PayrollColumn[]) ?? DEFAULT_PAYROLL_COLUMNS;
  const rows = await payrollRows(user, { from, to });
  const { headers, data } = mapPayroll(rows, columns);
  await audit(db, user, "PayrollExport", `${from}_${to}`, "EXPORT", null, { format: fmt ?? "default", rows: rows.length });
  const name = `payroll-${from}-${to}`;
  if (sp.get("format") === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Payroll");
    ws.addRow(headers);
    data.forEach((r) => ws.addRow(r));
    styleHeader(ws);
    return workbookResponse(wb, `${name}.xlsx`);
  }
  return csvResponse(toCsv(headers, data), `${name}.csv`);
}
