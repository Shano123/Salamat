import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { decidePunchBatch, undoPunchBatch } from "@/app/actions/punchImport";
import { canManageDepartment, pageGuard, visibleDepartments } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { PunchImportClient } from "./PunchImportClient";

export const dynamic = "force-dynamic";

export default async function PunchImportPage() {
  const user = await pageGuard("punches.import");
  const { t } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const isHr = user.role === "HR_ADMIN" || user.role === "SUPER_ADMIN";
  const depts = (await visibleDepartments(user)).filter((d) => canManageDepartment(user, d.id));
  const batches = await db.punchImportBatch.findMany({
    where: isHr ? {} : { uploadedById: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const users = new Map((await db.user.findMany({ where: { id: { in: batches.map((b) => b.uploadedById) } } })).map((u) => [u.id, u.email]));
  return (
    <>
      <PageHeader title={t("nav.punchImport")} subtitle="For offline devices, a new branch, or migrating history from the old system.">
        <a className="btn" href="/api/punches/template">{t("common.download")} template</a>
      </PageHeader>
      {!isHr && <div className="alert info" style={{ marginBottom: 12 }}>Department imports are held until HR approves them.</div>}
      <div className="card"><PunchImportClient isHr={isHr} departments={depts.map((d) => ({ id: d.id, name: d.nameEn }))} /></div>
      <div className="card">
        <h2>Import batches</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>File</th><th>Brand</th><th className="num">OK</th><th className="num">Dups</th><th className="num">Errors</th><th>{t("common.status")}</th><th /></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{users.get(b.uploadedById)}</td>
                  <td>{b.fileName}</td>
                  <td>{b.brand ?? "—"}</td>
                  <td className="num">{b.okCount}</td>
                  <td className="num">{b.dupCount}</td>
                  <td className="num">{b.errorCount}</td>
                  <td><StatusBadge status={b.status} label={b.status === "DRAFT" ? "pending HR" : undefined} /></td>
                  <td>
                    {isHr && b.status === "DRAFT" && (
                      <div className="row">
                        <ActionForm action={decidePunchBatch}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="decision" value="APPROVE" /><button className="small primary">{t("common.approve")}</button></ActionForm>
                        <ActionForm action={decidePunchBatch}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="decision" value="REJECT" /><button className="small">{t("common.reject")}</button></ActionForm>
                      </div>
                    )}
                    {isHr && b.status === "APPLIED" && (
                      <ActionForm action={undoPunchBatch} confirm="Remove every punch from this batch?"><input type="hidden" name="id" value={b.id} /><button className="small danger">Undo</button></ActionForm>
                    )}
                  </td>
                </tr>
              ))}
              {!batches.length && <tr><td colSpan={9} className="muted">{t("common.none")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
