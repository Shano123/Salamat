import "server-only";
import { db } from "./db";
import { CompanyRulesLike, DEFAULT_RULES } from "./domain/rules";
import { toDateISO } from "./domain/time";

export async function getRules(): Promise<CompanyRulesLike & { overtimeRatePercent: number; missedClockInAlertMinutes: number; toilExpiryDays: number; defaultWeekendDays: number[] }> {
  const r = await db.companyRules.findUnique({ where: { id: 1 } });
  if (!r) return { ...DEFAULT_RULES, overtimeRatePercent: 150, missedClockInAlertMinutes: 15, toilExpiryDays: 90, defaultWeekendDays: [5, 6] };
  return {
    ...r,
    ramadanStart: r.ramadanStart ? toDateISO(r.ramadanStart) : null,
    ramadanEnd: r.ramadanEnd ? toDateISO(r.ramadanEnd) : null,
  };
}
