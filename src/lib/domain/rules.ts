import { crossesMidnight, scheduledMinutes, segmentOffsets, spanMinutes, TemplateLike } from "./shift";

export interface CompanyRulesLike {
  maxDailyHours: number;
  maxWeeklyHours: number;
  ramadanMaxDailyHours: number;
  ramadanMaxWeeklyHours: number;
  ramadanStart?: string | null;
  ramadanEnd?: string | null;
  minRestHours: number;
  minBreakMinutes: number;
  breakRequiredAfterHours: number;
  graceMinutes: number;
  correctionWindowDays: number;
  publishDeadlineDays: number;
  roundingMinutes: number;
  editNoticeHours: number;
  timezone: string;
}

export const DEFAULT_RULES: CompanyRulesLike = {
  maxDailyHours: 8,
  maxWeeklyHours: 48,
  ramadanMaxDailyHours: 6,
  ramadanMaxWeeklyHours: 36,
  ramadanStart: null,
  ramadanEnd: null,
  minRestHours: 11,
  minBreakMinutes: 30,
  breakRequiredAfterHours: 6,
  graceMinutes: 10,
  correctionWindowDays: 7,
  publishDeadlineDays: 7,
  roundingMinutes: 0,
  editNoticeHours: 48,
  timezone: "Asia/Riyadh",
};

/**
 * Validates a shift template against HR's company rules. Department managers can
 * only save templates that pass; HR still has to approve before roster use.
 */
export function validateTemplate(t: TemplateLike, rules: CompanyRulesLike): string[] {
  const errors: string[] = [];
  if (!/^[A-Z0-9_-]{1,8}$/i.test(t.code)) errors.push("Code must be 1–8 letters or digits.");
  if (t.type === "OFF") return errors;

  for (const v of [t.startMin, t.endMin]) {
    if (v < 0 || v >= 1440) errors.push("Start and end must be between 00:00 and 23:59.");
  }
  if (t.startMin === t.endMin) errors.push("Start and end cannot be equal.");
  if (!t.overnight && t.endMin < t.startMin && t.type !== "SPLIT") {
    errors.push("End is before start: mark the template as overnight.");
  }
  if (t.overnight && !crossesMidnight(t)) errors.push("Overnight is set but the shift does not cross midnight.");
  if (t.breakMin < 0) errors.push("Break cannot be negative.");
  if (t.graceInMin < 0 || t.graceOutMin < 0) errors.push("Grace minutes cannot be negative.");

  if (t.type === "SPLIT") {
    if (t.split2StartMin == null || t.split2EndMin == null) {
      errors.push("A split shift needs a second segment.");
    } else {
      const [a, b] = segmentOffsets(t);
      if (b && b[0] < a[1]) errors.push("Split shift segments overlap.");
    }
  }
  if (t.type === "FLEXIBLE") {
    if (!t.totalHours || t.totalHours <= 0) errors.push("A flexible shift needs total hours.");
    if (t.coreStartMin == null || t.coreEndMin == null) errors.push("A flexible shift needs core hours.");
    else if (spanMinutes(t.coreStartMin, t.coreEndMin) > spanMinutes(t.startMin, t.endMin)) {
      errors.push("Core hours must fit inside the flexible window.");
    }
  }
  if (t.type === "ON_CALL") return errors;

  const paidHours = scheduledMinutes(t) / 60;
  if (paidHours > rules.maxDailyHours) {
    errors.push(`Paid hours (${paidHours.toFixed(2)}) exceed the company maximum of ${rules.maxDailyHours} per day.`);
  }
  if (t.type === "FLEXIBLE" && t.totalHours && t.totalHours * 60 > spanMinutes(t.startMin, t.endMin)) {
    errors.push("Total hours do not fit inside the flexible window.");
  }
  const grossHours = segmentOffsets(t).reduce((s, [a, b]) => s + (b - a), 0) / 60;
  if (grossHours > rules.breakRequiredAfterHours && t.breakMin < rules.minBreakMinutes) {
    errors.push(
      `Shifts longer than ${rules.breakRequiredAfterHours}h need at least ${rules.minBreakMinutes} minutes of break.`,
    );
  }
  return errors;
}

export function isRamadan(dateISO: string, rules: CompanyRulesLike): boolean {
  return !!rules.ramadanStart && !!rules.ramadanEnd && dateISO >= rules.ramadanStart && dateISO <= rules.ramadanEnd;
}

export function dailyLimitHours(dateISO: string, rules: CompanyRulesLike, ramadanApplies: boolean): number {
  return ramadanApplies && isRamadan(dateISO, rules) ? rules.ramadanMaxDailyHours : rules.maxDailyHours;
}

export function weeklyLimitHours(weekDates: string[], rules: CompanyRulesLike, ramadanApplies: boolean): number {
  return ramadanApplies && weekDates.some((d) => isRamadan(d, rules)) ? rules.ramadanMaxWeeklyHours : rules.maxWeeklyHours;
}
