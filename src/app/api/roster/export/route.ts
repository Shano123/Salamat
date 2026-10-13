// Downloads the roster (or an empty template pre-filled with employees and dates) in the
// GRID layout: employees as rows, dates as columns, shift codes in cells. Re-import ready.
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { canViewDepartment, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { MAX_IMPORT_DAYS } from "@/lib/domain/rosterImport";
import { dateRange, diffDays, parseDateISO, toDateISO } from "@/lib/domain/time";
import { styleHeader, workbookResponse } from "@/lib/excel";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "roster.view")) return new Response("Forbidden", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const deptId = sp.get("dept") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? from;
  const blank = sp.get("blank") === "1";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return new Response("Invalid dates", { status: 400 });
  if (diffDays(from, to) + 1 > MAX_IMPORT_DAYS) return new Response("At most 3 months per file", { status: 400 });
  if (!canViewDepartment(user, deptId)) return new Response("Forbidden", { status: 403 });
  const dept = await db.department.findUniqueOrThrow({ where: { id: deptId } });
  const employees = await db.employee.findMany({ where: { homeDepartmentId: deptId, status: "ACTIVE" }, orderBy: { nameEn: "asc" } });
  const assignments = blank
    ? []
    : await db.shiftAssignment.findMany({ where: { departmentId: deptId, isOpenShift: false, date: { gte: parseDateISO(from), lte: parseDateISO(to) } }, include: { template: true } });
  const templates = await db.shiftTemplate.findMany({ where: { status: "APPROVED", OR: [{ ownerDepartmentId: deptId }, { ownerDepartmentId: null }] }, orderBy: { code: "asc" } });
  const dates = dateRange(from, to);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Roster");
  ws.addRow(["Employee No", "Name", ...dates]);
  for (const e of employees) {
    ws.addRow([e.employeeNo, e.nameEn, ...dates.map((d) => assignments.find((a) => a.employeeId === e.id && toDateISO(a.date) === d)?.template.code ?? "")]);
  }
  styleHeader(ws);
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 28;
  for (let i = 3; i <= dates.length + 2; i++) ws.getColumn(i).width = 11;
  const codes = templates.map((t) => t.code).join(",");
  if (codes.length < 250 && employees.length) {
    for (let r = 2; r <= employees.length + 1; r++) {
      for (let c = 3; c <= dates.length + 2; c++) {
        ws.getCell(r, c).dataValidation = { type: "list", allowBlank: true, formulae: [`"${codes}"`] };
      }
    }
  }
  const legend = wb.addWorksheet("Shift codes");
  legend.addRow(["Code", "Name", "Start", "End", "Type"]);
  for (const t of templates) {
    legend.addRow([t.code, t.name, `${String(Math.floor(t.startMin / 60)).padStart(2, "0")}:${String(t.startMin % 60).padStart(2, "0")}`, `${String(Math.floor(t.endMin / 60)).padStart(2, "0")}:${String(t.endMin % 60).padStart(2, "0")}`, t.type]);
  }
  styleHeader(legend);
  return workbookResponse(wb, `roster-${dept.code}-${from}-${to}.xlsx`);
}
