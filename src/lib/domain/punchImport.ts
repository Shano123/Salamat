// Bulk raw punch import (Excel/CSV) with per-device-brand column mapping.

import type { PunchKind } from "./attendance";
import { cellToDateISO, Cell } from "./rosterImport";
import { hhmmToMinutes, toDateISO, zonedToUtc } from "./time";

export const MAX_PUNCH_ROWS = 100_000;

export interface PunchMapping {
  employeeNo: string;
  /** Either a combined date-time column, or separate date + time columns. */
  datetime?: string;
  date?: string;
  time?: string;
  type?: string;
  device?: string;
  source?: string;
}

export const DEFAULT_MAPPING: PunchMapping = {
  employeeNo: "employee_no",
  date: "date",
  time: "time",
  type: "punch_type",
  device: "device",
  source: "source",
};

export interface ParsedPunch {
  row: number;
  employeeId: string;
  employeeNo: string;
  timestamp: Date;
  type: PunchKind | null;
  device: string | null;
}

export interface PunchRowError {
  row: number;
  message: string;
  raw: Cell[];
}

export interface PunchPreview {
  ok: ParsedPunch[];
  duplicates: ParsedPunch[];
  errors: PunchRowError[];
}

export function parsePunchType(v: Cell): PunchKind | null | "INVALID" {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().replace(/[\s_/-]+/g, "");
  if (!s) return null;
  if (["in", "i", "0", "checkin", "cin", "clockin", "دخول"].includes(s)) return "IN";
  if (["out", "o", "1", "checkout", "cout", "clockout", "خروج"].includes(s)) return "OUT";
  if (["breakstart", "breakout", "2", "bs", "break"].includes(s)) return "BREAK_START";
  if (["breakend", "breakin", "3", "be"].includes(s)) return "BREAK_END";
  return "INVALID";
}

function parseTimeMinutes(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number") return Math.round((v % 1) * 1440); // Excel fraction of a day
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(String(v).trim());
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  try {
    return hhmmToMinutes(`${h}:${m[2]}`);
  } catch {
    return null;
  }
}

function parseDateTime(v: Cell, tz: string): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return zonedToUtc(toDateISO(v), v.getUTCHours() * 60 + v.getUTCMinutes(), tz);
  if (typeof v === "number") {
    const date = cellToDateISO(Math.floor(v));
    return date ? zonedToUtc(date, Math.round((v % 1) * 1440), tz) : null;
  }
  const m = /^(\S+)[ T](\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?)$/i.exec(String(v).trim());
  if (!m) return null;
  const date = cellToDateISO(m[1]);
  const mins = parseTimeMinutes(m[2]);
  return date && mins != null ? zonedToUtc(date, mins, tz) : null;
}

export function parsePunchRows(
  headers: string[],
  rows: Cell[][],
  mapping: PunchMapping,
  ctx: {
    tz: string;
    employees: Map<string, string>; // employeeNo (lowercase) → id
    lockedRanges: Array<{ from: string; to: string }>;
    existingKeys: Set<string>; // `${employeeId}|${iso timestamp}`
  },
): PunchPreview {
  const preview: PunchPreview = { ok: [], duplicates: [], errors: [] };
  const col = (name?: string) => (name ? headers.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase()) : -1);
  const cEmp = col(mapping.employeeNo);
  const cDt = col(mapping.datetime);
  const cDate = col(mapping.date);
  const cTime = col(mapping.time);
  const cType = col(mapping.type);
  const cDev = col(mapping.device);
  if (cEmp < 0) {
    preview.errors.push({ row: 1, message: `Column "${mapping.employeeNo}" not found.`, raw: [] });
    return preview;
  }
  if (cDt < 0 && (cDate < 0 || cTime < 0)) {
    preview.errors.push({ row: 1, message: "Map either a date-time column or both date and time columns.", raw: [] });
    return preview;
  }
  if (rows.length > MAX_PUNCH_ROWS) {
    preview.errors.push({ row: 1, message: `A file can contain at most ${MAX_PUNCH_ROWS.toLocaleString()} rows.`, raw: [] });
    return preview;
  }
  const seenInFile = new Set<string>();
  rows.forEach((raw, i) => {
    const row = i + 2;
    if (!raw || raw.every((c) => c == null || String(c).trim() === "")) return;
    const no = String(raw[cEmp] ?? "").trim();
    const employeeId = ctx.employees.get(no.toLowerCase());
    if (!employeeId) return preview.errors.push({ row, message: `Unknown employee "${no}".`, raw });
    let ts: Date | null = null;
    if (cDt >= 0) ts = parseDateTime(raw[cDt], ctx.tz);
    else {
      const date = cellToDateISO(raw[cDate]);
      const mins = parseTimeMinutes(raw[cTime]);
      if (!date) return preview.errors.push({ row, message: `Invalid date "${raw[cDate] ?? ""}".`, raw });
      if (mins == null) return preview.errors.push({ row, message: `Invalid time "${raw[cTime] ?? ""}".`, raw });
      ts = zonedToUtc(date, mins, ctx.tz);
    }
    if (!ts) return preview.errors.push({ row, message: "Invalid date/time.", raw });
    const type = cType >= 0 ? parsePunchType(raw[cType]) : null;
    if (type === "INVALID") return preview.errors.push({ row, message: `Unknown punch type "${raw[cType]}".`, raw });
    const day = toDateISO(ts);
    if (ctx.lockedRanges.some((r) => day >= r.from && day <= r.to)) {
      return preview.errors.push({ row, message: "Time falls in a locked attendance period.", raw });
    }
    const p: ParsedPunch = { row, employeeId, employeeNo: no, timestamp: ts, type, device: cDev >= 0 ? String(raw[cDev] ?? "").trim() || null : null };
    const key = `${employeeId}|${ts.toISOString()}`;
    if (ctx.existingKeys.has(key) || seenInFile.has(key)) preview.duplicates.push(p);
    else {
      seenInFile.add(key);
      preview.ok.push(p);
    }
  });
  return preview;
}
