import { DAY_MIN, MIN, zonedToUtc } from "./time";

export type ShiftTypeName = "FIXED" | "SPLIT" | "FLEXIBLE" | "ON_CALL" | "OFF";
export type TemplateStatusName = "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";

export interface TemplateLike {
  id: string;
  code: string;
  type: ShiftTypeName;
  startMin: number;
  endMin: number;
  split2StartMin?: number | null;
  split2EndMin?: number | null;
  coreStartMin?: number | null;
  coreEndMin?: number | null;
  totalHours?: number | null;
  breakMin: number;
  paidBreak?: boolean;
  graceInMin: number;
  graceOutMin: number;
  overnight: boolean;
  isClinical?: boolean;
  requiredSkills?: string[];
  status?: TemplateStatusName;
}

export interface Segment {
  start: Date;
  end: Date;
}

/** Duration in minutes of a start→end pair, wrapping past midnight. */
export function spanMinutes(startMin: number, endMin: number): number {
  const d = endMin - startMin;
  return d > 0 ? d : d + DAY_MIN;
}

/** Wall-clock segments of the shift as minute offsets from the shift date's midnight. */
export function segmentOffsets(t: TemplateLike): Array<[number, number]> {
  if (t.type === "OFF") return [];
  const first: [number, number] = [t.startMin, t.startMin + spanMinutes(t.startMin, t.endMin)];
  if (t.type === "SPLIT" && t.split2StartMin != null && t.split2EndMin != null) {
    let s2 = t.split2StartMin;
    if (s2 < t.startMin) s2 += DAY_MIN;
    return [first, [s2, s2 + spanMinutes(t.split2StartMin, t.split2EndMin)]];
  }
  return [first];
}

/** Paid scheduled minutes of a shift (on-call counts as 0 until called in). */
export function scheduledMinutes(t: TemplateLike): number {
  if (t.type === "OFF" || t.type === "ON_CALL") return 0;
  if (t.type === "FLEXIBLE" && t.totalHours) return Math.round(t.totalHours * 60);
  const gross = segmentOffsets(t).reduce((s, [a, b]) => s + (b - a), 0);
  return gross - (t.paidBreak ? 0 : t.breakMin);
}

/** Gross span in minutes from first start to last end (used for overlap / rest). */
export function spanOf(t: TemplateLike): [number, number] | null {
  const segs = segmentOffsets(t);
  if (!segs.length) return null;
  return [segs[0][0], segs[segs.length - 1][1]];
}

export function shiftSegments(dateISO: string, t: TemplateLike, tz: string): Segment[] {
  return segmentOffsets(t).map(([a, b]) => {
    const start = zonedToUtc(dateISO, 0, tz);
    return { start: new Date(start.getTime() + a * MIN), end: new Date(start.getTime() + b * MIN) };
  });
}

export function shiftWindow(dateISO: string, t: TemplateLike, tz: string): Segment | null {
  const segs = shiftSegments(dateISO, t, tz);
  if (!segs.length) return null;
  return { start: segs[0].start, end: segs[segs.length - 1].end };
}

export function crossesMidnight(t: TemplateLike): boolean {
  const span = spanOf(t);
  return !!span && span[1] > DAY_MIN;
}
