// Payroll export with a configurable column mapping (the payroll system's format is not known yet).

export interface PayrollRow {
  employeeNo: string;
  nameEn: string;
  nameAr: string;
  department: string;
  costCenter: string;
  periodStart: string;
  periodEnd: string;
  scheduledShifts: number;
  scheduledHours: number;
  workedHours: number;
  overtimeHours: number;
  overtimePaidHours: number;
  toilHours: number;
  lateMinutes: number;
  earlyMinutes: number;
  absentDays: number;
  leaveDays: number;
  onCallShifts: number;
  missingPunches: number;
}

export type PayrollField = keyof PayrollRow;

export const PAYROLL_FIELDS: PayrollField[] = [
  "employeeNo",
  "nameEn",
  "nameAr",
  "department",
  "costCenter",
  "periodStart",
  "periodEnd",
  "scheduledShifts",
  "scheduledHours",
  "workedHours",
  "overtimeHours",
  "overtimePaidHours",
  "toilHours",
  "lateMinutes",
  "earlyMinutes",
  "absentDays",
  "leaveDays",
  "onCallShifts",
  "missingPunches",
];

export interface PayrollColumn {
  header: string;
  field: PayrollField;
}

export const DEFAULT_PAYROLL_COLUMNS: PayrollColumn[] = [
  { header: "EMP_NO", field: "employeeNo" },
  { header: "NAME", field: "nameEn" },
  { header: "COST_CENTER", field: "costCenter" },
  { header: "PERIOD_FROM", field: "periodStart" },
  { header: "PERIOD_TO", field: "periodEnd" },
  { header: "WORKED_HRS", field: "workedHours" },
  { header: "OT_PAID_HRS", field: "overtimePaidHours" },
  { header: "TOIL_HRS", field: "toilHours" },
  { header: "ABSENT_DAYS", field: "absentDays" },
  { header: "LEAVE_DAYS", field: "leaveDays" },
  { header: "LATE_MIN", field: "lateMinutes" },
  { header: "ONCALL_SHIFTS", field: "onCallShifts" },
];

export function mapPayroll(rows: PayrollRow[], columns: PayrollColumn[]): { headers: string[]; data: Array<Array<string | number>> } {
  return {
    headers: columns.map((c) => c.header),
    data: rows.map((r) => columns.map((c) => r[c.field])),
  };
}

export function toCsv(headers: string[], data: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...data].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
