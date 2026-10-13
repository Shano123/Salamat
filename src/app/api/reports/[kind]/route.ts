import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { canViewDepartment, getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/domain/permissions";
import { toCsv } from "@/lib/domain/payroll";
import { csvResponse, styleHeader, workbookResponse } from "@/lib/excel";
import { buildReport, ReportKind, REPORTS } from "@/lib/services/reports";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user.role, "reports.view")) return new Response("Forbidden", { status: 403 });
  if (!(kind in REPORTS)) return new Response("Unknown report", { status: 404 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? from;
  const dept = sp.get("dept") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Invalid dates", { status: 400 });
  if (dept && !canViewDepartment(user, dept)) return new Response("Forbidden", { status: 403 });
  const table = await buildReport(kind as ReportKind, user, { from, to, departmentId: dept });
  const name = `${kind}-${from}-${to}`;
  if (sp.get("format") === "csv") return csvResponse(toCsv(table.headers, table.rows), `${name}.csv`);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(REPORTS[kind as ReportKind].slice(0, 31));
  ws.addRow(table.headers);
  table.rows.forEach((r) => ws.addRow(r));
  styleHeader(ws);
  ws.columns.forEach((c) => (c.width = 16));
  return workbookResponse(wb, `${name}.xlsx`);
}
