"use client";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { applyRotation, bulkAssign, copyLastWeek, loanEmployee, publishRoster, unpublishWeek } from "@/app/actions/roster";
import { useT } from "@/lib/i18n/client";

interface Opt { id: string; name: string }

const SEV_TONE: Record<string, string> = { blocking: "danger", override: "warn", warning: "info" };

export function RosterTools(props: {
  departmentId: string;
  from: string;
  to: string;
  canEdit: boolean;
  canPublish: boolean;
  anyDraft: boolean;
  publishedWeeks: string[];
  employees: Opt[];
  templates: Array<{ id: string; code: string; name: string }>;
  floatPool: Opt[];
  otherDepartments: Opt[];
  conflicts: Array<{ kind: string; severity: string; date: string; message: string }>;
}) {
  const { t } = useT();
  const router = useRouter();
  const refresh = () => router.refresh();
  const understaffed = props.conflicts.some((c) => c.kind === "UNDERSTAFFED");
  const blocking = props.conflicts.filter((c) => c.severity === "blocking");
  const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const EmpChecks = () => (
    <div className="row" style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
      {props.employees.map((e) => (
        <label key={e.id} className="inline"><input type="checkbox" name="employeeIds" value={e.id} /> {e.name}</label>
      ))}
    </div>
  );

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>{t("roster.conflicts")} ({props.conflicts.length})</h2>
        {props.conflicts.length ? (
          <ul style={{ margin: 0, paddingInlineStart: 18, maxHeight: 280, overflowY: "auto" }}>
            {props.conflicts.map((c, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <span className={`badge ${SEV_TONE[c.severity]}`}>{c.kind.replace("_", " ").toLowerCase()}</span> {c.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{t("roster.noConflicts")}</p>
        )}
        {props.canPublish && (
          <ActionForm action={publishRoster} onDone={refresh}>
            <input type="hidden" name="departmentId" value={props.departmentId} />
            <input type="hidden" name="from" value={props.from} />
            <input type="hidden" name="to" value={props.to} />
            {understaffed && (
              <label style={{ marginTop: 12 }}>{t("roster.override")}<input name="overrideReason" placeholder="Reason (logged)" /></label>
            )}
            <div className="form-actions">
              <button className="primary" type="submit" disabled={!props.anyDraft || blocking.length > 0}>
                {t("roster.publish")} {props.from} → {props.to}
              </button>
              {blocking.length > 0 && <small className="muted">Fix {blocking.length} blocking conflict(s) first.</small>}
              {!props.anyDraft && <small className="muted">No draft changes to publish.</small>}
              <a className="btn" href={`/api/roster/export?dept=${props.departmentId}&from=${props.from}&to=${props.to}`}>{t("common.export")} Excel</a>
            </div>
          </ActionForm>
        )}
        {props.canPublish && props.publishedWeeks.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary>Reopen a published week</summary>
            <ActionForm action={unpublishWeek} onDone={refresh}>
              <input type="hidden" name="departmentId" value={props.departmentId} />
              <div className="form-grid">
                <label>{t("common.week")}<select name="weekStart">{props.publishedWeeks.map((w) => <option key={w}>{w}</option>)}</select></label>
                <label>{t("common.reason")}<input name="reason" required /></label>
              </div>
              <div className="form-actions"><button type="submit">Reopen</button></div>
            </ActionForm>
          </details>
        )}
      </div>

      {props.canEdit && (
        <div className="card stack">
          <h2>Build faster</h2>
          <ActionForm action={copyLastWeek} onDone={refresh}>
            <input type="hidden" name="departmentId" value={props.departmentId} />
            <input type="hidden" name="weekStart" value={props.from} />
            <div className="row"><button type="submit">{t("roster.copyLastWeek")}</button><small className="muted">Fills empty days of the week of {props.from} as draft.</small></div>
          </ActionForm>

          <details>
            <summary>{t("roster.bulk")}</summary>
            <ActionForm action={bulkAssign} onDone={refresh}>
              <input type="hidden" name="departmentId" value={props.departmentId} />
              <EmpChecks />
              <div className="form-grid" style={{ marginTop: 8 }}>
                <label>Shift<select name="templateId">{props.templates.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
                <label>{t("common.from")}<input type="date" name="from" defaultValue={props.from} required /></label>
                <label>{t("common.to")}<input type="date" name="to" defaultValue={props.to} /></label>
                <label>Mode<select name="mode"><option value="MERGE">Fill empty days only</option><option value="REPLACE">Replace drafts</option></select></label>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {dowNames.map((d, i) => <label key={d} className="inline"><input type="checkbox" name="dow" value={i} /> {d}</label>)}
                <small className="muted">(no days ticked = every day)</small>
              </div>
              <div className="form-actions"><button className="primary" type="submit">{t("roster.bulk")}</button></div>
            </ActionForm>
          </details>

          <details>
            <summary>{t("roster.rotation")}</summary>
            <ActionForm action={applyRotation} onDone={refresh}>
              <input type="hidden" name="departmentId" value={props.departmentId} />
              <EmpChecks />
              <div className="form-grid" style={{ marginTop: 8 }}>
                <label>Pattern (codes, OFF for rest)<input name="pattern" placeholder="D12 D12 D12 D12 OFF OFF OFF OFF" required /></label>
                <label>Start<input type="date" name="start" defaultValue={props.from} required /></label>
                <label>Weeks<input type="number" name="weeks" min={1} max={12} defaultValue={4} /></label>
                <label>Stagger per employee (days)<input type="number" name="stagger" min={0} defaultValue={0} /></label>
                <label>Mode<select name="mode"><option value="MERGE">Fill empty days only</option><option value="REPLACE">Replace drafts</option></select></label>
              </div>
              <small className="muted">Examples: 4-on/4-off “D12 D12 D12 D12 OFF OFF OFF OFF”; weekly A/B “M8 M8 M8 M8 M8 OFF OFF E8 E8 E8 E8 E8 OFF OFF”.</small>
              <div className="form-actions"><button className="primary" type="submit">{t("roster.rotation")}</button></div>
            </ActionForm>
          </details>

          <details>
            <summary>Float pool &amp; loans</summary>
            {props.floatPool.length > 0 && (
              <ActionForm action={loanEmployee} onDone={refresh}>
                <input type="hidden" name="hostDepartmentId" value={props.departmentId} />
                <p className="muted">Place a float-pool nurse in this unit for one shift.</p>
                <div className="form-grid">
                  <label>Float nurse<select name="employeeId">{props.floatPool.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
                  <label>{t("common.date")}<input type="date" name="date" defaultValue={props.from} required /></label>
                  <label>Shift<select name="templateId">{props.templates.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></label>
                </div>
                <div className="form-actions"><button type="submit">Add to roster</button></div>
              </ActionForm>
            )}
            <ActionForm action={loanEmployee} onDone={refresh}>
              <p className="muted" style={{ marginTop: 12 }}>Loan one of your staff to another department (host manager must accept).</p>
              <div className="form-grid">
                <label>{t("common.employee")}<select name="employeeId">{props.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
                <label>To department<select name="hostDepartmentId">{props.otherDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
                <label>{t("common.date")}<input type="date" name="date" defaultValue={props.from} required /></label>
                <label>Shift code<select name="templateId">{props.templates.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></label>
              </div>
              <div className="form-actions"><button type="submit">Offer loan</button></div>
            </ActionForm>
          </details>
          <a href={`/open-shifts?dept=${props.departmentId}`}>{t("roster.openShift")} →</a>
          <a href={`/roster/import?dept=${props.departmentId}`}>{t("nav.rosterImport")} →</a>
        </div>
      )}
    </div>
  );
}
