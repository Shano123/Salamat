import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { savePayrollMapping } from "@/app/actions/payroll";
import { pageGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEFAULT_PAYROLL_COLUMNS, mapPayroll, PAYROLL_FIELDS, PayrollColumn } from "@/lib/domain/payroll";
import { localDateISO, monthRange, parseDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { payrollRows } from "@/lib/services/reports";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; mapping?: string }> }) {
  const user = await pageGuard("payroll.export");
  const { t } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const rules = await getRules();
  const periods = await db.attendancePeriod.findMany({ orderBy: { startDate: "desc" }, take: 12 });
  const fallback = monthRange(localDateISO(new Date(), rules.timezone));
  const from = sp.from ?? (periods[0] ? toDateISO(periods[0].startDate) : fallback.from);
  const to = sp.to ?? (periods[0] ? toDateISO(periods[0].endDate) : fallback.to);
  const mappings = await db.columnMapping.findMany({ where: { kind: "PAYROLL" }, orderBy: { name: "asc" } });
  const chosen = mappings.find((m) => m.name === sp.mapping);
  const columns = (chosen?.mapping as unknown as PayrollColumn[]) ?? DEFAULT_PAYROLL_COLUMNS;
  const rows = await payrollRows(user, { from, to });
  const preview = mapPayroll(rows.slice(0, 15), columns);
  const period = periods.find((p) => toDateISO(p.startDate) === from && toDateISO(p.endDate) === to);
  const openRequests = await db.request.count({
    where: { type: { in: ["CORRECTION", "OVERTIME", "LEAVE"] }, status: { in: ["PENDING_L1", "PENDING_L2", "PENDING_HR"] }, createdAt: { lte: parseDateISO(to) } },
  });
  const unapproved = rows.reduce((s, r) => s + r.missingPunches, 0);
  const qs = (o: Record<string, string>) => new URLSearchParams({ from, to, ...(sp.mapping ? { mapping: sp.mapping } : {}), ...o }).toString();

  return (
    <>
      <PageHeader title={t("nav.payroll")} subtitle="Exports approved hours and overtime to payroll. Payroll itself is calculated in the payroll system.">
        <a className="btn primary" href={`/api/payroll?${qs({ format: "csv" })}`}>{t("common.download")} CSV</a>
        <a className="btn" href={`/api/payroll?${qs({ format: "xlsx" })}`}>Excel</a>
      </PageHeader>
      <form className="row" style={{ marginBottom: 12 }}>
        <input type="date" name="from" defaultValue={from} />
        <input type="date" name="to" defaultValue={to} />
        <select name="mapping" defaultValue={sp.mapping ?? ""}>
          <option value="">Default format</option>
          {mappings.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        <button type="submit">{t("common.filter")}</button>
        {periods.map((p) => (
          <Link key={p.id} className="btn small" href={`/payroll?${new URLSearchParams({ from: toDateISO(p.startDate), to: toDateISO(p.endDate), ...(sp.mapping ? { mapping: sp.mapping } : {}) })}`}>
            {toDateISO(p.startDate).slice(0, 7)} <StatusBadge status={p.status} />
          </Link>
        ))}
      </form>
      <div className="stack" style={{ marginBottom: 12 }}>
        {!period || period.status !== "LOCKED" ? <div className="alert warn">This range is not a locked pay period. Lock the period after all corrections are approved so the export cannot change.</div> : <div className="alert ok">Period locked on {period.lockedAt?.toISOString().slice(0, 10)}.</div>}
        {openRequests > 0 && <div className="alert warn">{openRequests} correction / overtime / leave request(s) still pending approval. <Link href="/inbox">Open inbox</Link></div>}
        {unapproved > 0 && <div className="alert warn">{unapproved} shift(s) with a missing punch in this range.</div>}
      </div>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr>{preview.headers.map((x) => <th key={x}>{x}</th>)}</tr></thead>
          <tbody>
            {preview.data.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "num" : ""}>{c}</td>)}</tr>)}
            {!preview.data.length && <tr><td colSpan={preview.headers.length} className="muted">No attendance in this range.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted">{rows.length} employee(s); preview shows the first 15.</p>
      <div className="card">
        <h2>Column mapping</h2>
        <p className="muted">The new payroll system&apos;s format is not known yet, so the export columns are configurable. Leave a header blank to drop that row.</p>
        <ActionForm action={savePayrollMapping}>
          <label style={{ maxWidth: 320 }}>Format name<input name="name" defaultValue={chosen?.name ?? ""} placeholder="e.g. Payroll system v1" required /></label>
          <table style={{ marginTop: 12, maxWidth: 640 }}>
            <thead><tr><th>Column header in file</th><th>Value</th></tr></thead>
            <tbody>
              {[...columns, ...Array.from({ length: 4 }, () => ({ header: "", field: "employeeNo" as const }))].map((c, i) => (
                <tr key={i}>
                  <td><input name="header" defaultValue={c.header} /></td>
                  <td><select name="field" defaultValue={c.field}>{PAYROLL_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}</select></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button></div>
        </ActionForm>
      </div>
    </>
  );
}
