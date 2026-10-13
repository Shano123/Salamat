"use client";
import { useActionState, useRef, useState } from "react";
import { importPunches, PunchImportResult } from "@/app/actions/punchImport";
import type { PunchMapping } from "@/lib/domain/punchImport";

const FIELDS: Array<{ key: keyof PunchMapping; label: string; required?: boolean }> = [
  { key: "employeeNo", label: "Employee number", required: true },
  { key: "datetime", label: "Date + time (one column)" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "type", label: "Punch type (optional)" },
  { key: "device", label: "Device / branch" },
  { key: "source", label: "Source" },
];

function guess(headers: string[], key: keyof PunchMapping): string {
  const h = headers.map((x) => x.toLowerCase());
  const find = (...needles: string[]) => headers[h.findIndex((x) => needles.some((n) => x.includes(n)))] ?? "";
  switch (key) {
    case "employeeNo": return find("employee", "emp", "user id", "ac-no", "badge", "رقم");
    case "date": return h.some((x) => x.includes("date") && !x.includes("time")) ? find("date") : "";
    case "time": return h.some((x) => x === "time" || (x.includes("time") && !x.includes("date"))) ? headers[h.findIndex((x) => x === "time" || (x.includes("time") && !x.includes("date")))] : "";
    case "datetime": return h.some((x) => x.includes("date") && x.includes("time")) ? find("datetime", "date/time", "date time") : "";
    case "type": return find("type", "state", "status", "check");
    case "device": return find("device", "terminal", "branch", "machine");
    case "source": return find("source", "verify");
  }
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function PunchImportClient({ departments, isHr }: { departments: Array<{ id: string; name: string }>; isHr: boolean }) {
  const [state, action, pending] = useActionState(importPunches, null);
  const stepRef = useRef<HTMLInputElement>(null);
  const [mapping, setMapping] = useState<PunchMapping | null>(null);
  const [brand, setBrand] = useState("");
  const r = state?.data as PunchImportResult | undefined;
  const headers = r?.headers ?? [];
  const current: PunchMapping = mapping ?? (Object.fromEntries(FIELDS.map((f) => [f.key, guess(headers, f.key)])) as unknown as PunchMapping);

  return (
    <form action={action} className="stack">
      <input type="hidden" name="step" ref={stepRef} defaultValue="columns" />
      <input type="hidden" name="mapping" value={JSON.stringify(current)} />
      <div className="form-grid">
        <label>Excel or CSV file (up to 100,000 rows)<input type="file" name="file" accept=".xlsx,.csv" required onChange={() => setMapping(null)} /></label>
        {!isHr && (
          <label>Department<select name="departmentId">{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        )}
      </div>
      <div className="form-actions">
        <button type="submit" disabled={pending} onClick={() => stepRef.current && (stepRef.current.value = "columns")}>1. Read columns</button>
      </div>
      {state?.error && <div className="alert danger">{state.error}</div>}
      {r && (
        <div className="card stack">
          <h3>2. Column mapping</h3>
          <div className="row">
            <label>Saved mapping
              <select
                value=""
                onChange={(e) => {
                  const m = r.mappings.find((x) => x.name === e.target.value);
                  if (m) { setMapping(m.mapping); setBrand(m.name); }
                }}
              >
                <option value="">Choose a device brand…</option>
                {r.mappings.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </label>
            <label>Save as brand<input name="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. ZKTeco K40" /></label>
            <label className="inline"><input type="checkbox" name="saveMapping" defaultChecked /> Remember for next time</label>
          </div>
          <div className="form-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>{f.label}
                <select value={current[f.key] ?? ""} onChange={(e) => setMapping({ ...current, [f.key]: e.target.value || undefined })}>
                  <option value="">—</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <small className="muted">Map either one date+time column, or separate date and time columns. Punches without a type are paired by time against the roster.</small>
          <div className="form-actions">
            <button type="submit" disabled={pending} onClick={() => stepRef.current && (stepRef.current.value = "preview")}>3. Preview</button>
            <button type="submit" className="primary" disabled={pending || r.step !== "preview" || !r.ok} onClick={() => stepRef.current && (stepRef.current.value = "apply")}>4. Import {r.ok ?? 0} punch(es)</button>
          </div>
          {state?.ok && <div className={`alert ${r.step === "applied" ? "ok" : "info"}`}>{state.ok}</div>}
          {r.step === "preview" && (
            <div className="grid grid-3">
              <div className="card stat"><span className="label">Rows OK</span><span className="value" style={{ color: "var(--ok)" }}>{r.ok}</span></div>
              <div className="card stat"><span className="label">Duplicates (skipped)</span><span className="value">{r.duplicates}</span></div>
              <div className="card stat"><span className="label">Errors</span><span className="value" style={{ color: r.errors?.length ? "var(--danger)" : undefined }}>{r.errors?.length}</span></div>
            </div>
          )}
          {!!r.errors?.length && (
            <>
              {r.errorCsv && <div><button type="button" onClick={() => download(r.errorCsv!, "punch-import-errors.csv")}>Download failed rows</button> <small className="muted">Fix and re-upload only these rows.</small></div>}
              <div className="table-wrap" style={{ maxHeight: 260 }}>
                <table><thead><tr><th>Row</th><th>Error</th></tr></thead><tbody>{r.errors.slice(0, 200).map((e, i) => <tr key={i}><td>{e.row}</td><td className="cell-error">{e.message}</td></tr>)}</tbody></table>
              </div>
            </>
          )}
          {!!r.sample?.length && (
            <details><summary>Sample of parsed rows</summary>
              <table><tbody>{r.sample.map((s, i) => <tr key={i}><td>{s.employeeNo}</td><td>{s.time}</td><td>{s.type ?? "auto"}</td></tr>)}</tbody></table>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
