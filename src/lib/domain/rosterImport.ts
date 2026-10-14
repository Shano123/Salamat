// Bulk roster import from Excel. Two layouts:
//   GRID: employee number | name | <date> | <date> … with shift codes in cells. The header row
//         may sit below title rows, as on the hospital's Duty Roster sheet
//         (No. | Staff Name | Staff ID | Designation | <dates> | totals…, coverage block below).
//   ROWS: employee number | date | shift code | unit/branch (one row per assignment).

import { buildEmployeeMap, lookupEmployee } from "./employeeNo";
import { diffDays, toDateISO } from "./time";

export type Cell = string | number | Date | null | undefined;

export interface ImportEmployee {
  id: string;
  employeeNo: string;
  departmentId: string;
}

export interface ImportTemplate {
  id: string;
  code: string;
}

export interface ImportLocation {
  id: string;
  name: string;
}

export interface CellError {
  row: number; // 1-based sheet row
  col: number; // 1-based sheet column
  message: string;
}

export interface ParsedAssignment {
  key: string;
  row: number;
  col: number;
  employeeId: string;
  date: string;
  templateId: string;
  locationId: string | null;
}

export interface ParseResult {
  layout: "GRID" | "ROWS";
  assignments: ParsedAssignment[];
  errors: CellError[];
  from: string | null;
  to: string | null;
}

export const MAX_IMPORT_DAYS = 92;

export function cellToDateISO(v: Cell): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : toDateISO(v);
  if (typeof v === "number") {
    // Excel serial date
    const ms = Math.round((v - 25569) * 86400_000);
    return toDateISO(new Date(ms));
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function text(v: Cell): string {
  if (v == null) return "";
  if (v instanceof Date) return toDateISO(v);
  return String(v).trim();
}

export function detectLayout(header: Cell[]): "GRID" | "ROWS" {
  const h = header.map((c) => text(c).toLowerCase());
  if (h.some((c) => c.includes("shift")) && h.some((c) => c === "date" || c.includes("date"))) return "ROWS";
  return "GRID";
}

export function parseRosterSheet(
  rows: Cell[][],
  ctx: {
    departmentId: string | "ANY";
    employees: ImportEmployee[];
    templates: ImportTemplate[];
    locations: ImportLocation[];
  },
): ParseResult {
  const errors: CellError[] = [];
  const assignments: ParsedAssignment[] = [];
  if (!rows.length) return { layout: "GRID", assignments, errors: [{ row: 1, col: 1, message: "The sheet is empty." }], from: null, to: null };

  const byNo = buildEmployeeMap(ctx.employees.map((e) => ({ employeeNo: e.employeeNo, value: e })));
  const byCode = new Map(ctx.templates.map((t) => [t.code.toUpperCase(), t]));
  const byLoc = new Map(ctx.locations.map((l) => [l.name.toLowerCase(), l]));
  const layout = detectLayout(rows[0]);

  const resolveEmployee = (raw: Cell, row: number, col: number) => {
    const no = text(raw);
    if (!no) return null;
    const emp = lookupEmployee(byNo, no);
    if (!emp) {
      errors.push({ row, col, message: `Unknown employee "${no}".` });
      return null;
    }
    if (ctx.departmentId !== "ANY" && emp.departmentId !== ctx.departmentId) {
      errors.push({ row, col, message: `Employee ${no} is not in this department.` });
      return null;
    }
    return emp;
  };
  const resolveCode = (raw: Cell, row: number, col: number) => {
    const code = text(raw).toUpperCase();
    if (!code) return null;
    const t = byCode.get(code);
    if (!t) errors.push({ row, col, message: `Unknown or unapproved shift code "${code}".` });
    return t ?? null;
  };

  if (layout === "GRID") {
    // The header row is the row (within the top 20) holding the most dates; title blocks may
    // carry a single date ("Period from") above it.
    const dateCount = (r: Cell[] | undefined) => (r ?? []).filter((c, i) => i >= 1 && cellToDateISO(c) && !/^\d+$/.test(text(c))).length;
    const headerIdx = rows.slice(0, 20).reduce((best, r, i) => (dateCount(r) > dateCount(rows[best]) ? i : best), 0);
    const header = rows[headerIdx] ?? [];
    const labels = header.map((c) => (c instanceof Date ? "" : text(c).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
    const idCol = labels.findIndex((l) => /^(staff id|staff no|employee|employee (no|number|id)|emp ?(id|no)|id|badge)$/.test(l));
    const empCol = idCol >= 0 ? idCol : 0;
    const dateCols: Array<{ col: number; date: string }> = [];
    header.forEach((c, i) => {
      if (i < 1 || i === empCol) return;
      const d = typeof c === "number" ? null : cellToDateISO(c);
      if (d) dateCols.push({ col: i + 1, date: d });
      else if (/^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(text(c))) errors.push({ row: headerIdx + 1, col: i + 1, message: `Header "${text(c)}" is not a valid date.` });
    });
    if (!dateCols.length) errors.push({ row: headerIdx + 1, col: 3, message: "No date columns found in the header row." });
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => text(c) === "")) continue;
      // The roster's coverage / legend block ends the staff rows.
      if (row.some((c) => /^(daily coverage|total on duty|coverage status|shift legend)/i.test(text(c)))) break;
      // Merged header cells repeat their label on the next row (e.g. "Staff ID" over rows 8–9).
      if (!text(row[empCol]) || text(row[empCol]).toLowerCase() === text(header[empCol]).toLowerCase()) continue;
      const emp = resolveEmployee(row[empCol], r + 1, empCol + 1);
      if (!emp) continue;
      for (const { col, date } of dateCols) {
        const t = resolveCode(row[col - 1], r + 1, col);
        if (!t) continue;
        assignments.push({ key: `r${r + 1}c${col}`, row: r + 1, col, employeeId: emp.id, date, templateId: t.id, locationId: null });
      }
    }
  } else {
    const h = rows[0].map((c) => text(c).toLowerCase());
    const idx = (pred: (s: string) => boolean, fallback: number) => {
      const i = h.findIndex(pred);
      return i >= 0 ? i : fallback;
    };
    const cEmp = idx((s) => s.includes("employee"), 0);
    const cDate = idx((s) => s.includes("date"), 1);
    const cShift = idx((s) => s.includes("shift"), 2);
    const cLoc = idx((s) => s.includes("unit") || s.includes("branch") || s.includes("location"), 3);
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => text(c) === "")) continue;
      const emp = resolveEmployee(row[cEmp], r + 1, cEmp + 1);
      const date = cellToDateISO(row[cDate]);
      if (!date) errors.push({ row: r + 1, col: cDate + 1, message: `Invalid date "${text(row[cDate])}".` });
      const t = resolveCode(row[cShift], r + 1, cShift + 1);
      let locationId: string | null = null;
      const locName = text(row[cLoc]);
      if (locName) {
        const loc = byLoc.get(locName.toLowerCase());
        if (!loc) errors.push({ row: r + 1, col: cLoc + 1, message: `Unknown unit/branch "${locName}".` });
        else locationId = loc.id;
      }
      if (emp && date && t) {
        assignments.push({ key: `r${r + 1}c${cShift + 1}`, row: r + 1, col: cShift + 1, employeeId: emp.id, date, templateId: t.id, locationId });
      }
    }
  }

  const dates = assignments.map((a) => a.date).sort();
  const from = dates[0] ?? null;
  const to = dates[dates.length - 1] ?? null;
  if (from && to && diffDays(from, to) + 1 > MAX_IMPORT_DAYS) {
    errors.push({ row: 1, col: 1, message: "A file can cover at most 3 months." });
  }
  const seen = new Map<string, ParsedAssignment>();
  for (const a of assignments) {
    const k = `${a.employeeId}|${a.date}`;
    const prev = seen.get(k);
    if (prev && prev.templateId === a.templateId) {
      errors.push({ row: a.row, col: a.col, message: "Duplicate assignment for this employee and date." });
    }
    seen.set(k, a);
  }
  return { layout, assignments, errors, from, to };
}

export interface ExistingAssignment {
  id: string;
  employeeId: string;
  date: string;
  status: "DRAFT" | "PUBLISHED";
}

export interface ImportPlan {
  create: ParsedAssignment[];
  replace: Array<{ existing: ExistingAssignment; next: ParsedAssignment }>;
  skipped: ParsedAssignment[];
  touchesPublished: boolean;
}

/** merge = fill empty days only; replace = overwrite existing assignments on the imported dates. */
export function planImport(parsed: ParsedAssignment[], existing: ExistingAssignment[], mode: "MERGE" | "REPLACE"): ImportPlan {
  const byKey = new Map<string, ExistingAssignment[]>();
  for (const e of existing) {
    const k = `${e.employeeId}|${e.date}`;
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  const plan: ImportPlan = { create: [], replace: [], skipped: [], touchesPublished: false };
  const claimed = new Set<string>();
  for (const p of parsed) {
    const ex = (byKey.get(`${p.employeeId}|${p.date}`) ?? []).filter((e) => !claimed.has(e.id));
    if (!ex.length) plan.create.push(p);
    else if (mode === "MERGE") plan.skipped.push(p);
    else {
      const target = ex[0];
      claimed.add(target.id);
      plan.replace.push({ existing: target, next: p });
      if (target.status === "PUBLISHED") plan.touchesPublished = true;
    }
  }
  return plan;
}
