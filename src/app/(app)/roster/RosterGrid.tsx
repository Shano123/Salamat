"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { decideLoan, setCell } from "@/app/actions/roster";
import { useT } from "@/lib/i18n/client";

interface Emp { id: string; name: string; sub: string; skills: string[]; guest: string | null }
interface Tpl { id: string; code: string; name: string; color: string; status: string; type: string }
interface Asg { id: string; employeeId: string; date: string; templateId: string; code: string; color: string; status: string; departmentId: string; departmentName: string; loanStatus: string | null; type: string }
interface Conf { kind: string; severity: string; date: string; employeeId: string | null; message: string }

const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_AR = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const DOW_UR = ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"];

function weekStartOf(d: string) {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
  return dt.toISOString().slice(0, 10);
}

export function RosterGrid(props: {
  departmentId: string;
  dates: string[];
  today: string;
  canEdit: boolean;
  lineManagerTeam: string[] | null;
  publishedWeeks: string[];
  weekendDays: number[];
  employees: Emp[];
  templates: Tpl[];
  assignments: Asg[];
  leave: Array<{ employeeId: string; from: string; to: string }>;
  staffing: Array<{ templateId: string; code: string; skill: string | null; minCount: number }>;
  conflicts: Conf[];
}) {
  const { t, locale } = useT();
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
  const dow = locale === "ar" ? DOW_AR : locale === "ur" ? DOW_UR : DOW_EN;

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
      return [...rest, { id: `tmp-${empId}-${date}`, employeeId: empId, date, templateId: tpl.id, code: tpl.code, color: tpl.color, status: isPublished ? "PUBLISHED" : "DRAFT", departmentId: props.departmentId, departmentName: "", loanStatus: null, type: tpl.type }];
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

  const staffCount = (date: string, templateId: string, skill: string | null) =>
    items.filter((a) => a.date === date && a.departmentId === props.departmentId && a.templateId === templateId && (!skill || props.employees.find((e) => e.id === a.employeeId)?.skills.includes(skill))).length;

  return (
    <div className="stack" style={{ marginBottom: 16 }}>
      {props.canEdit && (
        <div className="card">
          <div className="row between">
            <small className="muted">{t("roster.palette")} Or pick a shift and click cells to paint.</small>
            {pending && <small className="muted">Saving…</small>}
          </div>
          <div className="palette" style={{ marginTop: 8 }}>
            {approved.map((x) => (
              <span
                key={x.id}
                className="chip"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/template", x.id)}
                onClick={() => setBrush(brush === x.id ? null : x.id)}
                style={{ background: x.color, outline: brush === x.id ? "3px solid var(--text)" : undefined }}
                title={x.name}
              >
                {x.code}
              </span>
            ))}
            <span className="chip" style={{ background: "var(--muted)", outline: brush === "CLEAR" ? "3px solid var(--text)" : undefined }} onClick={() => setBrush(brush === "CLEAR" ? null : "CLEAR")} draggable onDragStart={(e) => e.dataTransfer.setData("text/template", "CLEAR")}>
              ✕ Clear
            </span>
            {props.templates.filter((x) => x.status === "PENDING").map((x) => (
              <span key={x.id} className="chip" style={{ background: x.color, opacity: 0.4, cursor: "not-allowed" }} title="Waiting for HR approval">{x.code}</span>
            ))}
          </div>
        </div>
      )}
      {error && <div className="alert danger" role="alert">{error} <button className="small" onClick={() => setError(null)}>×</button></div>}
      <div className="roster-wrap">
        <table className="roster">
          <thead>
            <tr>
              <th className="emp">{t("common.employee")}</th>
              {props.dates.map((d) => {
                const day = new Date(`${d}T00:00:00Z`).getUTCDay();
                return (
                  <th key={d} className={d === props.today ? "today" : ""}>
                    {dow[day]}<br /><small>{d.slice(5)}</small>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {props.employees.map((e) => (
              <tr key={e.id}>
                <td className="emp">
                  <div><strong>{e.name}</strong></div>
                  <small className="muted">{e.sub}</small>
                  {e.guest && <div><span className="badge info">from {e.guest}</span></div>}
                  {weeklyConf(e.id).length > 0 && (
                    <div><span className="badge warn" title={weeklyConf(e.id).map((c) => c.message).join("\n")}>over weekly hours</span></div>
                  )}
                </td>
                {props.dates.map((d) => {
                  const key = `${e.id}|${d}`;
                  const list = cellAsg(e.id, d);
                  const conf = cellConf(e.id, d);
                  const hard = conf.some((c) => c.severity !== "warning");
                  const weekend = props.weekendDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay());
                  const cls = [weekend ? "weekend" : "", d === props.today ? "today" : "", over === key ? "drop" : "", hard ? "has-conflict" : conf.length ? "has-warning" : ""].join(" ");
                  return (
                    <td
                      key={d}
                      className={cls}
                      title={conf.map((c) => c.message).join("\n") || undefined}
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
                      {onLeave(e.id, d) && <span className="chip leave">Leave</span>}
                      {list.map((a) => {
                        const elsewhere = a.departmentId !== props.departmentId;
                        return (
                          <div key={a.id}>
                            <span
                              className={`chip ${a.status === "DRAFT" ? "draft" : ""}`}
                              style={{ background: a.color, opacity: elsewhere || a.loanStatus === "PENDING" ? 0.5 : 1 }}
                              draggable={!elsewhere && editable(e.id)}
                              onDragStart={(ev) => ev.dataTransfer.setData("text/from", `${e.id}|${d}|${a.templateId}`)}
                              title={`${a.code} · ${a.status.toLowerCase()}${elsewhere ? ` · ${a.departmentName}` : ""}${a.loanStatus ? ` · loan ${a.loanStatus.toLowerCase()}` : ""}`}
                            >
                              {a.code}{elsewhere ? "↗" : ""}
                            </span>
                            {a.loanStatus === "PENDING" && !elsewhere && props.canEdit && (
                              <div className="row" style={{ justifyContent: "center", gap: 2, marginTop: 2 }}>
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
              </tr>
            ))}
            {!props.employees.length && (
              <tr>
                <td className="emp muted" colSpan={props.dates.length + 1} style={{ padding: 24, textAlign: "center" }}>
                  No active employees in this department. Choose another department above, or add staff under Employees.
                </td>
              </tr>
            )}
            {props.staffing.map((s, i) => (
              <tr key={i} className="staffing">
                <td className="emp"><small>Min {s.code}{s.skill ? ` · ${s.skill}` : ""}: {s.minCount}</small></td>
                {props.dates.map((d) => {
                  const n = staffCount(d, s.templateId, s.skill);
                  return <td key={d} style={{ color: n < s.minCount ? "var(--danger)" : "var(--ok)", fontWeight: 600 }}>{n}/{s.minCount}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="muted">Striped chips are drafts (employees cannot see them). Faded chips are shifts in another department (↗) or loans waiting for acceptance. Drag a chip to move it; hold Alt to copy.</small>
    </div>
  );
}
