import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader } from "@/components/ui";
import { saveRules } from "@/app/actions/settings";
import { pageGuard } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SettingsPage() {
  const user = await pageGuard("rules.edit");
  const { t } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const r = await getRules();
  const F = ({ name, label, step = 1, value }: { name: string; label: string; step?: number; value: number }) => (
    <label>{label}<input type="number" name={name} step={step} defaultValue={value} required /></label>
  );
  return (
    <>
      <PageHeader title={t("nav.settings")} subtitle="Defaults assume Saudi Labor Law; confirm each with your legal / HR team before launch." />
      <ActionForm action={saveRules}>
        <div className="stack">
          <fieldset>
            <legend>Working hours</legend>
            <div className="form-grid">
              <F name="maxDailyHours" label="Max hours per day" step={0.5} value={r.maxDailyHours} />
              <F name="maxWeeklyHours" label="Max hours per week" step={0.5} value={r.maxWeeklyHours} />
              <F name="minRestHours" label="Min rest between shifts (h)" step={0.5} value={r.minRestHours} />
              <F name="minBreakMinutes" label="Min break (min)" value={r.minBreakMinutes} />
              <F name="breakRequiredAfterHours" label="Break required after (h)" step={0.5} value={r.breakRequiredAfterHours} />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">Default weekend:</span>
              {DOW.map((d, i) => <label key={d} className="inline"><input type="checkbox" name="defaultWeekendDays" value={i} defaultChecked={r.defaultWeekendDays.includes(i)} /> {d}</label>)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Ramadan (Muslim employees)</legend>
            <div className="form-grid">
              <F name="ramadanMaxDailyHours" label="Max hours per day" step={0.5} value={r.ramadanMaxDailyHours} />
              <F name="ramadanMaxWeeklyHours" label="Max hours per week" step={0.5} value={r.ramadanMaxWeeklyHours} />
              <label>Ramadan start<input type="date" name="ramadanStart" defaultValue={r.ramadanStart ?? ""} /></label>
              <label>Ramadan end<input type="date" name="ramadanEnd" defaultValue={r.ramadanEnd ?? ""} /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Attendance</legend>
            <div className="form-grid">
              <F name="graceMinutes" label="Default grace (late) min" value={r.graceMinutes} />
              <label>Rounding<select name="roundingMinutes" defaultValue={r.roundingMinutes}>{[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m ? `Down to ${m} min` : "None"}</option>)}</select></label>
              <F name="overtimeRatePercent" label="Overtime rate %" value={r.overtimeRatePercent} />
              <F name="toilExpiryDays" label="Time off in lieu expires after (days)" value={r.toilExpiryDays} />
              <F name="correctionWindowDays" label="Employee correction window (days)" value={r.correctionWindowDays} />
              <F name="missedClockInAlertMinutes" label="Missed clock-in alert after (min)" value={r.missedClockInAlertMinutes} />
            </div>
            <p className="muted" style={{ marginTop: 8 }}>Late = clock-in after shift start + grace. Absent = no clock-in by shift end and no approved leave. Overnight shifts belong to the date they start. Overtime counts only when pre-approved.</p>
          </fieldset>
          <fieldset>
            <legend>Roster</legend>
            <div className="form-grid">
              <label>Hospital name (printed on rosters)<input name="organizationName" defaultValue={r.organizationName} required /></label>
              <F name="rosterStartDay" label="Roster period starts on day (1 = calendar month)" value={r.rosterStartDay} />
              <F name="standardDailyHours" label="Standard duty hours per working day" step={0.5} value={r.standardDailyHours} />
              <F name="publishDeadlineDays" label="Publish deadline (days before week)" value={r.publishDeadlineDays} />
              <F name="editNoticeHours" label="Short-notice edit window (h)" value={r.editNoticeHours} />
              <label>Timezone<input name="timezone" defaultValue={r.timezone} /></label>
            </div>
          </fieldset>
          <label>{t("common.reason")} (logged)<input name="reason" /></label>
          <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button></div>
        </div>
      </ActionForm>
    </>
  );
}
