import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/ui";
import { pageGuard, visibleDepartments } from "@/lib/auth";
import { addDays, localDateISO, monthRange } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { buildReport, ReportKind, REPORTS } from "@/lib/services/reports";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string; dept?: string }> }) {
  const user = await pageGuard("reports.view");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const kind = (sp.r && sp.r in REPORTS ? sp.r : "timesheet") as ReportKind;
  const month = monthRange(today);
  const from = sp.from ?? (kind === "daily" ? addDays(today, -1) : month.from);
  const to = sp.to ?? (kind === "daily" ? today : month.to);
  const depts = await visibleDepartments(user);
  let table: Awaited<ReturnType<typeof buildReport>> | null = null;
  let error: string | null = null;
  try {
    table = await buildReport(kind, user, { from, to, departmentId: sp.dept || null });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const qs = (o: Record<string, string>) => new URLSearchParams({ from, to, ...(sp.dept ? { dept: sp.dept } : {}), ...o }).toString();

  return (
    <>
      <PageHeader title={t("nav.reports")} subtitle={`${REPORTS[kind]} · ${from} → ${to}`}>
        <a className="btn" href={`/api/reports/${kind}?${qs({ format: "xlsx" })}`}>Excel</a>
        <a className="btn" href={`/api/reports/${kind}?${qs({ format: "csv" })}`}>CSV</a>
      </PageHeader>
      <nav className="tabs">
        {(Object.keys(REPORTS) as ReportKind[]).map((k) => (
          <Link key={k} href={`/reports?${qs({ r: k })}`} className={k === kind ? "active" : ""}>{REPORTS[k]}</Link>
        ))}
      </nav>
      <form className="row" style={{ marginBottom: 12 }}>
        <input type="hidden" name="r" value={kind} />
        <input type="date" name="from" defaultValue={from} />
        <input type="date" name="to" defaultValue={to} />
        <select name="dept" defaultValue={sp.dept ?? ""}><option value="">{t("common.department")}: {t("common.all")}</option>{depts.map((d) => <option key={d.id} value={d.id}>{locale === "ar" ? d.nameAr : d.nameEn}</option>)}</select>
        <button type="submit">{t("common.filter")}</button>
      </form>
      {error && <div className="alert danger">{error}</div>}
      {table && (
        <div className="table-wrap">
          <table>
            <thead><tr>{table.headers.map((x) => <th key={x}>{x}</th>)}</tr></thead>
            <tbody>
              {table.rows.slice(0, 2000).map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "num" : ""}>{c}</td>)}</tr>
              ))}
              {!table.rows.length && <tr><td colSpan={table.headers.length} className="muted">{t("common.none")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {table && table.rows.length > 2000 && <p className="muted">Showing 2,000 of {table.rows.length} rows; export for the full report.</p>}
    </>
  );
}
