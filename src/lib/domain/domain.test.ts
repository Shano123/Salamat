import { describe, expect, it } from "vitest";
import { cannotActReason, initialStatus, nextStatus } from "./approval";
import { computeAttendance, matchPunches, pairUntyped } from "./attendance";
import { checkRoster, publishBlockers, RosterEmployee } from "./conflicts";
import { distanceMeters, insideFence } from "./geo";
import { mapPayroll, parseCsv, toCsv, DEFAULT_PAYROLL_COLUMNS } from "./payroll";
import { can, withDescendants } from "./permissions";
import { parsePunchRows, parsePunchType } from "./punchImport";
import { parseRosterSheet, planImport } from "./rosterImport";
import { applyRotation, copyWeek, parsePattern } from "./rotation";
import { DEFAULT_RULES, validateTemplate } from "./rules";
import { scheduledMinutes, shiftWindow, TemplateLike } from "./shift";
import { addDays, localDateISO, weekStartOf, zonedToUtc } from "./time";

const TZ = "Asia/Riyadh";
const tpl = (o: Partial<TemplateLike> & { id: string; code: string }): TemplateLike => ({
  type: "FIXED",
  startMin: 7 * 60,
  endMin: 15 * 60,
  breakMin: 0,
  graceInMin: 10,
  graceOutMin: 0,
  overnight: false,
  status: "APPROVED",
  ...o,
});
const M8 = tpl({ id: "m8", code: "M8", startMin: 7 * 60, endMin: 15 * 60, breakMin: 30, paidBreak: true });
const E8 = tpl({ id: "e8", code: "E8", startMin: 15 * 60, endMin: 23 * 60 });
const N8 = tpl({ id: "n8", code: "N8", startMin: 23 * 60, endMin: 7 * 60, overnight: true });
const D12 = tpl({ id: "d12", code: "D12", startMin: 7 * 60, endMin: 19 * 60, breakMin: 60 });
const N12 = tpl({ id: "n12", code: "N12", startMin: 19 * 60, endMin: 7 * 60, breakMin: 60, overnight: true });
const at = (date: string, hhmm: string) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ);

describe("time", () => {
  it("converts Riyadh wall time to UTC", () => {
    expect(zonedToUtc("2026-10-13", 7 * 60, TZ).toISOString()).toBe("2026-10-13T04:00:00.000Z");
    expect(localDateISO(new Date("2026-10-13T22:00:00Z"), TZ)).toBe("2026-10-14");
  });
  it("weeks start on Sunday", () => {
    expect(weekStartOf("2026-10-13")).toBe("2026-10-11");
  });
});

describe("shift templates", () => {
  it("computes overnight windows on the start date", () => {
    const w = shiftWindow("2026-10-13", N8, TZ)!;
    expect(w.start.toISOString()).toBe("2026-10-13T20:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-14T04:00:00.000Z");
    expect(scheduledMinutes(N12)).toBe(660);
  });
  it("validates against company rules", () => {
    expect(validateTemplate(M8, DEFAULT_RULES)).toEqual([]);
    expect(validateTemplate(D12, DEFAULT_RULES).join()).toMatch(/exceed the company maximum/);
    expect(validateTemplate(D12, { ...DEFAULT_RULES, maxDailyHours: 12 })).toEqual([]);
    expect(validateTemplate({ ...M8, endMin: 6 * 60 }, DEFAULT_RULES).join()).toMatch(/overnight/);
    expect(validateTemplate({ ...D12, breakMin: 0 }, { ...DEFAULT_RULES, maxDailyHours: 12 }).join()).toMatch(/break/);
  });
});

describe("roster conflicts", () => {
  const employees = new Map<string, RosterEmployee>([
    ["a", { id: "a", name: "Aisha", skills: ["BLS"], licenseExpiry: "2026-10-12" }],
    ["b", { id: "b", name: "Badr", skills: ["BLS", "CHARGE_NURSE"] }],
  ]);
  const templates = new Map([M8, E8, N8, D12].map((t) => [t.id, t]));
  const base = {
    rules: DEFAULT_RULES,
    departmentId: "icu",
    employees,
    templates,
    leave: [],
    staffing: [],
  };
  const A = (key: string, employeeId: string, date: string, templateId: string) => ({ key, employeeId, date, templateId, departmentId: "icu" });

  it("flags short rest and overlap", () => {
    const c = checkRoster({ ...base, dates: ["2026-10-13"], assignments: [A("1", "b", "2026-10-13", "m8"), A("2", "b", "2026-10-13", "d12")] });
    expect(c.map((x) => x.kind)).toContain("OVERLAP");
    const z = checkRoster({ ...base, dates: ["2026-10-13", "2026-10-14"], assignments: [A("1", "b", "2026-10-13", "n8"), A("2", "b", "2026-10-14", "m8")] });
    expect(z.map((x) => x.kind)).toEqual(["REST"]);
    const r = checkRoster({ ...base, dates: ["2026-10-13", "2026-10-14"], assignments: [A("1", "b", "2026-10-13", "e8"), A("2", "b", "2026-10-14", "m8")] });
    expect(r.map((x) => x.kind)).toEqual(["REST"]);
  });
  it("blocks expired license on clinical shift and warns missing skill / leave", () => {
    const clinical = new Map(templates);
    clinical.set("m8", { ...M8, isClinical: true, requiredSkills: ["ACLS"] });
    const c = checkRoster({
      ...base,
      templates: clinical,
      dates: ["2026-10-13"],
      leave: [{ employeeId: "a", from: "2026-10-13", to: "2026-10-15" }],
      assignments: [A("1", "a", "2026-10-13", "m8")],
    });
    expect(c.map((x) => x.kind).sort()).toEqual(["LICENSE_EXPIRED", "MISSING_SKILL", "ON_LEAVE"]);
    expect(publishBlockers(c, false).map((x) => x.kind)).toEqual(["LICENSE_EXPIRED"]);
  });
  it("checks minimum staffing per role and weekly hours", () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays("2026-10-11", i));
    const c = checkRoster({
      ...base,
      dates,
      staffing: [{ templateId: "m8", minCount: 1, skill: "CHARGE_NURSE" }],
      assignments: dates.map((d, i) => A(String(i), "a", d, "m8")),
    });
    expect(c.filter((x) => x.kind === "UNDERSTAFFED")).toHaveLength(7);
    expect(c.filter((x) => x.kind === "WEEKLY_HOURS")).toHaveLength(1);
    expect(publishBlockers(c.filter((x) => x.kind === "UNDERSTAFFED"), true)).toHaveLength(0);
  });
  it("flags unapproved templates", () => {
    const t = new Map(templates);
    t.set("m8", { ...M8, status: "PENDING" });
    const c = checkRoster({ ...base, templates: t, dates: ["2026-10-13"], assignments: [A("1", "b", "2026-10-13", "m8")] });
    expect(c[0].kind).toBe("TEMPLATE_NOT_APPROVED");
  });
});

describe("attendance", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  it("on time is present", () => {
    const r = computeAttendance({ date: "2026-10-13", template: M8, tz: TZ, now, punches: [
      { id: "1", type: "IN", timestamp: at("2026-10-13", "06:55") },
      { id: "2", type: "OUT", timestamp: at("2026-10-13", "15:02") },
    ] });
    expect(r.status).toBe("PRESENT");
    expect(r.workedMin).toBe(487);
    expect(r.overtimeMin).toBe(0);
    expect(r.unapprovedOvertimeMin).toBe(7);
  });
  it("late beyond grace counts full late minutes; early leave", () => {
    const r = computeAttendance({ date: "2026-10-13", template: M8, tz: TZ, now, punches: [
      { id: "1", type: "IN", timestamp: at("2026-10-13", "07:25") },
      { id: "2", type: "OUT", timestamp: at("2026-10-13", "14:30") },
    ] });
    expect(r.status).toBe("LATE_AND_EARLY");
    expect(r.lateMin).toBe(25);
    expect(r.earlyMin).toBe(30);
  });
  it("within grace is not late", () => {
    const r = computeAttendance({ date: "2026-10-13", template: M8, tz: TZ, now, punches: [
      { id: "1", type: "IN", timestamp: at("2026-10-13", "07:09") },
      { id: "2", type: "OUT", timestamp: at("2026-10-13", "15:00") },
    ] });
    expect(r.lateMin).toBe(0);
  });
  it("absent, scheduled, missing punch, leave, holiday", () => {
    const base = { date: "2026-10-13", template: M8, tz: TZ };
    expect(computeAttendance({ ...base, now, punches: [] }).status).toBe("ABSENT");
    expect(computeAttendance({ ...base, now: at("2026-10-13", "08:00"), punches: [] }).status).toBe("SCHEDULED");
    expect(computeAttendance({ ...base, now, punches: [{ id: "1", type: "IN", timestamp: at("2026-10-13", "07:00") }] }).status).toBe("MISSING_PUNCH");
    expect(computeAttendance({ ...base, now, onLeave: true, punches: [] }).status).toBe("ON_LEAVE");
    expect(computeAttendance({ ...base, now, isHoliday: true, punches: [] }).status).toBe("HOLIDAY");
  });
  it("overnight shift with approved overtime only", () => {
    const r = computeAttendance({ date: "2026-10-13", template: N12, tz: TZ, now, approvedOvertimeMin: 30, punches: [
      { id: "1", type: "IN", timestamp: at("2026-10-13", "18:50") },
      { id: "2", type: "OUT", timestamp: at("2026-10-14", "08:00") },
    ] });
    expect(r.status).toBe("PRESENT");
    expect(r.workedMin).toBe(13 * 60 + 10 - 60);
    expect(r.overtimeMin).toBe(30);
    expect(r.unapprovedOvertimeMin).toBe(40);
  });
  it("rounding", () => {
    const r = computeAttendance({ date: "2026-10-13", template: M8, tz: TZ, now, roundingMinutes: 15, punches: [
      { id: "1", type: "IN", timestamp: at("2026-10-13", "07:00") },
      { id: "2", type: "OUT", timestamp: at("2026-10-13", "14:50") },
    ] });
    expect(r.workedMin).toBe(465);
  });
  it("pairs untyped punches and matches to nearest shift including overnight", () => {
    const p = pairUntyped([
      { id: "2", type: null, timestamp: at("2026-10-14", "07:05") },
      { id: "1", type: null, timestamp: at("2026-10-13", "22:55") },
    ]);
    expect(p.map((x) => x.type)).toEqual(["IN", "OUT"]);
    const m = matchPunches(p, [
      { id: "night13", date: "2026-10-13", template: N8 },
      { id: "morning14", date: "2026-10-14", template: M8 },
    ], TZ);
    expect(m.get("1")).toBe("night13");
    expect(m.get("2")).toBe("night13");
  });
});

describe("approval chain", () => {
  const ctx = { type: "LEAVE" as const, lineManagerUserId: "l1", requesterUserId: "emp", needsHr: false };
  it("goes L1 → L2", () => {
    expect(initialStatus(ctx)).toBe("PENDING_L1");
    expect(nextStatus("PENDING_L1", "APPROVED", ctx)).toBe("PENDING_L2");
    expect(nextStatus("PENDING_L2", "APPROVED", ctx)).toBe("APPROVED");
    expect(nextStatus("PENDING_L1", "REJECTED", ctx)).toBe("REJECTED");
  });
  it("skips L1 when missing or requester is L1", () => {
    expect(initialStatus({ ...ctx, lineManagerUserId: null })).toBe("PENDING_L2");
    expect(initialStatus({ ...ctx, requesterUserId: "l1" })).toBe("PENDING_L2");
  });
  it("swap needs peer first; locked correction ends with HR", () => {
    const swap = { ...ctx, type: "SWAP" as const };
    expect(initialStatus(swap)).toBe("PENDING_PEER");
    expect(nextStatus("PENDING_PEER", "APPROVED", swap)).toBe("PENDING_L1");
    const corr = { ...ctx, type: "CORRECTION" as const, needsHr: true };
    expect(nextStatus("PENDING_L2", "APPROVED", corr)).toBe("PENDING_HR");
  });
  it("nobody approves their own request", () => {
    const req = { status: "PENDING_L2" as const, requesterId: "e1", requesterUserId: "u1", targetEmployeeId: null, departmentId: "d" };
    expect(cannotActReason({ userId: "u1", role: "DEPT_MANAGER", departments: ["d"], teamEmployeeIds: [], employeeId: "e1" }, req)).toMatch(/own/);
    expect(cannotActReason({ userId: "u2", role: "DEPT_MANAGER", departments: ["d"], teamEmployeeIds: [], employeeId: "e2" }, req)).toBeNull();
    expect(cannotActReason({ userId: "u3", role: "LINE_MANAGER", departments: [], teamEmployeeIds: ["e1"], employeeId: "e3" }, req)).toMatch(/department manager/);
  });
});

describe("permissions", () => {
  it("follows the matrix", () => {
    expect(can("DEPT_MANAGER", "roster.publish")).toBe(true);
    expect(can("LINE_MANAGER", "roster.publish")).toBe(false);
    expect(can("HR_VIEWER", "payroll.export")).toBe(false);
    expect(can("HR_ADMIN", "periods.lock")).toBe(true);
  });
  it("expands department trees", () => {
    const all = [{ id: "a", parentId: null }, { id: "b", parentId: "a" }, { id: "c", parentId: "b" }, { id: "d", parentId: null }];
    expect(withDescendants(["a"], all).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("roster import", () => {
  const ctx = {
    departmentId: "icu",
    employees: [{ id: "a", employeeNo: "1001", departmentId: "icu" }, { id: "x", employeeNo: "2001", departmentId: "er" }],
    templates: [{ id: "d12", code: "D12" }, { id: "off", code: "OFF" }],
    locations: [{ id: "l1", name: "Main" }],
  };
  it("parses grid layout with per-cell errors", () => {
    const r = parseRosterSheet([
      ["Employee No", "Name", "2026-10-11", "2026-10-12"],
      ["1001", "Aisha", "D12", "N99"],
      ["2001", "Other", "D12", ""],
      ["9999", "Ghost", "D12", ""],
    ], ctx);
    expect(r.layout).toBe("GRID");
    expect(r.assignments).toHaveLength(1);
    expect(r.errors.map((e) => [e.row, e.col])).toEqual([[2, 4], [3, 1], [4, 1]]);
  });
  it("parses row layout", () => {
    const r = parseRosterSheet([
      ["employee_no", "date", "shift_code", "branch"],
      ["1001", "13/10/2026", "d12", "Main"],
    ], ctx);
    expect(r.layout).toBe("ROWS");
    expect(r.assignments[0]).toMatchObject({ employeeId: "a", date: "2026-10-13", templateId: "d12", locationId: "l1" });
  });
  it("plans merge vs replace", () => {
    const parsed = [{ key: "k", row: 2, col: 3, employeeId: "a", date: "2026-10-13", templateId: "d12", locationId: null }];
    const existing = [{ id: "e", employeeId: "a", date: "2026-10-13", status: "PUBLISHED" as const }];
    expect(planImport(parsed, existing, "MERGE").skipped).toHaveLength(1);
    const rep = planImport(parsed, existing, "REPLACE");
    expect(rep.replace).toHaveLength(1);
    expect(rep.touchesPublished).toBe(true);
  });
});

describe("punch import", () => {
  it("parses types, dedupes, rejects locked periods", () => {
    expect(parsePunchType("C/In")).toBe("IN");
    expect(parsePunchType("weird")).toBe("INVALID");
    const ok = zonedToUtc("2026-10-13", 7 * 60, TZ);
    const p = parsePunchRows(
      ["emp", "date", "time", "type"],
      [
        ["1001", "2026-10-13", "07:00", "in"],
        ["1001", "2026-10-13", "15:00", "out"],
        ["1001", "2026-09-01", "07:00", "in"],
        ["1001", "2026-10-13", "15:00", "out"],
        ["9", "2026-10-13", "07:00", ""],
      ],
      { employeeNo: "emp", date: "date", time: "time", type: "type" },
      { tz: TZ, employees: new Map([["1001", "a"]]), lockedRanges: [{ from: "2026-09-01", to: "2026-09-30" }], existingKeys: new Set([`a|${ok.toISOString()}`]) },
    );
    expect(p.ok).toHaveLength(1);
    expect(p.duplicates).toHaveLength(2);
    expect(p.errors.map((e) => e.row)).toEqual([4, 6]);
  });
});

describe("rotation, payroll, geo", () => {
  it("applies 4-on/4-off with stagger", () => {
    const { pattern } = parsePattern("D12 D12 D12 D12 OFF OFF OFF OFF", new Map([["D12", "d12"]]));
    const r = applyRotation({ employeeIds: ["a", "b"], start: "2026-10-11", weeks: 1, pattern, staggerDays: 4 });
    expect(r.filter((x) => x.employeeId === "a").map((x) => x.date)).toEqual(["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(r.filter((x) => x.employeeId === "b").map((x) => x.date)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17"]);
    expect(copyWeek([{ date: "2026-10-11" }], "2026-10-11", "2026-10-18")[0].date).toBe("2026-10-18");
  });
  it("maps payroll columns and round-trips CSV", () => {
    const { headers, data } = mapPayroll([{ employeeNo: "1", nameEn: "A, B", nameAr: "", department: "", costCenter: "CC1", periodStart: "", periodEnd: "", scheduledShifts: 0, scheduledHours: 0, workedHours: 8, overtimeHours: 0, overtimePaidHours: 0, toilHours: 0, lateMinutes: 0, earlyMinutes: 0, absentDays: 0, leaveDays: 0, onCallShifts: 0, missingPunches: 0 }], DEFAULT_PAYROLL_COLUMNS);
    const csv = toCsv(headers, data);
    expect(parseCsv(csv)[1][1]).toBe("A, B");
  });
  it("geofence", () => {
    expect(Math.round(distanceMeters(24.7136, 46.6753, 24.7146, 46.6753))).toBe(111);
    expect(insideFence(24.7137, 46.6753, [{ id: "x", lat: 24.7136, lng: 46.6753, geofenceM: 100 }])?.id).toBe("x");
  });
});
