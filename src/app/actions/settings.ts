"use server";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ActionState, num, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { parseDateISO } from "@/lib/domain/time";

export async function saveRules(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("rules.edit");
    const rs = optStr(fd, "ramadanStart");
    const re = optStr(fd, "ramadanEnd");
    if ((rs && !re) || (!rs && re) || (rs && re && re < rs)) throw new Error("Ramadan needs both a start and an end date.");
    const data = {
      maxDailyHours: num(fd, "maxDailyHours"),
      maxWeeklyHours: num(fd, "maxWeeklyHours"),
      ramadanMaxDailyHours: num(fd, "ramadanMaxDailyHours"),
      ramadanMaxWeeklyHours: num(fd, "ramadanMaxWeeklyHours"),
      ramadanStart: rs ? parseDateISO(rs) : null,
      ramadanEnd: re ? parseDateISO(re) : null,
      minRestHours: num(fd, "minRestHours"),
      minBreakMinutes: num(fd, "minBreakMinutes"),
      breakRequiredAfterHours: num(fd, "breakRequiredAfterHours"),
      graceMinutes: num(fd, "graceMinutes"),
      overtimeRatePercent: num(fd, "overtimeRatePercent"),
      correctionWindowDays: num(fd, "correctionWindowDays"),
      publishDeadlineDays: num(fd, "publishDeadlineDays"),
      roundingMinutes: num(fd, "roundingMinutes"),
      missedClockInAlertMinutes: num(fd, "missedClockInAlertMinutes"),
      editNoticeHours: num(fd, "editNoticeHours"),
      toilExpiryDays: num(fd, "toilExpiryDays"),
      defaultWeekendDays: fd.getAll("defaultWeekendDays").map(Number),
      timezone: str(fd, "timezone") || "Asia/Riyadh",
      organizationName: str(fd, "organizationName") || "Salamat Care Hospital",
      rosterStartDay: num(fd, "rosterStartDay"),
      standardDailyHours: num(fd, "standardDailyHours"),
    };
    if (!Number.isInteger(data.rosterStartDay) || data.rosterStartDay < 1 || data.rosterStartDay > 28) throw new Error("Roster period start day must be 1–28.");
    if (data.standardDailyHours <= 0 || data.standardDailyHours > 24) throw new Error("Standard duty hours must be 1–24.");
    if (data.maxDailyHours <= 0 || data.maxDailyHours > 24) throw new Error("Max daily hours must be 1–24.");
    if (![0, 5, 10, 15, 30].includes(data.roundingMinutes)) throw new Error("Rounding must be 0, 5, 10, 15 or 30 minutes.");
    const before = await db.companyRules.findUnique({ where: { id: 1 } });
    const after = await db.companyRules.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await audit(db, user, "CompanyRules", "1", "UPDATE", before, after, optStr(fd, "reason"));
    return "Company rules saved. New templates and rosters are checked against them.";
  }, "/settings");
}
