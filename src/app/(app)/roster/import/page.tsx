import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { undoRosterImport } from "@/app/actions/rosterImport";
import { canManageDepartment, pageGuard, visibleDepartments } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, localDateISO, toDateISO, weekStartOf } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/settings";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function RosterImportPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const user = await pageGuard("roster.import");
  const { t } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const depts = (await visibleDepartments(user)).filter((d) => canManageDepartment(user, d.id));
  const dept = depts.find((d) => d.id === sp.dept) ?? depts[0];
  if (!dept) return <p className="muted">No departments you can import for.</p>;
  const rules = await getRules();
  const next = addDays(weekStartOf(localDateISO(new Date(), rules.timezone)), 7);
  const batches = await db.rosterImportBatch.findMany({ where: { departmentId: dept.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const uploaders = await db.user.findMany({ where: { id: { in: batches.map((b) => b.uploadedById) } }, select: { id: true, email: true } });

  return (
    <>
      <PageHeader title={t("nav.rosterImport")} subtitle="Upload a whole roster from Excel. It lands as a draft; nothing reaches employees until you publish.">
        <form className="row">
          <select name="dept" defaultValue={dept.id}>{depts.map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}</select>
          <button type="submit">{t("common.filter")}</button>
        </form>
      </PageHeader>
      <div className="grid grid-2">
        <div className="card">
          <h2>1. Download the template</h2>
          <p className="muted">Pre-filled with {dept.nameEn}&apos;s employees as rows and your dates as columns. Each cell holds a shift code (e.g. D12, N12, M8, OFF, OC). Up to 3 months per file.</p>
          <form action="/api/roster/export" className="form-grid">
            <input type="hidden" name="dept" value={dept.id} />
            <input type="hidden" name="blank" value="1" />
            <label>{t("common.from")}<input type="date" name="from" defaultValue={next} required /></label>
            <label>{t("common.to")}<input type="date" name="to" defaultValue={addDays(next, 27)} required /></label>
            <button type="submit">{t("common.download")} template</button>
          </form>
          <p className="muted" style={{ marginTop: 12 }}>
            Files from other systems can use one row per shift instead: <code>employee_no, date, shift_code, unit/branch</code>.
            To edit the current roster offline, use Export Excel on the roster page and re-import it.
          </p>
        </div>
        <div className="card">
          <h2>2. Upload and check</h2>
          <ImportClient departmentId={dept.id} />
        </div>
      </div>
      <div className="card">
        <h2>Import log</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>File</th><th>Dates</th><th>Mode</th><th className="num">Rows</th><th>{t("common.status")}</th><th /></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{uploaders.find((u) => u.id === b.uploadedById)?.email}</td>
                  <td>{b.fileName}</td>
                  <td>{toDateISO(b.fromDate)} → {toDateISO(b.toDate)}</td>
                  <td>{b.mode.toLowerCase()}</td>
                  <td className="num">{b.rowCount}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td>
                    {b.status === "DRAFT" && (
                      <ActionForm action={undoRosterImport} confirm="Undo this import?">
                        <input type="hidden" name="batchId" value={b.id} />
                        <button className="small" type="submit">Undo</button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
              {!batches.length && <tr><td colSpan={8} className="muted">No imports yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 8 }}><Link href={`/roster?dept=${dept.id}`}>Open the roster grid →</Link></p>
      </div>
    </>
  );
}
