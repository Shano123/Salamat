"use client";
import { useActionState, useRef } from "react";
import { importEmployees } from "@/app/actions/employees";

export function EmployeeImport() {
  const [state, action, pending] = useActionState(importEmployees, null);
  const applyRef = useRef<HTMLInputElement>(null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="apply" ref={applyRef} defaultValue="0" />
      <div className="form-grid">
        <label>CSV or Excel<input type="file" name="file" accept=".csv,.xlsx" required /></label>
        <label>Initial password for new logins<input name="initialPassword" placeholder="ChangeMe!2026" /></label>
      </div>
      <div className="form-actions">
        <button type="submit" disabled={pending} onClick={() => applyRef.current && (applyRef.current.value = "0")}>Validate</button>
        <button type="submit" className="primary" disabled={pending || !state?.ok || state.ok.startsWith("Imported")} onClick={() => applyRef.current && (applyRef.current.value = "1")}>Import</button>
        <a className="btn" href="/api/employees/template">Template</a>
      </div>
      {state?.error && <pre className="alert danger" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{state.error}</pre>}
      {state?.ok && <div className="alert ok">{state.ok}</div>}
      <small className="muted">Existing employee numbers are updated; new ones are created. Rows with an email get an employee login.</small>
    </form>
  );
}
