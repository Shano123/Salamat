import { describe, expect, it } from "vitest";
import { computeAttendance, pairUntyped } from "./attendance";
import { dayType, legendText, periodRange, RowCell, shiftGroup, summarizeRow, workingDates } from "./dutyRoster";
import { buildEmployeeMap, lookupEmployee } from "./employeeNo";
import { parsePunchRows } from "./punchImport";
import { parseRosterSheet } from "./rosterImport";
import { DEFAULT_RULES, validateTemplate } from "./rules";
import { TemplateLike } from "./shift";
import { dateRange, zonedToUtc } from "./time";

const TZ = "Asia/Riyadh";
const tpl = (o: Partial<TemplateLike> & { code: string; name?: string }) =>
  ({ id: o.code, type: "FIXED", startMin: 0, endMin: 0, breakMin: 30, paidBreak: true, graceInMin: 15, graceOutMin: 15, overnight: false, ...o }) as TemplateLike & { name: string };
const at = (date: string, hhmm: string) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ);

describe("duty roster (Excel Duty Roster sheet)", () => {
  it("roster period runs from the start day to the day before it next month", () => {
    expect(periodRange("2026-10-14", 17)).toEqual({ from: "2026-09-17", to: "2026-10-16" });
    expect(periodRange("2026-10-17", 17)).toEqual({ from: "2026-10-17", to: "2026-11-16" });
    expect(periodRange("2026-01-05", 17)).toEqual({ from: "2025-12-17", to: "2026-01-16" });
    expect(periodRange("2026-02-10", 1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("derives shift groups like the Shifts sheet", () => {
    expect(shiftGroup(tpl({ code: "M2", startMin: 480, endMin: 960 }))).toBe("Morning");
    expect(shiftGroup(tpl({ code: "E2", startMin: 840, endMin: 1320 }))).toBe("Evening");
    expect(shiftGroup(tpl({ code: "E1", startMin: 960, endMin: 0 }))).toBe("Evening");
    expect(shiftGroup(tpl({ code: "N1", startMin: 0, endMin: 480 }))).toBe("Night");
    expect(shiftGroup(tpl({ code: "N12", startMin: 1200, endMin: 480 }))).toBe("Night");
    expect(shiftGroup(tpl({ code: "D12", startMin: 480, endMin: 1200 }))).toBe("12h Day");
    expect(shiftGroup(tpl({ code: "B1", type: "SPLIT", startMin: 480, endMin: 720, split2StartMin: 1020, split2EndMin: 1260 }))).toBe("Broken");
    expect(shiftGroup(tpl({ code: "X", type: "OFF", name: "Day off" }))).toBe("Off");
    expect(shiftGroup(tpl({ code: "L", type: "OFF", name: "Leave" }))).toBe("Leave");
    expect(shiftGroup(tpl({ code: "EID", type: "OFF", name: "Eid Holiday Off" }))).toBe("Holiday");
    expect(shiftGroup(tpl({ code: "ND", type: "OFF", name: "National Day off" }))).toBe("Holiday");
    expect(shiftGroup(tpl({ code: "V", type: "OFF", name: "Unpaid Vacation" }))).toBe("Vacation");
    expect(legendText(tpl({ code: "M2", name: "Morning Shift 2", startMin: 480, endMin: 960 }))).toBe("Morning Shift 2  08:00-16:00  (8h)");
  });

  it("counts working days and row totals as the Excel roster does", () => {
    const dates = dateRange("2026-09-17", "2026-10-16");
    const holidays = new Set(["2026-09-23"]);
    const working = new Set(workingDates(dates, [5], holidays));
    expect(working.size).toBe(24); // 30 days − 5 Fridays − Saudi National Day
    expect(dayType("2026-09-18", [5], holidays)).toBe("W");
    expect(dayType("2026-09-23", [5], holidays)).toBe("H");

    const every = (g: RowCell["group"], minutes: number) => new Map(dates.map((d) => [d, [{ group: g, minutes }]]));
    // E1 every day: 30 duty days × 8h = 240 planned vs 192 required → +48
    expect(summarizeRow({ dates, cells: every("Evening", 480), approvedLeave: new Set(), working, standardHours: 8 })).toEqual({ dutyDays: 30, offDays: 0, leaveDays: 0, plannedHours: 240, requiredHours: 192, diffHours: 48 });
    // Unpaid vacation all period: required hours are not reduced → −192
    expect(summarizeRow({ dates, cells: every("Vacation", 0), approvedLeave: new Set(), working, standardHours: 8 })).toMatchObject({ dutyDays: 0, leaveDays: 30, requiredHours: 192, diffHours: -192 });
    // Approved leave on 2 working days reduces required hours by 16
    const leave = summarizeRow({ dates, cells: new Map(), approvedLeave: new Set(["2026-09-17", "2026-09-18"]), working, standardHours: 8 });
    expect(leave).toMatchObject({ leaveDays: 2, requiredHours: 184 });
  });

  it("imports the Duty Roster sheet layout (title rows, Staff ID column, coverage block)", () => {
    const d1 = new Date("2026-09-17T00:00:00Z");
    const d2 = new Date("2026-09-18T00:00:00Z");
    const r = parseRosterSheet(
      [
        ["SALAMAT CARE HOSPITAL"],
        ["MONTHLY  STAFF  DUTY  ROSTER"],
        [],
        [],
        ["DEPARTMENT", null, null, null, "PERIOD FROM"],
        ["Driver", null, null, null, d1],
        [],
        ["No.", "Staff Name", "Staff ID", "Designation", d1, d2, "Duty\nDays"],
        [null, null, null, null, "Thu", "Fri"],
        [null, null, null, null, "D", "W"],
        [1, "Norberto", "091070", null, "E1", "x", 30],
        [2, "Kamal", 93034, null, "N1", "", 30],
        [],
        ["DAILY COVERAGE  (staff on duty)", null, "Min req."],
        ["Morning", null, 2, "Morning", 3, 2],
      ],
      {
        departmentId: "drv",
        employees: [{ id: "a", employeeNo: "091070", departmentId: "drv" }, { id: "b", employeeNo: "093034", departmentId: "drv" }],
        templates: [{ id: "e1", code: "E1" }, { id: "n1", code: "N1" }, { id: "x", code: "X" }],
        locations: [],
      },
    );
    expect(r.errors).toEqual([]);
    expect(r.assignments.map((a) => [a.employeeId, a.date, a.templateId])).toEqual([
      ["a", "2026-09-17", "e1"],
      ["a", "2026-09-18", "x"],
      ["b", "2026-09-17", "n1"],
    ]);
  });
});

describe("raw fingerprint punches", () => {
  it("matches device EmpIDs that lost the leading zero", () => {
    const m = buildEmployeeMap([{ employeeNo: "091070", value: "a" }, { employeeNo: "1001", value: "b" }]);
    expect(lookupEmployee(m, "91070")).toBe("a");
    expect(lookupEmployee(m, 91070)).toBe("a");
    expect(lookupEmployee(m, "091070")).toBe("a");
    expect(lookupEmployee(m, "01001")).toBe("b");
    expect(lookupEmployee(m, "999")).toBeUndefined();
    const amb = buildEmployeeMap([{ employeeNo: "0123", value: "x" }, { employeeNo: "00123", value: "y" }]);
    expect(lookupEmployee(amb, "123")).toBeUndefined();
  });

  it("parses the Raw Punch sheet (EmpID | Day | Date | Time | Date and Time)", () => {
    const p = parsePunchRows(
      ["EmpID", "Day", "Date", "Time", "Date and Time"],
      [["91070", "Wednesday", new Date("2026-09-16T00:00:00Z"), new Date("1899-12-30T16:00:46Z"), new Date("2026-09-16T16:00:46Z")]],
      { employeeNo: "EmpID", date: "Date", time: "Time", datetime: "Date and Time" },
      { tz: TZ, employees: buildEmployeeMap([{ employeeNo: "091070", value: "a" }]), lockedRanges: [], existingKeys: new Set() },
    );
    expect(p.errors).toEqual([]);
    expect(p.ok[0]).toMatchObject({ employeeId: "a", type: null });
    expect(p.ok[0].timestamp.toISOString()).toBe(at("2026-09-16", "16:00").toISOString());
  });

  it("reads IN / OUT around the shift; trips in between do not change hours", () => {
    const E1 = tpl({ code: "E1", startMin: 960, endMin: 0 });
    const punches = [
      { id: "in", type: null, timestamp: at("2026-09-17", "15:58") },
      { id: "trip1", type: null, timestamp: at("2026-09-17", "18:10") },
      { id: "trip2", type: null, timestamp: at("2026-09-17", "19:40") },
      { id: "out", type: null, timestamp: at("2026-09-18", "00:01") },
    ];
    const r = computeAttendance({ date: "2026-09-17", template: E1, tz: TZ, punches, now: new Date("2026-10-01") });
    expect(r.status).toBe("PRESENT");
    expect(r.workedMin).toBe(483);
    expect(pairUntyped(punches).map((p) => p.type)).toEqual(["IN", null, null, "OUT"]);
  });

  it("a single punch near shift end is a missing IN, not a late arrival", () => {
    const N1 = tpl({ code: "N1", startMin: 0, endMin: 480 });
    const r = computeAttendance({ date: "2026-09-20", template: N1, tz: TZ, punches: [{ id: "1", type: null, timestamp: at("2026-09-20", "08:02") }], now: new Date("2026-10-01") });
    expect(r.status).toBe("MISSING_PUNCH");
    expect(r.lateMin).toBe(0);
    const late = computeAttendance({ date: "2026-09-20", template: N1, tz: TZ, now: new Date("2026-10-01"), punches: [
      { id: "1", type: null, timestamp: at("2026-09-20", "00:25") },
      { id: "2", type: null, timestamp: at("2026-09-20", "08:00") },
    ] });
    expect(late).toMatchObject({ status: "LATE", lateMin: 25 });
  });

  it("a shift ending at midnight (16:00–00:00) is valid without the overnight flag", () => {
    expect(validateTemplate(tpl({ code: "E1", startMin: 960, endMin: 0 }), DEFAULT_RULES)).toEqual([]);
  });
});
