// Monthly duty roster (the hospital's Excel "Duty Roster" sheet): roster periods that start on
// a configurable day of the month, shift groups for colours and coverage, and per-row totals
// (duty days, off / holiday, leave, planned vs required hours).

import { scheduledMinutes, TemplateLike } from "./shift";
import { addDays, dayOfWeek, minutesToHHMM, parseDateISO, toDateISO } from "./time";

export type RosterGroup = "Morning" | "Evening" | "Night" | "12h Day" | "Broken" | "On-call" | "Off" | "Leave" | "Holiday" | "Vacation";

/** Groups that count as "on duty" in the daily coverage block, in display order. */
export const DUTY_GROUPS: RosterGroup[] = ["Morning", "Evening", "Night", "12h Day", "Broken"];

type GroupInput = Pick<TemplateLike, "type" | "startMin" | "endMin" | "code"> & { name?: string; totalHours?: number | null; split2StartMin?: number | null; split2EndMin?: number | null; breakMin?: number; paidBreak?: boolean };

/**
 * Derives the roster group from a shift template, matching the Excel Shifts sheet:
 * off-type codes split into Off / Leave / Holiday / Vacation by code or name, split shifts are
 * Broken, 12-hour day shifts are "12h Day", otherwise the start time decides Morning / Evening / Night.
 */
export function shiftGroup(t: GroupInput): RosterGroup {
  const code = t.code.toUpperCase();
  const name = (t.name ?? "").toLowerCase();
  if (t.type === "OFF") {
    if (/vacation/.test(name) || code === "V") return "Vacation";
    if (/leave/.test(name) || ["L", "AL", "SL"].includes(code)) return "Leave";
    if (/holiday|eid|national|founding/.test(name) || ["H", "ND", "EID", "PH"].includes(code)) return "Holiday";
    return "Off";
  }
  if (t.type === "ON_CALL") return "On-call";
  if (t.type === "SPLIT") return "Broken";
  const hours = scheduledMinutes({ breakMin: 0, graceInMin: 0, graceOutMin: 0, overnight: false, id: "", ...t } as TemplateLike) / 60;
  const start = t.startMin;
  if (hours >= 11 && start >= 5 * 60 && start < 12 * 60) return "12h Day";
  if (start >= 4 * 60 && start < 13 * 60) return "Morning";
  if (start >= 13 * 60 && start < 20 * 60) return "Evening";
  return "Night";
}

export function isDutyGroup(g: RosterGroup): boolean {
  return DUTY_GROUPS.includes(g);
}

/** Cell colours per group (background, text) — shared by the web roster and the Excel export. */
export const GROUP_COLORS: Record<RosterGroup, { bg: string; fg: string }> = {
  Morning: { bg: "#DCEAFB", fg: "#1D4F91" },
  Evening: { bg: "#FDE9CC", fg: "#8A4B00" },
  Night: { bg: "#E3E0F7", fg: "#3B2F8F" },
  "12h Day": { bg: "#D4F1EA", fg: "#0B6B58" },
  Broken: { bg: "#F9DDEB", fg: "#8A1F5A" },
  "On-call": { bg: "#FDE2E1", fg: "#9B2C2C" },
  Off: { bg: "#ECEFF3", fg: "#475569" },
  Leave: { bg: "#DDF3E3", fg: "#17663A" },
  Holiday: { bg: "#FBDCDC", fg: "#9B1C1C" },
  Vacation: { bg: "#FFF1BF", fg: "#7A5B00" },
};

/** The roster period containing `anchor`, starting on `startDay` (1 = calendar month; 17 = 17th → 16th). */
export function periodRange(anchor: string, startDay: number): { from: string; to: string } {
  const day = Math.min(Math.max(Math.round(startDay) || 1, 1), 28);
  const a = parseDateISO(anchor);
  const start = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - (a.getUTCDate() < day ? 1 : 0), day));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day));
  return { from: toDateISO(start), to: addDays(toDateISO(next), -1) };
}

/** Working days = dates that are neither a weekend day nor a public holiday. */
export function workingDates(dates: string[], weekendDays: number[], holidays: Set<string>): string[] {
  return dates.filter((d) => !weekendDays.includes(dayOfWeek(d)) && !holidays.has(d));
}

/** Day-type marker used in the roster header: D working day, W weekend, H public holiday. */
export function dayType(date: string, weekendDays: number[], holidays: Set<string>): "D" | "W" | "H" {
  if (holidays.has(date)) return "H";
  return weekendDays.includes(dayOfWeek(date)) ? "W" : "D";
}

export interface RowCell {
  group: RosterGroup;
  minutes: number;
}

export interface RowSummary {
  dutyDays: number;
  offDays: number;
  leaveDays: number;
  plannedHours: number;
  requiredHours: number;
  diffHours: number;
}

/**
 * Totals for one staff row, as on the Excel roster:
 *  Duty days = days with a working shift; Off / Hol = day-off and holiday codes;
 *  Leave / Vac = leave and vacation codes plus approved leave on days without a shift;
 *  Required = working days × standard hours, minus approved leave (L) that falls on working days.
 *  Unpaid vacation (V) is not deducted from required hours.
 */
export function summarizeRow(input: {
  dates: string[];
  cells: Map<string, RowCell[]>;
  approvedLeave: Set<string>;
  working: Set<string>;
  standardHours: number;
}): RowSummary {
  let dutyDays = 0;
  let offDays = 0;
  let leaveDays = 0;
  let plannedMin = 0;
  let leaveOnWorking = 0;
  for (const d of input.dates) {
    const cells = input.cells.get(d) ?? [];
    const duty = cells.filter((c) => isDutyGroup(c.group));
    if (duty.length) dutyDays++;
    plannedMin += duty.reduce((s, c) => s + c.minutes, 0);
    const isLeave = cells.some((c) => c.group === "Leave") || (!duty.length && input.approvedLeave.has(d));
    if (isLeave || cells.some((c) => c.group === "Vacation")) leaveDays++;
    else if (!duty.length && cells.some((c) => c.group === "Off" || c.group === "Holiday")) offDays++;
    if (isLeave && input.working.has(d)) leaveOnWorking++;
  }
  const requiredHours = Math.max(0, input.working.size - leaveOnWorking) * input.standardHours;
  const plannedHours = Math.round((plannedMin / 60) * 100) / 100;
  return { dutyDays, offDays, leaveDays, plannedHours, requiredHours, diffHours: Math.round((plannedHours - requiredHours) * 100) / 100 };
}

/** Legend line as printed on the roster: "Morning Shift 2  08:00-16:00  (8h)". */
export function legendText(t: GroupInput & { name: string }): string {
  if (t.type === "OFF") return t.name;
  const first = `${minutesToHHMM(t.startMin)}-${minutesToHHMM(t.endMin)}`;
  const second = t.type === "SPLIT" && t.split2StartMin != null && t.split2EndMin != null ? ` & ${minutesToHHMM(t.split2StartMin)}-${minutesToHHMM(t.split2EndMin)}` : "";
  const hours = scheduledMinutes({ breakMin: 0, graceInMin: 0, graceOutMin: 0, overnight: false, id: "", ...t } as TemplateLike) / 60;
  return `${t.name}  ${first}${second}  (${Math.round(hours * 100) / 100}h)`;
}
