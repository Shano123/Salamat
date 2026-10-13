"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { saveTemplate } from "@/app/actions/templates";

export interface TemplateValues {
  id?: string;
  code?: string;
  name?: string;
  color?: string;
  type?: string;
  start?: string;
  end?: string;
  split2Start?: string;
  split2End?: string;
  coreStart?: string;
  coreEnd?: string;
  totalHours?: number | null;
  breakMin?: number;
  paidBreak?: boolean;
  graceInMin?: number;
  graceOutMin?: number;
  overnight?: boolean;
  isClinical?: boolean;
  isRamadan?: boolean;
  payCode?: string | null;
  requiredSkills?: string;
  ownerDepartmentId?: string | null;
}

export function TemplateForm({ values, departments, allowCompanyWide, defaultGrace }: { values: TemplateValues; departments: Array<{ id: string; name: string }>; allowCompanyWide: boolean; defaultGrace: number }) {
  const [type, setType] = useState(values.type ?? "FIXED");
  return (
    <ActionForm action={saveTemplate} resetOnSuccess={!values.id}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="form-grid">
        <label>Code<input name="code" defaultValue={values.code} placeholder="D12" maxLength={8} required /></label>
        <label>Name<input name="name" defaultValue={values.name} placeholder="Day 12h" required /></label>
        <label>Colour<input type="color" name="color" defaultValue={values.color ?? "#0e7c66"} /></label>
        <label>Type
          <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="FIXED">Fixed</option>
            <option value="SPLIT">Split shift</option>
            <option value="FLEXIBLE">Flexible (core + total hours)</option>
            <option value="ON_CALL">On-call / standby</option>
            <option value="OFF">Off day</option>
          </select>
        </label>
        <label>Department
          <select name="ownerDepartmentId" defaultValue={values.ownerDepartmentId ?? ""}>
            {allowCompanyWide && <option value="">Company-wide</option>}
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>
      {type !== "OFF" && (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label>Start<input type="time" name="start" defaultValue={values.start ?? "07:00"} required /></label>
          <label>End<input type="time" name="end" defaultValue={values.end ?? "15:00"} required /></label>
          {type === "SPLIT" && (
            <>
              <label>2nd start<input type="time" name="split2Start" defaultValue={values.split2Start} required /></label>
              <label>2nd end<input type="time" name="split2End" defaultValue={values.split2End} required /></label>
            </>
          )}
          {type === "FLEXIBLE" && (
            <>
              <label>Core start<input type="time" name="coreStart" defaultValue={values.coreStart} required /></label>
              <label>Core end<input type="time" name="coreEnd" defaultValue={values.coreEnd} required /></label>
              <label>Total hours<input type="number" step="0.25" name="totalHours" defaultValue={values.totalHours ?? 8} required /></label>
            </>
          )}
          <label>Unpaid break (min)<input type="number" name="breakMin" min={0} defaultValue={values.breakMin ?? 0} /></label>
          <label>Grace in (min)<input type="number" name="graceInMin" min={0} defaultValue={values.graceInMin ?? defaultGrace} /></label>
          <label>Grace out (min)<input type="number" name="graceOutMin" min={0} defaultValue={values.graceOutMin ?? 0} /></label>
          <label>Pay code<input name="payCode" defaultValue={values.payCode ?? ""} placeholder="e.g. ONCALL" /></label>
          <label>Required skills<input name="requiredSkills" defaultValue={values.requiredSkills} placeholder="BLS, ACLS" /></label>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <label className="inline"><input type="checkbox" name="overnight" defaultChecked={values.overnight} /> Overnight</label>
        <label className="inline"><input type="checkbox" name="paidBreak" defaultChecked={values.paidBreak} /> Break is paid</label>
        <label className="inline"><input type="checkbox" name="isClinical" defaultChecked={values.isClinical} /> Clinical (needs valid license)</label>
        <label className="inline"><input type="checkbox" name="isRamadan" defaultChecked={values.isRamadan} /> Ramadan template</label>
      </div>
      <div className="form-actions"><button className="primary" type="submit">{values.id ? "Save changes" : "Create template"}</button></div>
    </ActionForm>
  );
}
