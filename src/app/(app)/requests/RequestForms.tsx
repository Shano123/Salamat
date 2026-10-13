"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { submitRequest } from "@/app/actions/requests";
import { useT } from "@/lib/i18n/client";

export interface Opt {
  value: string;
  label: string;
}

const TYPES = ["LEAVE", "SWAP", "SHIFT_CHANGE", "CORRECTION", "OVERTIME"] as const;
type ReqType = (typeof TYPES)[number];

export function RequestForms(props: {
  initial: ReqType;
  initialDate?: string;
  myShifts: Opt[];
  colleagueShifts: Opt[];
  colleagues: Opt[];
  templates: Opt[];
  leaveTypes: Array<Opt & { attachment: boolean }>;
}) {
  const { t } = useT();
  const [type, setType] = useState<ReqType>(props.initial);
  const [leaveType, setLeaveType] = useState(props.leaveTypes[0]?.value ?? "");
  const label: Record<ReqType, string> = { LEAVE: t("req.leave"), SWAP: `${t("req.swap")} / ${t("req.giveaway")}`, SHIFT_CHANGE: t("req.shiftChange"), CORRECTION: t("req.correction"), OVERTIME: t("req.overtime") };
  const needsAttachment = props.leaveTypes.find((l) => l.value === leaveType)?.attachment;

  return (
    <div className="card">
      <h2>{t("req.new")}</h2>
      <div className="tabs">
        {TYPES.map((ty) => (
          <a key={ty} href="#" className={ty === type ? "active" : ""} onClick={(e) => { e.preventDefault(); setType(ty); }}>{label[ty]}</a>
        ))}
      </div>
      <ActionForm action={submitRequest} resetOnSuccess key={type}>
        <input type="hidden" name="type" value={type} />
        <div className="form-grid">
          {type === "LEAVE" && (
            <>
              <label>{t("common.type")}
                <select name="leaveTypeId" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  {props.leaveTypes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>{t("common.from")}<input type="date" name="from" required /></label>
              <label>{t("common.to")}<input type="date" name="to" /></label>
              <label>Attachment {needsAttachment ? "(required)" : "(optional)"}<input type="file" name="attachment" accept=".pdf,image/*" required={needsAttachment} /></label>
            </>
          )}
          {(type === "SWAP" || type === "SHIFT_CHANGE") && (
            <label>My shift
              <select name="assignmentId" required>
                <option value="">—</option>
                {props.myShifts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
          {type === "SWAP" && (
            <label>Swap with / give to
              <select name="target" required>
                <option value="">—</option>
                <optgroup label="Swap with a colleague's shift">
                  {props.colleagueShifts.map((o) => <option key={o.value} value={`a:${o.value}`}>{o.label}</option>)}
                </optgroup>
                <optgroup label="Give my shift to">
                  {props.colleagues.map((o) => <option key={o.value} value={`e:${o.value}`}>{o.label}</option>)}
                </optgroup>
              </select>
            </label>
          )}
          {type === "SHIFT_CHANGE" && (
            <label>New shift
              <select name="templateId" required>
                {props.templates.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
          {type === "CORRECTION" && <label>{t("common.date")}<input type="date" name="date" defaultValue={props.initialDate} required /></label>}
          {type === "OVERTIME" && (
            <>
              <label>{t("common.date")}<input type="date" name="date" required /></label>
              <label>Shift (optional)
                <select name="assignmentId">
                  <option value="">—</option>
                  {props.myShifts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>Minutes<input type="number" name="minutes" min={15} step={15} defaultValue={60} required /></label>
              <label>Compensation
                <select name="compensation"><option value="PAID">Paid (overtime rate)</option><option value="TOIL">Time off in lieu</option></select>
              </label>
            </>
          )}
        </div>
        {type === "CORRECTION" && (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Punch</th><th>Time</th><th>Next day</th></tr></thead>
            <tbody>
              {[0, 1, 2, 3].map((i) => (
                <tr key={i}>
                  <td><select name={`ptype${i}`} defaultValue={i % 2 ? "OUT" : "IN"}><option value="IN">IN</option><option value="OUT">OUT</option><option value="BREAK_START">Break start</option><option value="BREAK_END">Break end</option></select></td>
                  <td><input type="time" name={`time${i}`} /></td>
                  <td><input type="checkbox" name={`next${i}`} aria-label="Next day" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <label style={{ marginTop: 12 }}>{t("common.reason")}<textarea name="reason" rows={2} required={type === "CORRECTION"} /></label>
        <div className="form-actions"><button className="primary" type="submit">{t("common.submit")}</button></div>
      </ActionForm>
    </div>
  );
}
