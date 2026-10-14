// Downloads the roster (or an empty template pre-filled with staff and dates) laid out like the
// hospital's Excel "Duty Roster" sheet: title block, No. | Staff Name | Staff ID | Designation |
// one column per date with shift codes, totals, daily coverage, shift legend and signatures.
// The file can be filled in and uploaded again on Roster import.
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { canViewDepartment, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DUTY_GROUPS, GROUP_COLORS, dayType, isDutyGroup, legendText, RosterGroup, RowCell, shiftGroup, summarizeRow, workingDates } from "@/lib/domain/dutyRoster";
import { can } from "@/lib/domain/permissions";
import { MAX_IMPORT_DAYS } from "@/lib/domain/rosterImport";
import { scheduledMinutes } from "@/lib/domain/shift";
import { dateRange, dayOfWeek, diffDays, parseDateISO, toDateISO } from "@/lib/domain/time";
import { workbookResponse } from "@/lib/excel";
import { approvedLeave, toTemplateLike } from "@/lib/services/attendance";
import { getRules } from "@/lib/settings";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const NAVY = "FF0C1A33";
const thin = { style: "thin" as const, color: { argb: "FFC9D1DC" } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

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

  const rules = await getRules();
  const dept = await db.department.findUniqueOrThrow({ where: { id: deptId } });
  const employees = await db.employee.findMany({ where: { homeDepartmentId: deptId, status: "ACTIVE" }, orderBy: [{ createdAt: "asc" }, { nameEn: "asc" }] });
  const assignments = blank
    ? []
    : await db.shiftAssignment.findMany({ where: { departmentId: deptId, isOpenShift: false, date: { gte: parseDateISO(from), lte: parseDateISO(to) } }, include: { template: true } });
  const templates = await db.shiftTemplate.findMany({ where: { status: "APPROVED", OR: [{ ownerDepartmentId: deptId }, { ownerDepartmentId: null }] }, orderBy: [{ startMin: "asc" }, { code: "asc" }] });
  const staffing = await db.staffingRequirement.findMany({ where: { departmentId: deptId, skill: null }, include: { template: true } });
  const holidayRows = await db.holiday.findMany({ where: { date: { gte: parseDateISO(from), lte: parseDateISO(to) }, OR: [{ locationId: null }, ...(dept.locationId ? [{ locationId: dept.locationId }] : [])] } });
  const leave = blank ? [] : await approvedLeave(employees.map((e) => e.id), from, to);
  const dates = dateRange(from, to);
  const holidays = new Set(holidayRows.map((h) => toDateISO(h.date)));
  const weekend = rules.defaultWeekendDays;
  const working = new Set(workingDates(dates, weekend, holidays));
  const info = (t: (typeof templates)[number]) => {
    const like = { ...toTemplateLike(t), name: t.name };
    return { group: shiftGroup(like), minutes: scheduledMinutes(like), legend: legendText(like) };
  };
  const infoById = new Map([...templates, ...assignments.map((a) => a.template)].map((t) => [t.id, info(t)]));

  const wb = new ExcelJS.Workbook();
  wb.creator = rules.organizationName;
  const ws = wb.addWorksheet("Duty Roster", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  });
  const FIRST_DAY = 5; // column E
  const lastDay = FIRST_DAY + dates.length - 1;
  const TOT = ["Duty\nDays", "Off /\nHol", "Leave /\nVac", "Planned\nHrs", "Req.\nHrs", "+/-\nHrs"];
  const lastCol = lastDay + TOT.length;

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 11;
  ws.getColumn(4).width = 16;
  for (let c = FIRST_DAY; c <= lastDay; c++) ws.getColumn(c).width = 5.2;
  for (let c = lastDay + 1; c <= lastCol; c++) ws.getColumn(c).width = 8;

  // Title block
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = rules.organizationName.toUpperCase();
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = dates.length > 7 ? "MONTHLY  STAFF  DUTY  ROSTER" : "WEEKLY  STAFF  DUTY  ROSTER";
  ws.getCell(2, 1).font = { bold: true, size: 12, color: { argb: "FF1F5FBF" } };
  for (const r of [1, 2]) ws.getCell(r, 1).alignment = { horizontal: "center" };

  const meta: Array<[string, string | number]> = [
    ["DEPARTMENT", dept.nameEn],
    ["PERIOD FROM", from],
    ["PERIOD TO", to],
    ["WORKING DAYS", working.size],
    ["STD HRS / DAY", rules.standardDailyHours],
    ["REQUIRED HRS / PERSON", working.size * rules.standardDailyHours],
  ];
  const step = Math.max(3, Math.floor(dates.length / 4));
  const metaCols = [2, 4, FIRST_DAY, FIRST_DAY + step, FIRST_DAY + 2 * step, FIRST_DAY + 3 * step];
  meta.forEach(([label, value], i) => {
    const c = metaCols[i];
    const end = Math.min((metaCols[i + 1] ?? c + 5) - 1, lastCol);
    if (end > c) {
      ws.mergeCells(5, c, 5, end);
      ws.mergeCells(6, c, 6, end);
    }
    const l = ws.getCell(5, c);
    l.value = label;
    l.font = { bold: true, size: 8, color: { argb: "FF64748B" } };
    const v = ws.getCell(6, c);
    v.value = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateISO(value) : value;
    if (v.value instanceof Date) v.numFmt = "dd-mmm-yyyy";
    v.font = { bold: true, size: 11 };
    v.alignment = { horizontal: "left" };
  });

  // Header rows: 8 = titles + dates, 9 = weekday, 10 = day type (D / W / H)
  const HEAD = 8;
  const head = ws.getRow(HEAD);
  ["No.", "Staff Name", "Staff ID", "Designation"].forEach((h, i) => (head.getCell(i + 1).value = h));
  dates.forEach((d, i) => {
    const c = head.getCell(FIRST_DAY + i);
    c.value = parseDateISO(d);
    c.numFmt = "dd";
    ws.getCell(HEAD + 1, FIRST_DAY + i).value = DOW[dayOfWeek(d)];
    ws.getCell(HEAD + 2, FIRST_DAY + i).value = dayType(d, weekend, holidays);
  });
  TOT.forEach((h, i) => (head.getCell(lastDay + 1 + i).value = h));
  head.height = 30;
  for (let r = HEAD; r <= HEAD + 2; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      const d = dates[c - FIRST_DAY];
      const fill = d && holidays.has(d) ? "FFA3261F" : d && weekend.includes(dayOfWeek(d)) ? "FF0F5C63" : r === HEAD ? NAVY : "FF13254A";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.font = { bold: r === HEAD, size: r === HEAD ? 9 : 8, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: c === 2 ? "left" : "center", vertical: "middle", wrapText: true };
      cell.border = box;
    }
  }

  // Staff rows
  const FIRST_ROW = HEAD + 3;
  const codes = templates.map((t) => t.code);
  employees.forEach((e, idx) => {
    const r = FIRST_ROW + idx;
    const row = ws.getRow(r);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = e.nameEn;
    row.getCell(3).value = e.employeeNo;
    row.getCell(4).value = e.jobTitle;
    const cells = new Map<string, RowCell[]>();
    const leaveDates = new Set(dates.filter((d) => leave.some((l) => l.employeeId === e.id && d >= l.from && d <= l.to)));
    dates.forEach((d, i) => {
      const mine = assignments.filter((a) => a.employeeId === e.id && toDateISO(a.date) === d);
      const list = mine.map((a) => ({ code: a.template.code, ...infoById.get(a.templateId)! }));
      cells.set(d, list.map((x) => ({ group: x.group, minutes: x.minutes })));
      const cell = row.getCell(FIRST_DAY + i);
      const first = list[0];
      cell.value = first ? list.map((x) => x.code).join("/") : leaveDates.has(d) ? "L" : null;
      const g: RosterGroup | null = first ? first.group : leaveDates.has(d) ? "Leave" : null;
      if (g) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(GROUP_COLORS[g].bg) } };
        cell.font = { bold: true, size: 9, color: { argb: argb(GROUP_COLORS[g].fg) } };
      } else if (dayType(d, weekend, holidays) !== "D") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: holidays.has(d) ? "FFFDECEA" : "FFE8F4F5" } };
      }
      if (codes.length && codes.join(",").length < 250) cell.dataValidation = { type: "list", allowBlank: true, formulae: [`"${codes.join(",")}"`] };
    });
    const s = summarizeRow({ dates, cells, approvedLeave: leaveDates, working, standardHours: rules.standardDailyHours });
    [s.dutyDays, s.offDays, s.leaveDays, s.plannedHours, s.requiredHours, s.diffHours].forEach((v, i) => {
      const cell = row.getCell(lastDay + 1 + i);
      cell.value = v;
      cell.font = { bold: true, size: 9, color: { argb: i === 5 && v < 0 ? "FFB42318" : i === 5 && v > 0 ? "FF157F3C" : "FF0F1B2D" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F8FB" } };
    });
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.border = box;
      cell.alignment = { horizontal: c === 2 || c === 4 ? "left" : "center", vertical: "middle" };
      if (c < FIRST_DAY) cell.font = { size: 9, bold: c === 2 };
    }
    row.height = 18;
  });

  // Daily coverage
  let r = FIRST_ROW + Math.max(employees.length, 1) + 1;
  const sec = ws.getRow(r);
  sec.getCell(1).value = "DAILY COVERAGE  (staff on duty)";
  sec.getCell(3).value = "Min req.";
  for (let c = 1; c <= lastDay; c++) {
    sec.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
    sec.getCell(c).font = { bold: true, size: 9 };
  }
  const note = ws.getCell(r, lastDay + 1);
  note.value = "Duty Days = days with a working shift.\nReq. Hrs = working days x std hrs (weekend & holidays excluded; approved leave deducted).\n+/- = Planned minus Required.";
  note.font = { size: 8, color: { argb: "FF64748B" } };
  note.alignment = { wrapText: true, vertical: "top" };
  const minByGroup = new Map<RosterGroup, number>();
  for (const s of staffing) {
    const g = info(s.template).group;
    minByGroup.set(g, (minByGroup.get(g) ?? 0) + s.minCount);
  }
  const onDuty = (d: string) => assignments.filter((a) => toDateISO(a.date) === d && isDutyGroup(infoById.get(a.templateId)!.group));
  const groups = DUTY_GROUPS.filter((g) => minByGroup.has(g) || templates.some((t) => info(t).group === g));
  const noteFrom = r;
  for (const g of groups) {
    r++;
    const row = ws.getRow(r);
    row.getCell(1).value = g;
    row.getCell(3).value = minByGroup.get(g) ?? 0;
    dates.forEach((d, i) => {
      const n = onDuty(d).filter((a) => infoById.get(a.templateId)!.group === g).length;
      const cell = row.getCell(FIRST_DAY + i);
      cell.value = n;
      if (n < (minByGroup.get(g) ?? 0)) cell.font = { bold: true, color: { argb: "FFB42318" } };
    });
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(GROUP_COLORS[g].bg) } };
  }
  r++;
  ws.getRow(r).getCell(1).value = "TOTAL ON DUTY";
  ws.getRow(r).font = { bold: true, size: 9 };
  dates.forEach((d, i) => (ws.getCell(r, FIRST_DAY + i).value = onDuty(d).length));
  r++;
  ws.getRow(r).getCell(1).value = "COVERAGE STATUS  (LOW = below minimum)";
  dates.forEach((d, i) => {
    const low = groups.some((g) => onDuty(d).filter((a) => infoById.get(a.templateId)!.group === g).length < (minByGroup.get(g) ?? 0));
    const cell = ws.getCell(r, FIRST_DAY + i);
    cell.value = low ? "LOW" : "OK";
    cell.font = { bold: true, size: 8, color: { argb: low ? "FFB42318" : "FF157F3C" } };
    if (low) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECEA" } };
  });
  ws.mergeCells(noteFrom, lastDay + 1, r, lastCol);
  for (let rr = noteFrom; rr <= r; rr++) {
    for (let c = 1; c <= lastDay; c++) {
      const cell = ws.getCell(rr, c);
      cell.border = box;
      cell.alignment = { horizontal: c <= 2 ? "left" : "center", vertical: "middle" };
      if (!cell.font?.bold) cell.font = { ...(cell.font ?? {}), size: 9 };
    }
  }

  // Shift legend
  r += 2;
  ws.getCell(r, 1).value = "SHIFT LEGEND   ·   Weekend columns shaded teal  ·  Public holidays shaded red  ·  Times as per shift codes";
  ws.getCell(r, 1).font = { bold: true, size: 9 };
  const used = templates.filter((t) => assignments.some((a) => a.templateId === t.id) || ["Off", "Leave", "Holiday"].includes(info(t).group));
  const legend = used.length ? used : templates;
  const perRow = 3;
  const span = Math.max(4, Math.floor((lastCol - 1) / perRow));
  legend.forEach((t, i) => {
    if (i % perRow === 0) r++;
    const c = 1 + (i % perRow) * span;
    const codeCell = ws.getCell(r, c);
    const g = info(t).group;
    codeCell.value = t.code;
    codeCell.font = { bold: true, size: 9, color: { argb: argb(GROUP_COLORS[g].fg) } };
    codeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(GROUP_COLORS[g].bg) } };
    codeCell.alignment = { horizontal: "center" };
    ws.getCell(r, c + 1).value = info(t).legend;
    ws.getCell(r, c + 1).font = { size: 9 };
  });
  for (const h of holidayRows) {
    r++;
    ws.getCell(r, 2).value = `${toDateISO(h.date)}  ·  Public holiday: ${h.name}`;
    ws.getCell(r, 2).font = { size: 9, color: { argb: "FFA3261F" } };
  }

  // Remarks and signatures
  r += 2;
  ws.getCell(r, 1).value = "REMARKS / SWAPS:";
  ws.getCell(r, 1).font = { bold: true, size: 9 };
  r += 3;
  const third = Math.max(4, Math.floor(lastCol / 3));
  [["PREPARED BY  (Head of Department / In-charge)"], ["REVIEWED BY  (Nursing Director / HR)"], ["APPROVED BY  (Medical Director)"]].forEach(([label], i) => {
    const c = i === 0 ? 2 : 1 + i * third;
    ws.getCell(r, c).value = label;
    ws.getCell(r, c).font = { bold: true, size: 9 };
    ["Name:", "Signature:", "Date:"].forEach((x, k) => {
      ws.getCell(r + 1 + k, c).value = x;
      ws.getCell(r + 1 + k, c).font = { size: 9, color: { argb: "FF64748B" } };
    });
  });

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: HEAD + 2, showGridLines: false }];
  ws.pageSetup.printArea = `A1:${ws.getColumn(lastCol).letter}${r + 3}`;

  // Shift codes reference sheet
  const legendWs = wb.addWorksheet("Shifts");
  legendWs.addRow(["Code", "Duty / Shift name", "Start", "End", "Start 2", "End 2", "Hours", "Group"]);
  const hhmm = (m: number | null) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  for (const t of templates) {
    const x = info(t);
    const off = t.type === "OFF";
    legendWs.addRow([t.code, t.name, off ? "" : hhmm(t.startMin), off ? "" : hhmm(t.endMin), hhmm(t.split2StartMin), hhmm(t.split2EndMin), x.minutes / 60, x.group]);
  }
  const hr = legendWs.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  [8, 28, 9, 9, 9, 9, 8, 12].forEach((w, i) => (legendWs.getColumn(i + 1).width = w));
  legendWs.views = [{ state: "frozen", ySplit: 1 }];

  return workbookResponse(wb, `Duty Roster - ${dept.nameEn} - ${from} to ${to}.xlsx`);
}
