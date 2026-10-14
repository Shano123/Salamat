"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { decideLoan, setCell } from "@/app/actions/roster";
import { useT } from "@/lib/i18n/client";
import { DUTY_GROUPS, GROUP_COLORS, isDutyGroup, RosterGroup, RowCell, summarizeRow } from "@/lib/domain/dutyRoster";

interface Emp { id: string; name: string; employeeNo: string; jobTitle: string; skills: string[]; guest: string | null }
interface Tpl { id: string; code: string; name: string; status: string; type: string; group: RosterGroup; minutes: number; legend: string }
interface Asg { id: string; employeeId: string; date: string; templateId: string; code: string; group: RosterGroup; minutes: number; status: string; departmentId: string; departmentName: string; loanStatus: string | null; type: string }
interface Conf { kind: string; severity: string; date: string; employeeId: string | null; message: string }

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Off-type groups always shown in the legend, as on the Excel roster. */
const ALWAYS_IN_LEGEND: RosterGroup[] = ["Off", "Leave", "Holiday"];

function weekStartOf(d: string) {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const fmtDate = (d: string) => `${d.slice(8, 10)}-${MON[Number(d.slice(5, 7)) - 1]}-${d.slice(0, 4)}`;
const fmtHrs = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));

export function RosterGrid(props: {
  departmentId: string;
  departmentName: string;
  organizationName: string;
  title: string;
  dates: string[];
  today: string;
  canEdit: boolean;
  lineManagerTeam: string[] | null;
  publishedWeeks: string[];
  weekendDays: number[];
  holidays: Array<{ date: string; name: string }>;
  standardHours: number;
  employees: Emp[];
  templates: Tpl[];
  assignments: Asg[];
  leave: Array<{ employeeId: string; from: string; to: string }>;
  staffing: Array<{ templateId: string; code: string; group: RosterGroup; skill: string | null; minCount: number }>;
  conflicts: Conf[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(props.assignments);
  const [brush, setBrush] = useState<string | null>(null); // template id or "CLEAR"
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setItems(props.assignments), [props.assignments]);

  const tplById = new Map(props.templates.map((x) => [x.id, x]));
  const approved = props.templates.filter((x) => x.status === "APPROVED");
  const published = new Set(props.publishedWeeks);
  const holidays = new Map(props.holidays.map((h) => [h.date, h.name]));
  const isWeekend = (d: string) => props.weekendDays.includes(dow(d));
  const working = new Set(props.dates.filter((d) => !isWeekend(d) && !holidays.has(d)));
  const requiredPerPerson = working.size * props.standardHours;

  const cellAsg = (empId: string, date: string) => items.filter((a) => a.employeeId === empId && a.date === date);
  const onLeave = (empId: string, date: string) => props.leave.some((l) => l.employeeId === empId && date >= l.from && date <= l.to);
  const cellConf = (empId: string, date: string) => props.conflicts.filter((c) => c.employeeId === empId && c.date === date && c.kind !== "WEEKLY_HOURS");
  const weeklyConf = (empId: string) => props.conflicts.filter((c) => c.employeeId === empId && c.kind === "WEEKLY_HOURS");
  const editable = (empId: string) => props.canEdit && (!props.lineManagerTeam || props.lineManagerTeam.includes(empId));

  function apply(empId: string, date: string, templateId: string | null) {
    if (!editable(empId)) return;
    const mine = cellAsg(empId, date).find((a) => a.departmentId === props.departmentId);
    if (!mine && !templateId) return;
    if (mine && mine.templateId === templateId) return;
    let reason: string | null = null;
    const isPublished = published.has(weekStartOf(date)) || mine?.status === "PUBLISHED";
    if (isPublished) {
      if (props.lineManagerTeam) {
        setError("Line managers can only edit drafts. Submit a change request instead.");
        return;
      }
      reason = window.prompt(`This roster is published. Reason for changing ${date} (the employee is notified immediately):`);
      if (!reason) return;
    }
    const prev = items;
    const tpl = templateId ? tplById.get(templateId) : null;
    setItems((cur) => {
      const rest = cur.filter((a) => !(a.employeeId === empId && a.date === date && a.departmentId === props.departmentId));
      if (!tpl) return rest;
      return [...rest, { id: `tmp-${empId}-${date}`, employeeId: empId, date, templateId: tpl.id, code: tpl.code, group: tpl.group, minutes: tpl.minutes, status: isPublished ? "PUBLISHED" : "DRAFT", departmentId: props.departmentId, departmentName: "", loanStatus: null, type: tpl.type }];
    });
    startTransition(async () => {
      const r = await setCell({ departmentId: props.departmentId, employeeId: empId, date, templateId, reason });
      if (r?.error) {
        setItems(prev);
        setError(r.error);
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  function loan(id: string, decision: "ACCEPT" | "DECLINE") {
    const fd = new FormData();
    fd.set("assignmentId", id);
    fd.set("decision", decision);
    startTransition(async () => {
      const r = await decideLoan(null, fd);
      if (r?.error) setError(r.error);
      router.refresh();
    });
  }

  // Daily coverage per duty group (this department's shifts only), with the minimum from Staffing.
  const ownOnDuty = (date: string) => items.filter((a) => a.date === date && a.departmentId === props.departmentId && isDutyGroup(a.group) && a.loanStatus !== "DECLINED");
  const minByGroup = new Map<RosterGroup, number>();
  for (const s of props.staffing) if (!s.skill) minByGroup.set(s.group, (minByGroup.get(s.group) ?? 0) + s.minCount);
  const usedGroups = new Set(items.filter((a) => a.departmentId === props.departmentId).map((a) => a.group));
  const coverageGroups = DUTY_GROUPS.filter((g) => usedGroups.has(g) || minByGroup.has(g) || approved.some((x) => x.group === g));
  const skillRows = props.staffing.filter((s) => s.skill);
  const skillCount = (date: string, templateId: string, skill: string) =>
    items.filter((a) => a.date === date && a.departmentId === props.departmentId && a.templateId === templateId && props.employees.find((e) => e.id === a.employeeId)?.skills.includes(skill)).length;
  const lowOn = (date: string) => coverageGroups.some((g) => ownOnDuty(date).filter((a) => a.group === g).length < (minByGroup.get(g) ?? 0));

  const groupOrder: RosterGroup[] = [...DUTY_GROUPS, "On-call", "Off", "Leave", "Holiday", "Vacation"];
  const legend = props.templates
    .filter((x) => x.status === "APPROVED" && (items.some((a) => a.templateId === x.id) || ALWAYS_IN_LEGEND.includes(x.group)))
    .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));
  const totalsCols = 6;
  const fixedCols = 4;

  return (
    <div className="stack" style={{ marginBottom: 16 }}>
      {props.canEdit && (
        <div className="card toolbar no-print">
          <div className="row between">
            <strong style={{ fontSize: 13 }}>Shift codes</strong>
            <small className="muted">{pending ? "Saving…" : "Pick a code, then click cells to fill them. Drag a cell to move it (hold Alt to copy)."}</small>
          </div>
          <div className="palette" style={{ marginTop: 10 }}>
            {approved.map((x) => (
              <button
                type="button"
                key={x.id}
                className={`code-chip${brush === x.id ? " selected" : ""}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/template", x.id)}
                onClick={() => setBrush(brush === x.id ? null : x.id)}
                style={{ background: GROUP_COLORS[x.group].bg, color: GROUP_COLORS[x.group].fg }}
                title={x.legend}
              >
                {x.code}
              </button>
            ))}
            <button type="button" className={`code-chip clear${brush === "CLEAR" ? " selected" : ""}`} onClick={() => setBrush(brush === "CLEAR" ? null : "CLEAR")} draggable onDragStart={(e) => e.dataTransfer.setData("text/template", "CLEAR")}>
              Clear
            </button>
            {props.templates.filter((x) => x.status === "PENDING").map((x) => (
              <span key={x.id} className="code-chip" style={{ opacity: 0.45, cursor: "not-allowed" }} title="Waiting for HR approval">{x.code}</span>
            ))}
          </div>
        </div>
      )}
      {error && <div className="alert danger no-print" role="alert">{error} <button className="small" onClick={() => setError(null)}>×</button></div>}

      <section className="sheet">
        <header className="sheet-head">
          <div>
            <div className="sheet-org">{props.organizationName}</div>
            <div className="sheet-title">{props.title}</div>
          </div>
          <dl className="sheet-meta">
            <div><dt>Department</dt><dd>{props.departmentName}</dd></div>
            <div><dt>Period from</dt><dd>{fmtDate(props.dates[0])}</dd></div>
            <div><dt>Period to</dt><dd>{fmtDate(props.dates[props.dates.length - 1])}</dd></div>
            <div><dt>Working days</dt><dd>{working.size}</dd></div>
            <div><dt>Std hrs / day</dt><dd>{fmtHrs(props.standardHours)}</dd></div>
            <div><dt>Required hrs / person</dt><dd>{fmtHrs(requiredPerPerson)}</dd></div>
          </dl>
        </header>

        <div className="roster-wrap">
          <table className="roster">
            <thead>
              <tr>
                <th className="c-no" rowSpan={2}>No.</th>
                <th className="c-name" rowSpan={2}>Staff Name</th>
                <th className="c-id" rowSpan={2}>Staff ID</th>
                <th className="c-desig" rowSpan={2}>Designation</th>
                {props.dates.map((d) => (
                  <th key={d} className={["c-day", isWeekend(d) ? "weekend" : "", holidays.has(d) ? "holiday" : "", d === props.today ? "today" : ""].join(" ")} title={holidays.get(d)}>
                    <span className="d-num">{d.slice(8, 10)}</span>
                    <span className="d-mon">{MON[Number(d.slice(5, 7)) - 1]}</span>
                  </th>
                ))}
                <th className="c-tot" rowSpan={2}>Duty<br />Days</th>
                <th className="c-tot" rowSpan={2}>Off /<br />Hol</th>
                <th className="c-tot" rowSpan={2}>Leave /<br />Vac</th>
                <th className="c-tot" rowSpan={2}>Planned<br />Hrs</th>
                <th className="c-tot" rowSpan={2}>Req.<br />Hrs</th>
                <th className="c-tot" rowSpan={2}>+/-<br />Hrs</th>
              </tr>
              <tr className="dow-row">
                {props.dates.map((d) => (
                  <th key={d} className={["c-day", isWeekend(d) ? "weekend" : "", holidays.has(d) ? "holiday" : "", d === props.today ? "today" : ""].join(" ")}>{DOW[dow(d)]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.employees.map((e, idx) => {
                const cells = new Map<string, RowCell[]>();
                const leaveDates = new Set<string>();
                for (const d of props.dates) {
                  cells.set(d, cellAsg(e.id, d).filter((a) => a.loanStatus !== "DECLINED").map((a) => ({ group: a.group, minutes: a.minutes })));
                  if (onLeave(e.id, d)) leaveDates.add(d);
                }
                const sum = summarizeRow({ dates: props.dates, cells, approvedLeave: leaveDates, working, standardHours: props.standardHours });
                return (
                  <tr key={e.id}>
                    <td className="c-no">{idx + 1}</td>
                    <td className="c-name">
                      <span className="emp-name">{e.name}</span>
                      {e.guest && <span className="badge info">from {e.guest}</span>}
                      {weeklyConf(e.id).length > 0 && <span className="warn-flag no-print" title={weeklyConf(e.id).map((c) => c.message).join("\n")}>!</span>}
                    </td>
                    <td className="c-id">{e.employeeNo}</td>
                    <td className="c-desig">{e.jobTitle}</td>
                    {props.dates.map((d) => {
                      const key = `${e.id}|${d}`;
                      const list = cellAsg(e.id, d);
                      const conf = cellConf(e.id, d);
                      const hard = conf.some((c) => c.severity !== "warning");
                      const main = list.find((a) => a.departmentId === props.departmentId) ?? list[0];
                      const color = main ? GROUP_COLORS[main.group] : onLeave(e.id, d) ? GROUP_COLORS.Leave : null;
                      const cls = [
                        "c-day cell",
                        isWeekend(d) ? "weekend" : "",
                        holidays.has(d) ? "holiday" : "",
                        d === props.today ? "today" : "",
                        over === key ? "drop" : "",
                        main?.status === "DRAFT" ? "draft" : "",
                        editable(e.id) ? "editable" : "",
                        hard ? "has-conflict" : conf.length ? "has-warning" : "",
                      ].join(" ");
                      return (
                        <td
                          key={d}
                          className={cls}
                          style={color ? { background: color.bg, color: color.fg } : undefined}
                          title={[main ? `${main.code} · ${tplById.get(main.templateId)?.legend ?? ""} · ${main.status.toLowerCase()}` : "", ...conf.map((c) => c.message)].filter(Boolean).join("\n") || undefined}
                          onDragOver={(ev) => { if (editable(e.id)) { ev.preventDefault(); setOver(key); } }}
                          onDragLeave={() => setOver(null)}
                          onDrop={(ev) => {
                            ev.preventDefault();
                            setOver(null);
                            const tid = ev.dataTransfer.getData("text/template");
                            const from = ev.dataTransfer.getData("text/from");
                            if (from) {
                              const [fe, fd, ftid] = from.split("|");
                              if (fe === e.id && fd === d) return;
                              apply(e.id, d, ftid);
                              if (!ev.altKey) apply(fe, fd, null); // hold Alt to copy instead of move
                            } else if (tid) apply(e.id, d, tid === "CLEAR" ? null : tid);
                          }}
                          onClick={() => brush && apply(e.id, d, brush === "CLEAR" ? null : brush)}
                        >
                          {!list.length && onLeave(e.id, d) && <span className="code" title="Approved leave">L</span>}
                          {list.map((a) => {
                            const elsewhere = a.departmentId !== props.departmentId;
                            return (
                              <div key={a.id}>
                                <span
                                  className="code"
                                  style={{ opacity: elsewhere || a.loanStatus === "PENDING" ? 0.5 : 1 }}
                                  draggable={!elsewhere && editable(e.id)}
                                  onDragStart={(ev) => ev.dataTransfer.setData("text/from", `${e.id}|${d}|${a.templateId}`)}
                                  title={elsewhere ? `${a.code} · ${a.departmentName}` : undefined}
                                >
                                  {a.code}{elsewhere ? "↗" : ""}
                                </span>
                                {a.loanStatus === "PENDING" && !elsewhere && props.canEdit && (
                                  <div className="row no-print" style={{ justifyContent: "center", gap: 2, marginTop: 2 }}>
                                    <button className="small" onClick={(ev) => { ev.stopPropagation(); loan(a.id, "ACCEPT"); }}>✓</button>
                                    <button className="small" onClick={(ev) => { ev.stopPropagation(); loan(a.id, "DECLINE"); }}>✕</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                    <td className="c-tot">{sum.dutyDays}</td>
                    <td className="c-tot">{sum.offDays}</td>
                    <td className="c-tot">{sum.leaveDays}</td>
                    <td className="c-tot">{fmtHrs(sum.plannedHours)}</td>
                    <td className="c-tot">{fmtHrs(sum.requiredHours)}</td>
                    <td className={`c-tot diff ${sum.diffHours < 0 ? "neg" : sum.diffHours > 0 ? "pos" : ""}`}>{sum.diffHours > 0 ? "+" : ""}{fmtHrs(sum.diffHours)}</td>
                  </tr>
                );
              })}
              {!props.employees.length && (
                <tr>
                  <td className="muted" colSpan={props.dates.length + fixedCols + totalsCols} style={{ padding: 24, textAlign: "center" }}>
                    No active employees in this department. Choose another department above, or add staff under Employees.
                  </td>
                </tr>
              )}
            </tbody>
            <tbody className="coverage">
              <tr className="section">
                <td className="c-no" />
                <td className="c-name">Daily coverage <small>(staff on duty)</small></td>
                <td className="c-id">Min req.</td>
                <td className="c-desig" />
                {props.dates.map((d) => <td key={d} className={`c-day${isWeekend(d) ? " weekend" : ""}${holidays.has(d) ? " holiday" : ""}`} />)}
                <td colSpan={totalsCols} rowSpan={coverageGroups.length + skillRows.length + 3} className="coverage-note">
                  Duty Days = days with a working shift. Req. Hrs = working days × std hrs (weekend &amp; holidays excluded; approved leave deducted). +/- = Planned minus Required.
                </td>
              </tr>
              {coverageGroups.map((g) => {
                const min = minByGroup.get(g) ?? 0;
                return (
                  <tr key={g}>
                    <td className="c-no"><span className="swatch" style={{ background: GROUP_COLORS[g].bg, borderColor: GROUP_COLORS[g].fg }} /></td>
                    <td className="c-name">{g}</td>
                    <td className="c-id">{min || "—"}</td>
                    <td className="c-desig" />
                    {props.dates.map((d) => {
                      const n = ownOnDuty(d).filter((a) => a.group === g).length;
                      return <td key={d} className={`c-day count${n < min ? " low" : ""}`}>{n}</td>;
                    })}
                  </tr>
                );
              })}
              {skillRows.map((s, i) => (
                <tr key={`skill-${i}`}>
                  <td className="c-no" />
                  <td className="c-name">{s.code} · {s.skill}</td>
                  <td className="c-id">{s.minCount}</td>
                  <td className="c-desig" />
                  {props.dates.map((d) => {
                    const n = skillCount(d, s.templateId, s.skill!);
                    return <td key={d} className={`c-day count${n < s.minCount ? " low" : ""}`}>{n}</td>;
                  })}
                </tr>
              ))}
              <tr className="total">
                <td className="c-no" />
                <td className="c-name">Total on duty</td>
                <td className="c-id" />
                <td className="c-desig" />
                {props.dates.map((d) => <td key={d} className="c-day count">{ownOnDuty(d).length}</td>)}
              </tr>
              <tr className="status">
                <td className="c-no" />
                <td className="c-name">Coverage status</td>
                <td className="c-id" colSpan={2}><small>LOW = below minimum</small></td>
                {props.dates.map((d) => {
                  const low = lowOn(d);
                  return <td key={d} className={`c-day ${low ? "low" : "ok"}`}>{low ? "LOW" : "OK"}</td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="sheet-legend">
          <div className="legend-title">Shift legend <small>Weekend columns shaded · public holidays in red · striped cells are drafts (not yet published)</small></div>
          <div className="legend-items">
            {legend.map((x) => (
              <span key={x.id} className="legend-item">
                <span className="code-chip" style={{ background: GROUP_COLORS[x.group].bg, color: GROUP_COLORS[x.group].fg }}>{x.code}</span>
                {x.legend}
              </span>
            ))}
            {!legend.length && <small className="muted">No shifts on this roster yet.</small>}
          </div>
          {props.holidays.length > 0 && (
            <div className="legend-items" style={{ marginTop: 6 }}>
              {props.holidays.map((h) => <span key={h.date} className="legend-item"><span className="code-chip" style={{ background: GROUP_COLORS.Holiday.bg, color: GROUP_COLORS.Holiday.fg }}>{h.date.slice(8)}/{h.date.slice(5, 7)}</span>{h.name}</span>)}
            </div>
          )}
        </div>

        <div className="sheet-remarks"><strong>Remarks / swaps:</strong></div>
        <div className="sheet-sign">
          {[["Prepared by", "Head of Department / In-charge"], ["Reviewed by", "Nursing Director / HR"], ["Approved by", "Medical Director"]].map(([a, b]) => (
            <div key={a}>
              <div className="sign-role">{a} <small>({b})</small></div>
              <div className="sign-line">Name:</div>
              <div className="sign-line">Signature:</div>
              <div className="sign-line">Date:</div>
            </div>
          ))}
        </div>
      </section>
      <small className="muted no-print">{t("roster.palette")} Faded codes are shifts in another department (↗) or loans waiting for acceptance.</small>
    </div>
  );
}
