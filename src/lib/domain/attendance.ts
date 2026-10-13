import { scheduledMinutes, shiftSegments, shiftWindow, TemplateLike } from "./shift";
import { MIN, minutesBetween, zonedToUtc } from "./time";

export type PunchKind = "IN" | "OUT" | "BREAK_START" | "BREAK_END";

export interface PunchLike {
  id: string;
  timestamp: Date;
  type: PunchKind | null;
}

export interface ScheduledShift {
  id: string;
  date: string;
  template: TemplateLike;
}

/** How far outside a shift's window a punch can still belong to it. */
export const MATCH_TOLERANCE_MIN = 4 * 60;

/**
 * Matches each punch to the nearest scheduled shift (overnight shifts included).
 * A punch is a candidate for a shift if it falls within the shift window ± tolerance;
 * among candidates the shift whose start (for IN) or end (for OUT) is closest wins.
 */
export function matchPunches(punches: PunchLike[], shifts: ScheduledShift[], tz: string): Map<string, string | null> {
  const windows = shifts
    .map((s) => ({ s, w: shiftWindow(s.date, s.template, tz) }))
    .filter((x): x is { s: ScheduledShift; w: { start: Date; end: Date } } => !!x.w);
  const result = new Map<string, string | null>();
  for (const p of punches) {
    const t = p.timestamp.getTime();
    let best: { id: string; dist: number } | null = null;
    for (const { s, w } of windows) {
      const lo = w.start.getTime() - MATCH_TOLERANCE_MIN * MIN;
      const hi = w.end.getTime() + MATCH_TOLERANCE_MIN * MIN;
      if (t < lo || t > hi) continue;
      const toStart = Math.abs(t - w.start.getTime());
      const toEnd = Math.abs(t - w.end.getTime());
      const dist = p.type === "IN" ? toStart : p.type === "OUT" ? toEnd : Math.min(toStart, toEnd, t >= w.start.getTime() && t <= w.end.getTime() ? 0 : Infinity);
      if (!best || dist < best.dist) best = { id: s.id, dist };
    }
    result.set(p.id, best?.id ?? null);
  }
  return result;
}

/** Assigns IN/OUT to untyped punches by time: first is IN, last is OUT, pairs in between are breaks. */
export function pairUntyped(punches: PunchLike[]): PunchLike[] {
  const sorted = [...punches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (sorted.every((p) => p.type)) return sorted;
  const untyped = sorted.filter((p) => !p.type);
  return sorted.map((p) => {
    if (p.type) return p;
    const i = untyped.indexOf(p);
    let type: PunchKind;
    if (i === 0) type = "IN";
    else if (i === untyped.length - 1) type = "OUT";
    else type = i % 2 === 1 ? "BREAK_START" : "BREAK_END";
    return { ...p, type };
  });
}

export type AttendanceStatusName =
  | "PRESENT"
  | "LATE"
  | "EARLY_LEAVE"
  | "LATE_AND_EARLY"
  | "ABSENT"
  | "ON_LEAVE"
  | "OFF_DAY"
  | "HOLIDAY"
  | "MISSING_PUNCH"
  | "SCHEDULED"
  | "ON_CALL";

export interface AttendanceInput {
  date: string;
  template: TemplateLike;
  tz: string;
  punches: PunchLike[];
  now: Date;
  onLeave?: boolean;
  isHoliday?: boolean;
  /** Pre-approved overtime minutes for this shift. Only approved overtime counts. */
  approvedOvertimeMin?: number;
  roundingMinutes?: number;
}

export interface AttendanceResult {
  status: AttendanceStatusName;
  workedMin: number;
  lateMin: number;
  earlyMin: number;
  overtimeMin: number;
  unapprovedOvertimeMin: number;
  missingPunch: boolean;
  firstIn: Date | null;
  lastOut: Date | null;
}

const EMPTY = { workedMin: 0, lateMin: 0, earlyMin: 0, overtimeMin: 0, unapprovedOvertimeMin: 0, missingPunch: false, firstIn: null, lastOut: null };

function roundDown(mins: number, step: number): number {
  return step > 0 ? Math.floor(mins / step) * step : mins;
}

export function computeAttendance(input: AttendanceInput): AttendanceResult {
  const { date, template: t, tz, now } = input;
  const punches = pairUntyped(input.punches);
  if (t.type === "OFF") return { ...EMPTY, status: "OFF_DAY" };
  if (input.onLeave) return { ...EMPTY, status: "ON_LEAVE" };

  const window = shiftWindow(date, t, tz)!;
  const ins = punches.filter((p) => p.type === "IN");
  const outs = punches.filter((p) => p.type === "OUT");
  const firstIn = ins[0]?.timestamp ?? null;
  const lastOut = outs.length ? outs[outs.length - 1].timestamp : null;

  if (!firstIn) {
    if (t.type === "ON_CALL") return { ...EMPTY, status: "ON_CALL" };
    if (input.isHoliday) return { ...EMPTY, status: "HOLIDAY" };
    if (lastOut) return { ...EMPTY, lastOut, missingPunch: true, status: "MISSING_PUNCH" };
    return { ...EMPTY, status: now < window.end ? "SCHEDULED" : "ABSENT" };
  }

  // Lateness is measured against the shift start (or core start for flexible shifts).
  const lateRef = t.type === "FLEXIBLE" && t.coreStartMin != null ? zonedToUtc(date, t.coreStartMin, tz) : window.start;
  const earlyRef =
    t.type === "FLEXIBLE" && t.coreEndMin != null
      ? (() => {
          const core = zonedToUtc(date, t.coreEndMin!, tz);
          return core < lateRef ? new Date(core.getTime() + 1440 * MIN) : core;
        })()
      : window.end;
  const lateRaw = Math.max(0, minutesBetween(lateRef, firstIn));
  const lateMin = t.type === "ON_CALL" ? 0 : lateRaw > t.graceInMin ? lateRaw : 0;

  if (!lastOut || lastOut <= firstIn) {
    const missing = now >= window.end;
    return {
      ...EMPTY,
      firstIn,
      lateMin,
      missingPunch: missing,
      status: missing ? "MISSING_PUNCH" : lateMin ? "LATE" : "PRESENT",
    };
  }

  const earlyRaw = Math.max(0, minutesBetween(lastOut, earlyRef));
  const earlyMin = t.type === "ON_CALL" ? 0 : earlyRaw > t.graceOutMin ? earlyRaw : 0;

  // Worked time = presence minus tracked breaks, or minus the unpaid template break.
  let presence = minutesBetween(firstIn, lastOut);
  const breakStarts = punches.filter((p) => p.type === "BREAK_START");
  const breakEnds = punches.filter((p) => p.type === "BREAK_END");
  let tracked = 0;
  for (let i = 0; i < Math.min(breakStarts.length, breakEnds.length); i++) {
    tracked += Math.max(0, minutesBetween(breakStarts[i].timestamp, breakEnds[i].timestamp));
  }
  if (t.type === "SPLIT") {
    const segs = shiftSegments(date, t, tz);
    if (segs.length === 2 && ins.length < 2) presence -= Math.max(0, minutesBetween(segs[0].end, segs[1].start));
  }
  const unpaidBreak = t.paidBreak ? 0 : Math.max(tracked, t.type === "ON_CALL" ? 0 : t.breakMin);
  const workedMin = roundDown(Math.max(0, presence - (presence > unpaidBreak ? unpaidBreak : 0)), input.roundingMinutes ?? 0);

  const scheduled = scheduledMinutes(t);
  const extra = t.type === "ON_CALL" ? 0 : Math.max(0, workedMin - scheduled);
  const approved = input.approvedOvertimeMin ?? 0;
  // On-call call-in time is paid under its own pay code, so it is reported as worked time.
  const overtimeMin = Math.min(extra, approved);
  const unapprovedOvertimeMin = extra - overtimeMin;

  let status: AttendanceStatusName = "PRESENT";
  if (lateMin && earlyMin) status = "LATE_AND_EARLY";
  else if (lateMin) status = "LATE";
  else if (earlyMin) status = "EARLY_LEAVE";

  return { status, workedMin, lateMin, earlyMin, overtimeMin, unapprovedOvertimeMin, missingPunch: false, firstIn, lastOut };
}
