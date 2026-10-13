"use client";
import { useActionState, useRef, useState } from "react";
import type { RosterImportResult } from "@/app/actions/rosterImport";
import { importRoster } from "@/app/actions/rosterImport";

function download(base64: string, name: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportClient({ departmentId }: { departmentId: string }) {
  const [state, action, pending] = useActionState(importRoster, null);
  const applyRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState("MERGE");
  const r = state?.data as RosterImportResult | undefined;

  return (
    <form action={action} className="stack">
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="apply" ref={applyRef} defaultValue="0" />
      <div className="form-grid">
        <label>Excel or CSV file<input type="file" name="file" accept=".xlsx,.csv" required /></label>
        <label>Mode
          <select name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="MERGE">Merge — fill empty days only</option>
            <option value="REPLACE">Replace — overwrite those dates</option>
          </select>
        </label>
        {mode === "REPLACE" && <label>Reason (needed if a published week is replaced)<input name="reason" /></label>}
      </div>
      <div className="form-actions">
        <button type="submit" disabled={pending} onClick={() => applyRef.current && (applyRef.current.value = "0")}>Check file</button>
        <button type="submit" className="primary" disabled={pending || !r || r.errors.length > 0 || r.applied} onClick={() => applyRef.current && (applyRef.current.value = "1")}>
          Import as draft
        </button>
        {pending && <small className="muted">Working…</small>}
      </div>
      {state?.error && <div className="alert danger">{state.error}</div>}
      {r && (
        <div className="stack">
          <div className={`alert ${r.applied ? "ok" : r.errors.length ? "danger" : "info"}`}>{state?.ok}</div>
          <div className="grid grid-4">
            <div className="card stat"><span className="label">Layout</span><span className="value" style={{ fontSize: 18 }}>{r.layout === "GRID" ? "Grid" : "One row per shift"}</span></div>
            <div className="card stat"><span className="label">Dates</span><span className="value" style={{ fontSize: 18 }}>{r.from ?? "—"} → {r.to ?? "—"}</span></div>
            <div className="card stat"><span className="label">New / replaced / skipped</span><span className="value">{r.create} / {r.replace} / {r.skipped}</span></div>
            <div className="card stat"><span className="label">Errors</span><span className="value" style={{ color: r.errors.length ? "var(--danger)" : "var(--ok)" }}>{r.errors.length}</span></div>
          </div>
          {r.touchesPublished && <div className="alert warn">This file changes a published week. Affected employees are notified with your reason.</div>}
          {r.errors.length > 0 && (
            <div className="card">
              <div className="row between">
                <h3>Errors by cell</h3>
                {r.errorReport && <button type="button" onClick={() => download(r.errorReport!, "roster-import-errors.xlsx")}>Download error report</button>}
              </div>
              <div className="table-wrap" style={{ maxHeight: 320 }}>
                <table>
                  <thead><tr><th>Row</th><th>Column</th><th>Error</th></tr></thead>
                  <tbody>{r.errors.slice(0, 500).map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.col}</td><td className="cell-error">{e.message}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
          {r.warnings.length > 0 && (
            <details className="card">
              <summary>{r.warnings.length} warning(s) (do not block import)</summary>
              <ul>{r.warnings.slice(0, 200).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
